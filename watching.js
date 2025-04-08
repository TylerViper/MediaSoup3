/**
 * Module xử lý các chức năng liên quan đến watching (consumer)
 */

// Biến lưu trữ trạng thái
let consumers = []; // [ { socketId1, roomName1, consumer, }, ... ]

/**
 * Thêm consumer mới vào danh sách
 * @param {Object} consumer - Đối tượng consumer từ mediasoup
 * @param {string} roomName - Tên phòng
 * @param {string} socketId - ID của socket
 * @param {Object} peers - Đối tượng chứa thông tin về các peer
 * @returns {void}
 */
export const addConsumer = (consumer, roomName, socketId, peers) => {
  // add the consumer to the consumers list
  consumers = [
    ...consumers,
    { socketId, consumer, roomName, }
  ];

  // add the consumer id to the peers list
  peers[socketId] = {
    ...peers[socketId],
    consumers: [
      ...peers[socketId].consumers,
      consumer.id,
    ]
  };
};

/**
 * Tìm consumer theo ID
 * @param {string} serverConsumerId - ID của consumer
 * @returns {Object|null} - Đối tượng consumer hoặc null nếu không tìm thấy
 */
export const findConsumer = (serverConsumerId) => {
  const consumerData = consumers.find(consumerData => consumerData.consumer.id === serverConsumerId);
  return consumerData ? consumerData.consumer : null;
};

/**
 * Xóa consumer khi người dùng ngắt kết nối
 * @param {string} socketId - ID của socket
 * @returns {void}
 */
export const removeConsumer = (socketId) => {
  consumers.forEach(consumer => {
    if (consumer.socketId === socketId) {
      consumer.consumer.close();
    }
  });
  consumers = consumers.filter(consumer => consumer.socketId !== socketId);
};

/**
 * Xử lý sự kiện khi producer đóng kết nối
 * @param {Object} socket - Đối tượng socket
 * @param {string} remoteProducerId - ID của producer
 * @param {Object} consumerTransport - Transport của consumer
 * @param {Array} transports - Danh sách các transport
 * @returns {void}
 */
export const handleProducerClose = (socket, remoteProducerId, consumerTransport, transports) => {
  console.log('producer of consumer closed');
  socket.emit('producer-closed', { remoteProducerId });

  consumerTransport.close([]);
  transports = transports.filter(transportData => transportData.transport.id !== consumerTransport.id);
  const consumer = findConsumer(remoteProducerId);
  if (consumer) {
    consumer.close();
    consumers = consumers.filter(consumerData => consumerData.consumer.id !== consumer.id);
  }
}; 