const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors()); // Enable CORS for all origins

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map(); // roomId => Set of clients

function broadcastToRoom(roomId, data, excludeSocket = null) {
  const clients = rooms.get(roomId);
  if (!clients) return;
  for (const client of clients) {
    if (client !== excludeSocket && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.roomId = null;
  ws.isHost = false;

  ws.on("message", (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      console.warn("Invalid JSON message");
      return;
    }

    if (msg.type === "join") {
      const roomId = msg.room;
      ws.roomId = roomId;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }
      const clients = rooms.get(roomId);

      ws.isHost = clients.size === 0; // first client is host
      clients.add(ws);

      // Notify client of init data
      ws.send(JSON.stringify({
        type: "init",
        isHost: ws.isHost,
        clients: clients.size
      }));

      // Notify all clients about current clients count
      broadcastToRoom(roomId, JSON.stringify({
        type: "clients",
        count: clients.size
      }));
    }

    else if (msg.type === "signal") {
      // Forward signaling to target client
      const clients = rooms.get(ws.roomId);
      if (!clients) return;
      for (const client of clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          if (msg.to === client.id || !msg.to) { // msg.to can be undefined or target id if you implement ids
            // We don’t assign client ids here, so send to all except sender
            client.send(JSON.stringify({
              type: "signal",
              from: ws.id,
              signal: msg.signal
            }));
          }
        }
      }
    }

    else if (msg.type === "playback") {
      // Broadcast playback control to all except sender
      broadcastToRoom(ws.roomId, JSON.stringify({
        type: "playback",
        action: msg.action,
        time: msg.time
      }), ws);
    }
  });

  ws.on("close", () => {
    const roomId = ws.roomId;
    if (!roomId) return;

    const clients = rooms.get(roomId);
    if (!clients) return;

    clients.delete(ws);

    // If room empty, delete it
    if (clients.size === 0) {
      rooms.delete(roomId);
    } else {
      // If host disconnected, assign new host (first in set)
      if (ws.isHost) {
        const newHost = clients.values().next().value;
        if (newHost) {
          newHost.isHost = true;
          newHost.send(JSON.stringify({
            type: "init",
            isHost: true,
            clients: clients.size
          }));
        }
      }
      // Broadcast updated client count
      broadcastToRoom(roomId, JSON.stringify({
        type: "clients",
        count: clients.size
      }));
    }
  });

  // Optional: Ping/pong to detect dead connections
  const interval = setInterval(() => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  }, 30000);

  ws.on("close", () => clearInterval(interval));
});

// Optional health check endpoint
app.get("/", (req, res) => {
  res.send("WebSocket signaling server is running.");
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
