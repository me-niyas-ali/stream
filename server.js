const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO logic (same as before)
io.on('connection', socket => {
  let currentRoom = null;

  socket.on('join-room', ({ roomId, isHost }) => {
    currentRoom = roomId;
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = { host: isHost ? socket.id : null, clients: [] };
    }

    rooms[roomId].clients.push(socket.id);

    io.to(roomId).emit('viewer-count', rooms[roomId].clients.length);

    if (isHost) {
      rooms[roomId].host = socket.id;
    }

    socket.on('video-control', data => {
      if (socket.id === rooms[roomId].host) {
        socket.to(roomId).emit('video-control', data);
      }
    });

    socket.on('sync-request', () => {
      if (rooms[roomId].host) {
        io.to(rooms[roomId].host).emit('sync-request', socket.id);
      }
    });

    socket.on('sync-response', ({ to, time }) => {
      io.to(to).emit('sync-response', time);
    });

    socket.on('disconnect', () => {
      if (currentRoom && rooms[currentRoom]) {
        rooms[currentRoom].clients = rooms[currentRoom].clients.filter(id => id !== socket.id);
        io.to(currentRoom).emit('viewer-count', rooms[currentRoom].clients.length);
        if (rooms[currentRoom].clients.length === 0) {
          delete rooms[currentRoom];
        }
      }
    });
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});