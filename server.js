// server.js
const express = require('express');
const http = require('http');
const {
 Server
} = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static client files
app.use(express.static(path.join(__dirname, 'public')));

// Track connected devices per room
const rooms = {};

io.on('connection', socket => {
 socket.on('host-create', roomId => {
  socket.join(roomId);
  socket.isHost = true;
  rooms[roomId] = rooms[roomId] || {
   count: 0, host: socket.id
  };
  rooms[roomId].count = 1;
  rooms[roomId].host = socket.id;
  io.to(roomId).emit('update-count', rooms[roomId].count);

  // Start periodic sync
  const interval = setInterval(() => {
   const currentTime = socket.videoCurrentTime || 0;
   io.to(roomId).emit('host-time', currentTime);
  }, 2000);

  socket.syncInterval = interval;
 });

 socket.on('join-room', roomId => {
  if (!rooms[roomId]) {
   socket.emit('error', 'Room does not exist');
   return;
  }
  socket.join(roomId);
  rooms[roomId].count++;
  io.to(roomId).emit('update-count', rooms[roomId].count);
  // Ask host for current time to sync new joiner
  socket.to(roomId).emit('sync-request', socket.id);
 });

 socket.on('sync-time',
  ({
   targetId, currentTime
  }) => {
   io.to(targetId).emit('sync', currentTime);
  });

 socket.on('control',
  ({
   roomId, action, time
  }) => {
   // Only host should send this
   io.to(roomId).emit('control', {
    action, time
   });
  });

 socket.on('disconnecting',
  () => {
   if (socket.syncInterval) clearInterval(socket.syncInterval);
   const roomsJoined = Array.from(socket.rooms).filter(r => r !== socket.id);
   roomsJoined.forEach(roomId => {
    if (rooms[roomId]) {
     rooms[roomId].count--;
     io.to(roomId).emit('update-count', rooms[roomId].count);
     if (rooms[roomId].count === 0) delete rooms[roomId];
    }
   });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));