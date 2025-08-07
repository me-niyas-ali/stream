const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());

const rooms = {};

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      return;
    }

    if (data.type === "join") {
      const roomId = data.room;
      if (!rooms[roomId]) {
        rooms[roomId] = { clients: new Set(), hostId: null };
      }

      rooms[roomId].clients.add(ws);
      ws.roomId = roomId;
      ws.clientId = Math.random().toString(36).substr(2, 9);
      if (!rooms[roomId].hostId) rooms[roomId].hostId = ws.clientId;

      ws.send(JSON.stringify({
        type: "init",
        isHost: rooms[roomId].hostId === ws.clientId,
        clients: rooms[roomId].clients.size,
      }));

      broadcastToRoom(roomId, {
        type: "clients",
        count: rooms[roomId].clients.size,
      });
    }

    else if (data.type === "signal") {
      const room = rooms[ws.roomId];
      if (!room) return;
      for (let client of room.clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "signal",
            from: ws.clientId,
            signal: data.signal,
          }));
        }
      }
    }

    else if (data.type === "playback") {
      const room = rooms[ws.roomId];
      if (!room) return;
      for (let client of room.clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "playback",
            action: data.action,
            time: data.time,
          }));
        }
      }
    }
  });

  ws.on("close", () => {
    const roomId = ws.roomId;
    if (!roomId || !rooms[roomId]) return;

    rooms[roomId].clients.delete(ws);
    if (rooms[roomId].clients.size === 0) {
      delete rooms[roomId];
    } else {
      broadcastToRoom(roomId, {
        type: "clients",
        count: rooms[roomId].clients.size,
      });
    }
  });
});

function broadcastToRoom(roomId, msg) {
  if (!rooms[roomId]) return;
  const message = JSON.stringify(msg);
  for (let client of rooms[roomId].clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
