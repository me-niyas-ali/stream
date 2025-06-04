// rooms.js
export const rooms = new Map();

export function createRoom(socketId) {
  const id = (Math.floor(1000 + Math.random() * 9000)).toString();
  rooms.set(id, {
    hostId: socketId,
    clients: new Set([socketId]),
    filePath: null
  });
  return id;
}

export function joinRoom(id, socketId) {
  const room = rooms.get(id);
  if (room) {
    room.clients.add(socketId);
    return true;
  }
  return false;
}

export function leaveRoom(socketId) {
  for (const [id, room] of rooms.entries()) {
    room.clients.delete(socketId);
    if (room.clients.size === 0) rooms.delete(id);
  }
}

export function getRoomInfo(id) {
  const room = rooms.get(id);
  if (!room) return null;
  return {
    clientCount: room.clients.size,
    hostId: room.hostId,
    hasFile: !!room.filePath
  };
}
