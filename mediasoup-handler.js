import mediasoup from 'mediasoup';
import * as streaming from './streaming.js';
import * as watching from './watching.js';

let worker;
let rooms = {};          // { roomName1: { Router, rooms: [ sicketId1, ... ] }, ...}
let peers = {};          // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,] }, consumers = [id1, id2,], peerDetails }, ...}
let transports = [];     // [ { socketId1, roomName1, transport, consumer }, ... ]

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
];

const createWorker = async () => {
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  });
  console.log(`worker pid ${worker.pid}`);

  worker.on('died', error => {
    console.error('mediasoup worker has died');
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
};

const createWebRtcTransport = async (router) => {
  return new Promise(async (resolve, reject) => {
    try {
      const webRtcTransport_options = {
        listenIps: [
          {
            ip: '0.0.0.0',
            announcedIp: process.env.ANNOUNCEDIP,
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      };

      let transport = await router.createWebRtcTransport(webRtcTransport_options);
      console.log(`transport id: ${transport.id}`);

      transport.on('dtlsstatechange', dtlsState => {
        if (dtlsState === 'closed') {
          transport.close();
        }
      });

      transport.on('close', () => {
        console.log('transport closed');
      });

      resolve(transport);
    } catch (error) {
      reject(error);
    }
  });
};

const createRoom = async (roomName, socketId) => {
  let router1;
  let peers = [];
  if (rooms[roomName]) {
    router1 = rooms[roomName].router;
    peers = rooms[roomName].peers || [];
  } else {
    router1 = await worker.createRouter({ mediaCodecs });
  }
  
  console.log(`Router ID: ${router1.id}`, peers.length);

  rooms[roomName] = {
    router: router1,
    peers: [...peers, socketId],
  };

  return router1;
};

const getTransport = (socketId) => {
  const [producerTransport] = transports.filter(transport => transport.socketId === socketId && !transport.consumer);
  return producerTransport.transport;
};

const addTransport = (socket, transport, roomName, consumer) => {
  transports = [
    ...transports,
    { socketId: socket.id, transport, roomName, consumer, }
  ];

  peers[socket.id] = {
    ...peers[socket.id],
    transports: [
      ...peers[socket.id].transports,
      transport.id,
    ]
  };
};

const removeItems = (items, socketId, type) => {
  items.forEach(item => {
    if (item.socketId === socketId) {
      item[type].close();
    }
  });
  items = items.filter(item => item.socketId !== socketId);
  return items;
};

const setupSocketHandlers = (socket) => {
  console.log(socket.id);
  socket.emit('connection-success', {
    socketId: socket.id,
  });

  socket.on('disconnect', () => {
    console.log('peer disconnected');
    watching.removeConsumer(socket.id);
    streaming.removeProducer(socket.id);
    transports = removeItems(transports, socket.id,'transport');
  
    if (peers[socket.id]) {
      const { roomName } = peers[socket.id];
      delete peers[socket.id];
  
      rooms[roomName] = {
        router: rooms[roomName].router,
        peers: rooms[roomName].peers.filter(socketId => socketId !== socket.id)
      };
    }
  });

  socket.on('joinRoom', async ({ roomName }, callback) => {
    const router1 = await createRoom(roomName, socket.id);

    peers[socket.id] = {
      socket,
      roomName,
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        name: '',
        isAdmin: false,
      }
    };

    const rtpCapabilities = router1.rtpCapabilities;
    callback({ rtpCapabilities });
  });

  socket.on('getProducers', callback => {
    const producerList = streaming.getProducers(socket.id, peers);
    callback(producerList);
  });

  socket.on('createWebRtcTransport', async ({ consumer }, callback) => {
    const roomName = peers[socket.id].roomName;
    const router = rooms[roomName].router;

    createWebRtcTransport(router).then(
      transport => {
        callback({
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          }
        });

        addTransport(socket, transport, roomName, consumer);
      },
      error => {
        console.log(error);
      });
  });

  socket.on('transport-connect', ({ dtlsParameters }) => {
    console.log('DTLS PARAMS... ', { dtlsParameters });
    getTransport(socket.id).connect({ dtlsParameters });
  });

  socket.on('transport-produce', async ({ kind, rtpParameters, appData }, callback) => {
    const producer = await getTransport(socket.id).produce({
      kind,
      rtpParameters,
    });

    const { roomName } = peers[socket.id];

    streaming.addProducer(producer, roomName, socket.id, peers);
    streaming.informConsumers(roomName, socket.id, producer.id, peers);

    console.log('Producer ID: ', producer.id, producer.kind);

    producer.on('transportclose', () => {
      console.log('transport for this producer closed ');
      producer.close();
    });

    callback({
      id: producer.id,
      producersExist: streaming.getProducersCount() > 1 ? true : false
    });
  });

  socket.on('transport-recv-connect', async ({ dtlsParameters, serverConsumerTransportId }) => {
    console.log(`DTLS PARAMS: ${dtlsParameters}`);
    const consumerTransport = transports.find(transportData => (
      transportData.consumer && transportData.transport.id == serverConsumerTransportId
    )).transport;
    await consumerTransport.connect({ dtlsParameters });
  });

  socket.on('consume', async ({ rtpCapabilities, remoteProducerId, serverConsumerTransportId }, callback) => {
    try {
      const { roomName } = peers[socket.id];
      const router = rooms[roomName].router;
      let consumerTransport = transports.find(transportData => (
        transportData.consumer && transportData.transport.id == serverConsumerTransportId
      )).transport;

      if (router.canConsume({
        producerId: remoteProducerId,
        rtpCapabilities
      })) {
        const consumer = await consumerTransport.consume({
          producerId: remoteProducerId,
          rtpCapabilities,
          paused: true,
        });

        consumer.on('transportclose', () => {
          console.log('transport close from consumer');
        });

        consumer.on('producerclose', () => {
          watching.handleProducerClose(socket, remoteProducerId, consumerTransport, transports);
        });

        watching.addConsumer(consumer, roomName, socket.id, peers);

        const params = {
          id: consumer.id,
          producerId: remoteProducerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          serverConsumerId: consumer.id,
        };

        callback({ params });
      }
    } catch (error) {
      console.log(error.message);
      callback({
        params: {
          error: error
        }
      });
    }
  });

  socket.on('consumer-resume', async ({ serverConsumerId }) => {
    console.log('consumer resume');
    const consumer = watching.findConsumer(serverConsumerId);
    if (consumer) {
      await consumer.resume();
    }
  });
};

export {
  createWorker,
  setupSocketHandlers,
  worker
}; 