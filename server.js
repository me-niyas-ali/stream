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

        // Broadcast updated connected count
        broadcastCount(data.room);

        // Notify other clients about new user
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
    if (socket.room && rooms[socket.room]) {
      rooms[socket.room] = rooms[socket.room].filter(s => s !== socket);
      broadcastCount(socket.room);
    }
  });

  function broadcastCount(room) {
    const count = rooms[room]?.length || 0;
    rooms[room]?.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'count', count }));
      }
    });
  }
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
