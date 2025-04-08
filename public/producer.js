// producer.js
const mediasoupClient = require('mediasoup-client')
const consumerModule = require('./consumer')

let device
let rtpCapabilities
let producerTransport
let audioProducer
let videoProducer
let videoParams
let audioParams

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

// Khởi tạo các tham số
videoParams = { params };
audioParams = {};

// Hàm để thiết lập device và rtpCapabilities
const setDevice = (newDevice, newRtpCapabilities) => {
  device = newDevice;
  rtpCapabilities = newRtpCapabilities;
}

// Hàm để thiết lập các tham số cho video và audio
const setMediaParams = (newVideoParams, newAudioParams) => {
  videoParams = newVideoParams;
  audioParams = newAudioParams;
}

// Hàm để tạo transport cho producer
const createSendTransport = (socket, log) => {
  return new Promise((resolve, reject) => {
    // see server's socket.on('createWebRtcTransport', sender?, ...)
    // this is a call from Producer, so sender = true
    socket.emit('createWebRtcTransport', { consumer: false }, ({ params }) => {
      // The server sends back params needed 
      // to create Send Transport on the client side
      if (params.error) {
        console.log(params.error)
        log(params.error)
        reject(params.error)
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
            if (producersExist) {
              getProducersThenConsume(socket, log);
              resolve({ producersExist: true });
            } else {
              resolve({ producersExist: false });
            }
          })
        } catch (error) {
          errback(error)
        }
      })

      resolve({ transport: producerTransport });
    })
  })
}

// Hàm để kết nối transport và tạo producer
const connectSendTransport = async (socket, log) => {
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
  
  return { videoProducer, audioProducer };
}

// Hàm để lấy thông tin về producer
const getProducerInfo = () => {
  return {
    videoProducer,
    audioProducer,
    producerTransport
  };
}

// Hàm để lấy danh sách các producer
const getProducersThenConsume = (socket, log) => {
  socket.emit('getProducers', producerIds => {
    console.log(producerIds)
    log(producerIds)
    // for each of the producer create a consumer
    // producerIds.forEach(id => signalNewConsumerTransport(id))
    producerIds.forEach(id => consumerModule.signalNewConsumerTransport(socket, log, id))
  })
}

module.exports = {
  setDevice,
  setMediaParams,
  createSendTransport,
  connectSendTransport,
  getProducerInfo,
  getProducersThenConsume
}; 