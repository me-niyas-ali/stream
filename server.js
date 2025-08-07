const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const WebSocketServer = WebSocket.Server;
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();

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
  ws.on("pong", () => {
    ws.isAlive = true;
  });

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

      ws.isHost = clients.size === 0;
      clients.add(ws);

      ws.send(
        JSON.stringify({
          type: "init",
          isHost: ws.isHost,
          clients: clients.size,
        })
      );

      broadcastToRoom(
        roomId,
        JSON.stringify({
          type: "clients",
          count: clients.size,
        })
      );
    } else if (msg.type === "signal") {
      const clients = rooms.get(ws.roomId);
      if (!clients) return;
      for (const client of clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "signal",
              from: ws.id,
              signal: msg.signal,
            })
          );
        }
      }
    } else if (msg.type === "playback") {
      broadcastToRoom(
        ws.roomId,
        JSON.stringify({
          type: "playback",
          action: msg.action,
          time: msg.time,
        }),
        ws
      );
    }
  });

  ws.on("close", () => {
    const roomId = ws.roomId;
    if (!roomId) return;

    const clients = rooms.get(roomId);
    if (!clients) return;

    clients.delete(ws);

    if (clients.size === 0) {
      rooms.delete(roomId);
    } else {
      if (ws.isHost) {
        const newHost = clients.values().next().value;
        if (newHost) {
          newHost.isHost = true;
          newHost.send(
            JSON.stringify({
              type: "init",
              isHost: true,
              clients: clients.size,
            })
          );
        }
      }
      broadcastToRoom(
        roomId,
        JSON.stringify({
          type: "clients",
          count: clients.size,
        })
      );
    }
  });

  const interval = setInterval(() => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  }, 30000);

  ws.on("close", () => clearInterval(interval));
});

app.get("/", (req, res) => {
  res.send("WebSocket signaling server is running.");
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
