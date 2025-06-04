const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// In-memory room storage
const rooms = {}; // { '1234': { clients: Set<ws>, host: ws } }

function generateRoomId() {
  let id;
  do {
    id = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms[id]);
  return id;
}

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.type === 'create-room') {
      const roomId = generateRoomId();
      rooms[roomId] = { host: ws, clients: new Set([ws]) };
      ws.roomId = roomId;
      ws.isHost = true;
      ws.send(JSON.stringify({ type: 'room-created', roomId }));
    }

    if (data.type === 'join-room') {
      const room = rooms[data.roomId];
      if (room) {
        room.clients.add(ws);
        ws.roomId = data.roomId;
        ws.isHost = false;
        ws.send(JSON.stringify({ type: 'joined-room', roomId: data.roomId }));
        broadcastClientCount(data.roomId);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      }
    }
  });

  ws.on('close', () => {
    const roomId = ws.roomId;
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      room.clients.delete(ws);
      if (ws.isHost) {
        // End room if host disconnects
        room.clients.forEach(client => {
          client.send(JSON.stringify({ type: 'room-ended' }));
          client.close();
        });
        delete rooms[roomId];
      } else {
        broadcastClientCount(roomId);
      }
    }
  });
});

function broadcastClientCount(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const count = room.clients.size;
  for (const client of room.clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'client-count', count }));
    }
  }
}

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
