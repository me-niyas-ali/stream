const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const app = express();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = {};

wss.on('connection', (socket) => {
  socket.on('message', (msg) => {
    const data = JSON.parse(msg);

    switch (data.type) {
      case 'join':
        if (!rooms[data.room]) rooms[data.room] = [];
        rooms[data.room].push(socket);
        socket.room = data.room;

        rooms[data.room].forEach(client => {
          if (client !== socket && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'user-joined' }));
          }
        });
        break;

      case 'signal':
        rooms[socket.room]?.forEach(client => {
          if (client !== socket && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'signal', signal: data.signal }));
          }
        });
        break;

      case 'control':
        rooms[socket.room]?.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'control', action: data.action, time: data.time }));
          }
        });
        break;
    }
  });

  socket.on('close', () => {
    const room = rooms[socket.room];
    if (room) {
      rooms[socket.room] = room.filter(s => s !== socket);
    }
  });
});

app.use(express.static('public'));

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});