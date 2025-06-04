const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');

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

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const roomId = req.params.roomId;
    const dir = `uploads/${roomId}`;
    fs.ensureDirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

// Store active rooms
const rooms = new Map();

// Clean up uploads directory on startup
fs.emptyDirSync('uploads');

// API endpoint to create a room
app.post('/api/room', (req, res) => {
  const roomId = Math.floor(1000 + Math.random() * 9000).toString();
  rooms.set(roomId, {
    users: new Set(),
    videoInfo: null,
    playbackState: { isPlaying: false, currentTime: 0 }
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

// Handle file upload
app.post('/api/upload/:roomId', upload.single('video'), (req, res) => {
  const roomId = req.params.roomId;
  if (!rooms.has(roomId)) {
    return res.status(404).send('Room not found');
  }
  
  const room = rooms.get(roomId);
  if (room.videoInfo) {
    try {
      fs.unlinkSync(path.join('uploads', roomId, room.videoInfo.filename));
    } catch (err) {
      console.error('Error deleting old video:', err);
    }
  }
  
  room.videoInfo = {
    filename: req.file.originalname,
    path: req.file.path,
    mimetype: req.file.mimetype
  };
  
  // Notify all clients in the room about the new video
  io.to(roomId).emit('video-ready', { 
    url: `/api/stream/${roomId}/${encodeURIComponent(req.file.originalname)}`
  });
  
  res.json({ success: true });
});

// Video streaming endpoint
app.get('/api/stream/:roomId/:filename', (req, res) => {
  const roomId = req.params.roomId;
  const filename = decodeURIComponent(req.params.filename);
  
  if (!rooms.has(roomId)) {
    return res.status(404).send('Room not found');
  }
  
  const room = rooms.get(roomId);
  if (!room.videoInfo || room.videoInfo.filename !== filename) {
    return res.status(404).send('Video not found');
  }
  
  const videoPath = room.videoInfo.path;
  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(videoPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': room.videoInfo.mimetype,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': room.videoInfo.mimetype,
    };
    res.writeHead(200, head);
    fs.createReadStream(videoPath).pipe(res);
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  let currentRoom = null;
  
  socket.on('join-room', (roomId) => {
    if (!rooms.has(roomId)) {
      socket.emit('room-error', 'Room does not exist');
      return;
    }
    
    currentRoom = roomId;
    socket.join(roomId);
    const room = rooms.get(roomId);
    room.users.add(socket.id);
    
    // Notify about new connection
    io.to(roomId).emit('user-count', room.users.size);
    socket.emit('connection-status', 'Connected to server');
    
    // Send current video and playback state to new user
    if (room.videoInfo) {
      socket.emit('video-ready', { 
        url: `/api/stream/${roomId}/${encodeURIComponent(room.videoInfo.filename)}`
      });
    }
    socket.emit('playback-state', room.playbackState);
  });
  
  socket.on('play', () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      room.playbackState.isPlaying = true;
      socket.to(currentRoom).emit('play');
      io.to(currentRoom).emit('playback-state', room.playbackState);
    }
  });
  
  socket.on('pause', () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      room.playbackState.isPlaying = false;
      socket.to(currentRoom).emit('pause');
      io.to(currentRoom).emit('playback-state', room.playbackState);
    }
  });
  
  socket.on('seek', (time) => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      room.playbackState.currentTime = time;
      socket.to(currentRoom).emit('seek', time);
      io.to(currentRoom).emit('playback-state', room.playbackState);
    }
  });
  
  socket.on('disconnect', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.users.delete(socket.id);
      io.to(currentRoom).emit('user-count', room.users.size);
      
      // Clean up room if empty
      if (room.users.size === 0) {
        if (room.videoInfo) {
          try {
            fs.removeSync(path.join('uploads', currentRoom));
          } catch (err) {
            console.error('Error cleaning up room:', err);
          }
        }
        rooms.delete(currentRoom);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});