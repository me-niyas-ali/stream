const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for now
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on("connection", socket => {
  console.log("Client connected:", socket.id);

  socket.on("join-room", roomId => {
    const room = rooms[roomId] || { host: null, peers: new Set() };

    if (!room.host) {
      room.host = socket.id;
      console.log(`Room ${roomId} - Assigned host: ${socket.id}`);
    }

    room.peers.add(socket.id);
    rooms[roomId] = room;
    socket.join(roomId);

    const isHost = socket.id === room.host;
    socket.emit("joined", { roomId, isHost });
    io.to(roomId).emit("peer-count", room.peers.size);
  });

  socket.on("leave-room", roomId => {
    leaveRoom(socket, roomId);
    socket.emit("left-room");
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      leaveRoom(socket, roomId);
    }
  });

  socket.on("video-chunk", ({ roomId, chunk }) => {
    socket.to(roomId).emit("receive-chunk", chunk);
    console.log(`Chunk sent to peers in room ${roomId}`);
  });

  socket.on("video-done", roomId => {
    console.log(`Video transfer done for room ${roomId}`);
  });

  socket.on("video-control", ({ roomId, action, time }) => {
    socket.to(roomId).emit("video-control", { action, time });
    console.log(`Video ${action} at ${time}s in room ${roomId}`);
  });

  function leaveRoom(socket, roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.peers.delete(socket.id);
    if (room.host === socket.id) {
      console.log(`Host left room ${roomId}`);
      io.to(roomId).emit("left-room");
      delete rooms[roomId];
    } else {
      io.to(roomId).emit("peer-count", room.peers.size);
      console.log(`Peer ${socket.id} left room ${roomId}`);
    }

    socket.leave(roomId);
  }
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server started on port", process.env.PORT || 3000);
});
