// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Replace "*" with your GitHub Pages URL for stricter security
    methods: ["GET", "POST"]
  }
});

app.use(cors()); // Allow HTTP requests from other origins

const rooms = {}; // Store room info, including video buffers and clients

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("create-room", (roomId) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: socket.id,
        clients: [],
        fileBuffer: [],
        receivedChunks: {},
        fileMeta: null
      };
    }
    socket.join(roomId);
    socket.emit("room-created", roomId);
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  socket.on("join-room", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      room.clients.push(socket.id);
      room.receivedChunks[socket.id] = 0;
      socket.join(roomId);
      socket.emit("room-joined", roomId);
      console.log(`Client ${socket.id} joined room ${roomId}`);
    } else {
      socket.emit("error", "Room not found");
    }
  });

  socket.on("file-meta", ({ roomId, fileMeta }) => {
    const room = rooms[roomId];
    if (room) {
      room.fileMeta = fileMeta;
    }
  });

  socket.on("video-chunk", ({ roomId, chunk }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.fileBuffer.push(chunk);

    // Broadcast chunk to all viewers
    room.clients.forEach((clientId) => {
      io.to(clientId).emit("video-chunk", chunk);
      room.receivedChunks[clientId] += chunk.byteLength;

      // Check if all clients received at least 5%
      const minReceived = Object.values(room.receivedChunks).every(
        (bytes) => bytes >= room.fileMeta.size * 0.05
      );

      if (minReceived && !room.readyNotified) {
        io.to(room.host).emit("ready-to-play");
        room.readyNotified = true;
      }
    });
  });

  socket.on("play", (roomId) => {
    io.to(roomId).emit("play");
  });

  socket.on("pause", (roomId) => {
    io.to(roomId).emit("pause");
  });

  socket.on("seek", ({ roomId, time }) => {
    io.to(roomId).emit("seek", time);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];

      if (room.host === socket.id) {
        io.to(roomId).emit("host-disconnected");
        delete rooms[roomId];
      } else {
        room.clients = room.clients.filter((id) => id !== socket.id);
        delete room.receivedChunks[socket.id];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
