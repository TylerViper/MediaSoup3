//index.js
const io = require('socket.io-client')
const mediasoupClient = require('mediasoup-client')
const producerModule = require('./producer')
const consumerModule = require('./consumer')

const roomName = window.location.pathname.split('/')[2]
console.log("roomName: ", roomName)

const socket = io("/mediasoup")

socket.on('connection-success', ({ socketId }) => {
  console.log(socketId)
  log(socketId)
  // getLocalStream()
})

let device
let rtpCapabilities

// A device is an endpoint connecting to a Router on the
// server side to send/recive media
const createDevice = async (isConsumeOnly = false) => {
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

    // Thiết lập device cho cả producer và consumer
    producerModule.setDevice(device, rtpCapabilities)
    consumerModule.setDevice(device)

    if(isConsumeOnly){
      return producerModule.getProducersThenConsume(socket, log)
    }
    // once the device loads, create transport
    const { transport } = await producerModule.createSendTransport(socket, log)
    
    // Kết nối transport và tạo producer
    await producerModule.connectSendTransport(socket, log)
    
    // Thiết lập xử lý sự kiện khi producer đóng
    consumerModule.handleProducerClosed(socket, log, videoContainer)

  } catch (error) {
    console.log(error)
    log(error)
    if (error.name === 'UnsupportedError')
      console.warn('browser not supported')
      log('browser not supported')
  }
}

const joinRoom = (isConsumeOnly = false) => {
  socket.emit('joinRoom', { roomName }, (data) => {
    console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`)
    log(`Router RTP Capabilities... ${data.rtpCapabilities}`)
    // we assign to local variable and will be used when
    // loading the client Device (see createDevice above)
    rtpCapabilities = data.rtpCapabilities

    // once we have rtpCapabilities from the Router, create Device
    createDevice(isConsumeOnly)
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

const streamSuccess = (stream) => {
  localVideo.srcObject = stream;
  log("Stream: " + stream);
  log('Stream tracks: ' + stream.getTracks());

  let audioParams = {};
  let videoParams = {};

  if (stream.getAudioTracks().length > 0) {
    audioParams = { track: stream.getAudioTracks()[0] };
  } else {
    log('No audio track available');
  }

  if (stream.getVideoTracks().length > 0) {
    videoParams = { track: stream.getVideoTracks()[0] };
  } else {
    log('No video track available');
  }

  // Thiết lập các tham số cho producer
  producerModule.setMediaParams(videoParams, audioParams);

  joinRoom();
}

// server informs the client of a new producer just joined
socket.on('new-producer', ({ producerId }) => {
  consumerModule.signalNewConsumerTransport(socket, log, producerId, videoContainer);
});

const consumeOnly = () => {
  return joinRoom(true);
}

document.getElementById('btnLocalVideo').addEventListener('click', getLocalStream);
document.getElementById('btnConsumeOnly').addEventListener('click', consumeOnly);