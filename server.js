const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store active rooms
const rooms = new Map();

// API endpoint to create a room
app.post('/api/room', (req, res) => {
  const roomId = Math.floor(1000 + Math.random() * 9000).toString();
  rooms.set(roomId, {
    users: new Map(), // socket.id -> {isHost, peerId}
    hostId: null
  });
  res.json({ roomId });
});

// API endpoint to check if room exists
app.get('/api/room/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  if (rooms.has(roomId)) {
    res.json({ exists: true });
  } else {
    res.status(404).json({ exists: false });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join-room', (roomId, isHost) => {
    if (!rooms.has(roomId)) {
      socket.emit('room-error', 'Room does not exist');
      return;
    }

    currentRoom = roomId;
    socket.join(roomId);
    const room = rooms.get(roomId);

    if (isHost) {
      room.hostId = socket.id;
    }

    room.users.set(socket.id, { isHost });
    
    // Notify about new connection
    io.to(roomId).emit('user-count', room.users.size);
    socket.emit('connection-status', 'Connected to server');

    // Notify host about new viewer
    if (!isHost && room.hostId) {
      io.to(room.hostId).emit('new-viewer', socket.id);
    }
  });

  // WebRTC signaling
  socket.on('offer', (targetId, offer) => {
    io.to(targetId).emit('offer', socket.id, offer);
  });

  socket.on('answer', (targetId, answer) => {
    io.to(targetId).emit('answer', socket.id, answer);
  });

  socket.on('ice-candidate', (targetId, candidate) => {
    io.to(targetId).emit('ice-candidate', socket.id, candidate);
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.users.delete(socket.id);

      if (room.hostId === socket.id) {
        // Host disconnected - close room
        io.to(currentRoom).emit('host-disconnected');
        rooms.delete(currentRoom);
      } else {
        // Viewer disconnected
        io.to(currentRoom).emit('user-count', room.users.size);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});