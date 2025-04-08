/**
 * Module xử lý các chức năng liên quan đến streaming (producer)
 */

// Biến lưu trữ trạng thái
let producers = []; // [ { socketId1, roomName1, producer, }, ... ]

/**
 * Thêm producer mới vào danh sách
 * @param {Object} producer - Đối tượng producer từ mediasoup
 * @param {string} roomName - Tên phòng
 * @param {string} socketId - ID của socket
 * @param {Object} peers - Đối tượng chứa thông tin về các peer
 * @returns {void}
 */
export const addProducer = (producer, roomName, socketId, peers) => {
  producers = [
    ...producers,
    { socketId, producer, roomName, }
  ];

  peers[socketId] = {
    ...peers[socketId],
    producers: [
      ...peers[socketId].producers,
      producer.id,
    ]
  };
};

/**
 * Lấy danh sách producers trong phòng
 * @param {string} socketId - ID của socket
 * @param {Object} peers - Đối tượng chứa thông tin về các peer
 * @returns {Array} - Danh sách ID của các producer
 */
export const getProducers = (socketId, peers) => {
  const { roomName } = peers[socketId];

  let producerList = [];
  producers.forEach(producerData => {
    if (producerData.socketId !== socketId && producerData.roomName === roomName) {
      producerList = [...producerList, producerData.producer.id];
    }
  });

  return producerList;
};

/**
 * Thông báo cho các consumer biết có producer mới
 * @param {string} roomName - Tên phòng
 * @param {string} socketId - ID của socket
 * @param {string} id - ID của producer
 * @param {Object} peers - Đối tượng chứa thông tin về các peer
 * @returns {void}
 */
export const informConsumers = (roomName, socketId, id, peers) => {
  console.log(`just joined, id ${id} ${roomName}, ${socketId}`);
  // A new producer just joined
  // let all consumers to consume this producer
  producers.forEach(producerData => {
    if (producerData.socketId !== socketId && producerData.roomName === roomName) {
      const producerSocket = peers[producerData.socketId].socket;
      // use socket to send producer id to producer
      producerSocket.emit('new-producer', { producerId: id });
    }
  });
};

/**
 * Xóa producer khi người dùng ngắt kết nối
 * @param {string} socketId - ID của socket
 * @returns {void}
 */
export const removeProducer = (socketId) => {
  producers.forEach(producer => {
    if (producer.socketId === socketId) {
      producer.producer.close();
    }
  });
  producers = producers.filter(producer => producer.socketId !== socketId);
};

/**
 * Lấy số lượng producer hiện tại
 * @returns {number} - Số lượng producer
 */
export const getProducersCount = () => {
  return producers.length;
}; 