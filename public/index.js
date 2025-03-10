//index.js
const io = require('socket.io-client')
const mediasoupClient = require('mediasoup-client')

const roomName = window.location.pathname.split('/')[2]

const socket = io("/mediasoup")

socket.on('connection-success', ({ socketId }) => {
  console.log(socketId)
  log(socketId)
  // getLocalStream()
})

let device
let rtpCapabilities
let producerTransport
let consumerTransports = []
let audioProducer
let videoProducer
let consumer
let isProducer = false

// https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerOptions
// https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
let params = {
  // mediasoup params
  encodings: [
    {
      rid: 'r0',
      maxBitrate: 100000,
      scalabilityMode: 'S1T3',
    },
    {
      rid: 'r1',
      maxBitrate: 300000,
      scalabilityMode: 'S1T3',
    },
    {
      rid: 'r2',
      maxBitrate: 900000,
      scalabilityMode: 'S1T3',
    },
  ],
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
  codecOptions: {
    videoGoogleStartBitrate: 1000
  }
}

let audioParams;
let videoParams = { params };
let consumingTransports = [];

const joinRoom = () => {
  socket.emit('joinRoom', { roomName }, (data) => {
    console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`)
    log(`Router RTP Capabilities... ${data.rtpCapabilities}`)
    // we assign to local variable and will be used when
    // loading the client Device (see createDevice above)
    rtpCapabilities = data.rtpCapabilities

    // once we have rtpCapabilities from the Router, create Device
    createDevice()
  })
}

const logArea = document.getElementById('logArea');

const log = (message) => {
  logArea.value += message + '\n';
  logArea.scrollTop = logArea.scrollHeight;
};

const getLocalStream = async () => {
  log("getLocalStream");
  try {
    // Request permissions to access the camera and microphone
    await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    const devices = await navigator.mediaDevices.enumerateDevices();
    log("Devices: " + JSON.stringify(devices));
    
    let rearCameraId = null;
    let frontCameraId = null;

    devices.forEach(device => {
      if (device.kind === 'videoinput') {
        log("Device label: " + device.label);
        if (device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('rear')) {
          rearCameraId = device.deviceId;
        } else if (device.label.toLowerCase().includes('front')) {
          frontCameraId = device.deviceId;
        }
      }
    });

    log("rearCameraId: " + rearCameraId);
    log("frontCameraId: " + frontCameraId);

    let videoStream = null;

    const isPhone = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    log("isPhone: " + isPhone);
    log("======================");
    
    if (isPhone && rearCameraId) {
      log("Using rear camera");
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: rearCameraId },
        audio: true
      });
    } else if(isPhone && frontCameraId) {
        log("Using front camera");
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: frontCameraId },
          audio: true
        });
    } else {
      log("No media stream found");
      return;
    }

    log("Stream obtained: " + videoStream);
    return streamSuccess(videoStream);
  } catch (error) {
    log("Error getLocalStream 1: " + error.message);
  }

  try {
    log("Using display media");
    videoStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: {
          max: 1920,
        },
        height: {
          max: 1080,
        }
      },
      audio: false
    });
    return streamSuccess(videoStream);
  } catch (error) {
    log("Error getLocalStream 2: " + error.message);
  }
}
// ...existing code...
const streamSuccess = (stream) => {
  const localVideo = document.getElementById('localVideo');
  localVideo.srcObject = stream;
  localVideo.play().catch(error => {
    console.error('Error playing local video:', error);
    log('Error playing local video:', error);
  });

  log("Stream: " + stream);
  log('Stream tracks: ' + stream.getTracks());

  if (stream.getAudioTracks().length > 0) {
    audioParams = { track: stream.getAudioTracks()[0], ...audioParams };
  } else {
    log('No audio track available');
  }

  if (stream.getVideoTracks().length > 0) {
    videoParams = { track: stream.getVideoTracks()[0], ...videoParams };
  } else {
    log('No video track available');
  }

  joinRoom();
}
// ...existing code...

document.getElementById('btnLocalVideo').addEventListener('click', getLocalStream);

// OG CODE WHICH WORKS
// const getLocalStream = () => {
//   console.log("getLocalStream")
//   navigator.mediaDevices.getDisplayMedia({
//     video: {
//       width: {
//         max: 1920,
//       },
//       height: {
//         max: 1080,
//       }
//     },
//     audio: false
//   }).then(streamSuccess).catch(error => {
//     console.log(error.message)
//   })
// }

// A device is an endpoint connecting to a Router on the
// server side to send/recive media
const createDevice = async () => {
  try {
    device = new mediasoupClient.Device()

    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
    // Loads the device with RTP capabilities of the Router (server side)
    await device.load({
      // see getRtpCapabilities() below
      routerRtpCapabilities: rtpCapabilities
    })

    console.log('Device RTP Capabilities', device.rtpCapabilities)
    log('Device RTP Capabilities', device.rtpCapabilities)

    // once the device loads, create transport
    createSendTransport()

  } catch (error) {
    console.log(error)
    log(error)
    if (error.name === 'UnsupportedError')
      console.warn('browser not supported')
      log('browser not supported')
  }
}

const createSendTransport = () => {
  // see server's socket.on('createWebRtcTransport', sender?, ...)
  // this is a call from Producer, so sender = true
  socket.emit('createWebRtcTransport', { consumer: false }, ({ params }) => {
    // The server sends back params needed 
    // to create Send Transport on the client side
    if (params.error) {
      console.log(params.error)
      log(params.error)
      return
    }
    console.log(`createWebRtcTransport`)
    log(`createWebRtcTransport`)
    console.log(params)
    log(params)

    // creates a new WebRTC Transport to send media
    // based on the server's producer transport params
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
    producerTransport = device.createSendTransport({
      ...params,
      // iceServers: [
      //   { urls: "stun:stun.l.google.com:19302" }
      // ]
    })

    // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
    // this event is raised when a first call to transport.produce() is made
    // see connectSendTransport() below
    producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        // Signal local DTLS parameters to the server side transport
        // see server's socket.on('transport-connect', ...)
        await socket.emit('transport-connect', {
          dtlsParameters,
        })

        // Tell the transport that parameters were transmitted.
        callback()

      } catch (error) {
        errback(error)
      }
    })

    producerTransport.on('produce', async (parameters, callback, errback) => {
      console.log('Producer Transport Produce')
      log('Producer Transport Produce')
      console.log(parameters)
      log(parameters)

      try {
        // tell the server to create a Producer
        // with the following parameters and produce
        // and expect back a server side producer id
        // see server's socket.on('transport-produce', ...)
        await socket.emit('transport-produce', {
          kind: parameters.kind,
          rtpParameters: parameters.rtpParameters,
          appData: parameters.appData,
        }, ({ id, producersExist }) => {
          // Tell the transport that parameters were transmitted and provide it with the
          // server side producer's id.
          callback({ id })

          // if producers exist, then join room
          if (producersExist) getProducers()
        })
      } catch (error) {
        errback(error)
      }
    })

    connectSendTransport()
  })
}

const connectSendTransport = async () => {
  // we now call produce() to instruct the producer transport
  // to send media to the Router
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
  // this action will trigger the 'connect' and 'produce' events above
  
  // audioProducer = await producerTransport.produce(audioParams);
  videoProducer = await producerTransport.produce(videoParams);

  // audioProducer.on('trackended', () => {
  //   console.log('audio track ended')

  //   // close audio track
  // })

  // audioProducer.on('transportclose', () => {
  //   console.log('audio transport ended')

  //   // close audio track
  // })
  
  videoProducer.on('trackended', () => {
    console.log('video track ended')
    log('video track ended')

    // close video track
  })

  videoProducer.on('transportclose', () => {
    console.log('video transport ended')
    log('video transport ended')

    // close video track
  })
}

const signalNewConsumerTransport = async (remoteProducerId) => {
  console.log("signalNewConsumerTransport")
  log("signalNewConsumerTransport")
  console.log(remoteProducerId)
  log(remoteProducerId)

  //check if we are already consuming the remoteProducerId
  if (consumingTransports.includes(remoteProducerId)) return;
  consumingTransports.push(remoteProducerId);

  await socket.emit('createWebRtcTransport', { consumer: true }, ({ params }) => {
    // The server sends back params needed 
    // to create Send Transport on the client side
    if (params.error) {
      console.log(params.error)
      log(params.error)
      return
    }
    console.log(`createWebRtcTransport2...`)
    log(`createWebRtcTransport2...`)
    console.log(params)
    log(params)

    let consumerTransport
    try {
      consumerTransport = device.createRecvTransport({
        ...params,
        // iceServers: [
        //   { urls: 'stun:stun.l.google.com:19302' },
        //   { urls: 'turn:YOUR_TURN_SERVER', username: 'YOUR_USERNAME', credential: 'YOUR_CREDENTIAL' }
        // ]
      })
    } catch (error) {
      // exceptions: 
      // {InvalidStateError} if not loaded
      // {TypeError} if wrong arguments.
      console.log(error)
      log(error)
      return
    }

    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        // Signal local DTLS parameters to the server side transport
        // see server's socket.on('transport-recv-connect', ...)
        await socket.emit('transport-recv-connect', {
          dtlsParameters,
          serverConsumerTransportId: params.id,
        })

        // Tell the transport that parameters were transmitted.
        callback()
      } catch (error) {
        // Tell the transport that something was wrong
        errback(error)
      }
    })

    connectRecvTransport(consumerTransport, remoteProducerId, params.id)
  })
}

// server informs the client of a new producer just joined
socket.on('new-producer', ({ producerId }) => signalNewConsumerTransport(producerId))

const getProducers = () => {
  socket.emit('getProducers', producerIds => {
    console.log(producerIds)
    log(producerIds)
    // for each of the producer create a consumer
    // producerIds.forEach(id => signalNewConsumerTransport(id))
    producerIds.forEach(signalNewConsumerTransport)
  })
}

const connectRecvTransport = async (consumerTransport, remoteProducerId, serverConsumerTransportId) => {
  // for consumer, we need to tell the server first
  // to create a consumer based on the rtpCapabilities and consume
  // if the router can consume, it will send back a set of params as below
  await socket.emit('consume', {
    rtpCapabilities: device.rtpCapabilities,
    remoteProducerId,
    serverConsumerTransportId,
  }, async ({ params }) => {
    if (params.error) {
      console.log('Cannot Consume')
      log('Cannot Consume')
      return
    }

    console.log(`Consumer Params`)
    log(`Consumer Params`)
    console.log(params)
    log(params)
    // then consume with the local consumer transport
    // which creates a consumer
    const consumer = await consumerTransport.consume({
      id: params.id,
      producerId: params.producerId,
      kind: params.kind,
      rtpParameters: params.rtpParameters
    })

    console.log('Consumer Codec:', consumer.rtpParameters.codecs)
    log('Consumer Codec:', consumer.rtpParameters.codecs)

    consumerTransports = [
      ...consumerTransports,
      {
        consumerTransport,
        serverConsumerTransportId: params.id,
        producerId: remoteProducerId,
        consumer,
      },
    ]

    // create a new div element for the new consumer media
    const newElem = document.createElement('div')
    newElem.setAttribute('id', `td-${remoteProducerId}`)

    if (params.kind == 'audio') {
      //append to the audio container
      newElem.innerHTML = '<audio id="' + remoteProducerId + '" autoplay></audio>'
    } else {
      newElem.setAttribute('class', 'remoteVideo')
      newElem.innerHTML = '<video id="' + remoteProducerId + '" autoplay class="video" playsinline></video>'
    }

    videoContainer.appendChild(newElem)

    // destructure and retrieve the video track from the producer
    const { track } = consumer

    document.getElementById(remoteProducerId).srcObject = new MediaStream([track])

    // the server consumer started with media paused
    // so we need to inform the server to resume
    socket.emit('consumer-resume', { serverConsumerId: params.serverConsumerId })
  })
}

socket.on('producer-closed', ({ remoteProducerId }) => {
  // server notification is received when a producer is closed
  // we need to close the client-side consumer and associated transport
  const producerToClose = consumerTransports.find(transportData => transportData.producerId === remoteProducerId)
  producerToClose.consumerTransport.close()
  producerToClose.consumer.close()

  // remove the consumer transport from the list
  consumerTransports = consumerTransports.filter(transportData => transportData.producerId !== remoteProducerId)

  // remove the video div element
  videoContainer.removeChild(document.getElementById(`td-${remoteProducerId}`))
})

document.getElementById('btnLocalVideo').addEventListener('click', getLocalStream)