// consumer.js
const mediasoupClient = require('mediasoup-client')

let device
let consumerTransports = []
let consumingTransports = []

// Hàm để thiết lập device
const setDevice = (newDevice) => {
  device = newDevice;
}

// Hàm để tạo transport cho consumer
const signalNewConsumerTransport = async (socket, log, remoteProducerId) => {
  console.log("signalNewConsumerTransport")
  log("signalNewConsumerTransport")
  console.log(remoteProducerId)
  log(remoteProducerId)

  //check if we are already consuming the remoteProducerId
  if (consumingTransports.includes(remoteProducerId)) return;
  consumingTransports.push(remoteProducerId);

  return new Promise((resolve, reject) => {
    socket.emit('createWebRtcTransport', { consumer: true }, ({ params }) => {
      // The server sends back params needed 
      // to create Send Transport on the client side
      if (params.error) {
        console.log(params.error)
        log(params.error)
        reject(params.error)
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
        reject(error)
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

      connectRecvTransport(socket, log, consumerTransport, remoteProducerId, params.id)
        .then(resolve)
        .catch(reject);
    })
  })
}

// Hàm để kết nối transport và tạo consumer
const connectRecvTransport = async (socket, log, consumerTransport, remoteProducerId, serverConsumerTransportId) => {
  // for consumer, we need to tell the server first
  // to create a consumer based on the rtpCapabilities and consume
  // if the router can consume, it will send back a set of params as below
  return new Promise((resolve, reject) => {
    socket.emit('consume', {
      rtpCapabilities: device.rtpCapabilities,
      remoteProducerId,
      serverConsumerTransportId,
    }, async ({ params }) => {
      if (params.error) {
        console.log('Cannot Consume')
        log('Cannot Consume')
        reject(params.error)
        return
      }

      console.log(`Consumer Params`)
      log(`Consumer Params`)
      console.log(params)
      log(params)
      // then consume with the local consumer transport
      // which creates a consumer
      try {
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
        
        resolve({ consumer, consumerTransport });
      } catch (error) {
        reject(error);
      }
    })
  })
}

// Hàm để xử lý khi producer đóng
const handleProducerClosed = (socket, log) => {
  socket.on('producer-closed', ({ remoteProducerId }) => {
    // server notification is received when a producer is closed
    // we need to close the client-side consumer and associated transport
    const producerToClose = consumerTransports.find(transportData => transportData.producerId === remoteProducerId)
    if (producerToClose) {
      producerToClose.consumerTransport.close()
      producerToClose.consumer.close()

      // remove the consumer transport from the list
      consumerTransports = consumerTransports.filter(transportData => transportData.producerId !== remoteProducerId)

      // remove the video div element
      const elementToRemove = document.getElementById(`td-${remoteProducerId}`)
      if (elementToRemove) {
        videoContainer.removeChild(elementToRemove)
      }
    }
  })
}

// Hàm để lấy thông tin về consumer
const getConsumerInfo = () => {
  return {
    consumerTransports,
    consumingTransports
  };
}

module.exports = {
  setDevice,
  signalNewConsumerTransport,
  handleProducerClosed,
  getConsumerInfo
}; 