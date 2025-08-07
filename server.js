import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map(); // roomId => { host: ws, peers: Set<ws> }

function send(ws, data) {
  ws.send(JSON.stringify(data));
}

function broadcast(roomId, data, excludeWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.host && room.host !== excludeWs) send(room.host, data);
  for (const peer of room.peers) {
    if (peer !== excludeWs) send(peer, data);
  }
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    const { type, roomId, payload } = data;

    if (!roomId) {
      send(ws, { type: "error", message: "roomId required" });
      return;
    }

    if (type === "join") {
      let room = rooms.get(roomId);
      if (!room) {
        // Create room, this user is host
        rooms.set(roomId, {
          host: ws,
          peers: new Set(),
        });
        ws.role = "host";
        ws.roomId = roomId;
        send(ws, { type: "joined", role: "host", roomId });
      } else {
        // Join as peer
        room.peers.add(ws);
        ws.role = "peer";
        ws.roomId = roomId;
        send(ws, { type: "joined", role: "peer", roomId });
        // Notify host peers count
        send(room.host, { type: "peer-count", count: room.peers.size });
        // Notify peers count to all peers
        for (const peer of room.peers) {
          send(peer, { type: "peer-count", count: room.peers.size + 1 }); // host + peers
        }
      }
    } else if (type === "leave") {
      leaveRoom(ws);
    } else if (type === "signal") {
      // Relay signaling messages for WebRTC (offer/answer/ice)
      const room = rooms.get(roomId);
      if (!room) return;
      if (ws.role === "host") {
        // host sending signaling to peerId
        const { targetId, signalData } = payload;
        for (const peer of room.peers) {
          if (peer.id === targetId) {
            send(peer, { type: "signal", payload: { from: "host", signalData } });
          }
        }
      } else {
        // peer sending signaling to host
        if (room.host) {
          send(room.host, {
            type: "signal",
            payload: { from: "peer", peerId: ws.id, signalData: payload.signalData },
          });
        }
      }
    } else if (type === "host-command") {
      // host play/pause commands sync to peers
      const room = rooms.get(roomId);
      if (!room) return;
      if (ws.role === "host") {
        broadcast(roomId, { type: "host-command", payload }, ws);
      }
    }
  });

  ws.on("close", () => {
    leaveRoom(ws);
  });

  // Assign a random ID for peers (used in signaling)
  ws.id = Math.random().toString(36).substr(2, 9);

  function leaveRoom(ws) {
    if (!ws.roomId) return;
    const room = rooms.get(ws.roomId);
    if (!room) return;

    if (ws.role === "host") {
      // Close room and disconnect peers
      for (const peer of room.peers) {
        send(peer, { type: "room-closed" });
        peer.close();
      }
      rooms.delete(ws.roomId);
    } else if (ws.role === "peer") {
      room.peers.delete(ws);
      // Notify host of updated peer count
      if (room.host) {
        send(room.host, { type: "peer-count", count: room.peers.size });
      }
      // Notify other peers
      for (const peer of room.peers) {
        send(peer, { type: "peer-count", count: room.peers.size + 1 }); // host + peers
      }
    }
    ws.roomId = null;
    ws.role = null;
  }
});

// Ping to detect dead clients
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
