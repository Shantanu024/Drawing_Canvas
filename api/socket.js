const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');
const Rooms = require('../server/rooms');
const { DrawingState } = require('../server/drawing-state');

// Create Express app
const app = express();

// In-memory rooms registry
let rooms = new Rooms();

// Socket.io server with Vercel-compatible transports
const io = new Server({
  transports: ['websocket', 'polling'],
  cors: { origin: '*' },
  allowEIO3: true,
  path: '/api/socket.io/'
});

// Initialize Socket.io handlers
setupSocketHandlers();

function setupSocketHandlers() {
  io.on('connection', (socket) => {
    let joined = false;
    let roomId = null;
    let user = null;

    socket.emit('rooms:list', rooms.listPublicRooms());

    socket.on('room:create', ({ room, password, username }, callback) => {
      const roomObj = rooms.create(room, password);
      if (!roomObj) {
        callback({ success: false, error: 'Room already exists' });
        return;
      }
      user = roomObj.addUser(socket.id, username);
      roomId = room;
      socket.join(roomId);
      joined = true;

      socket.emit('state:init', {
        room: roomId,
        self: user,
        revision: roomObj.state.revision,
        ops: roomObj.state.serialize()
      });

      io.to(roomId).emit('user:list', roomObj.getUsers());
      io.emit('rooms:list', rooms.listPublicRooms());
      callback({ success: true, room: roomId });
    });

    socket.on('room:join', ({ room, password, username }, callback) => {
      const result = rooms.join(room, password);
      if (!result.success) {
        callback({ success: false, error: result.error });
        return;
      }
      
      const roomObj = result.room;
      user = roomObj.addUser(socket.id, username);
      roomId = room;
      socket.join(roomId);
      joined = true;

      socket.emit('state:init', {
        room: roomId,
        self: user,
        revision: roomObj.state.revision,
        ops: roomObj.state.serialize()
      });

      io.to(roomId).emit('user:list', roomObj.getUsers());
      io.emit('rooms:list', rooms.listPublicRooms());
      callback({ success: true, room: roomId });
    });

    socket.on('join', ({ room, username }) => {
      if (joined) return;
      roomId = room || 'lobby';
      const roomObj = rooms.ensure(roomId);
      user = roomObj.addUser(socket.id, username);
      socket.join(roomId);
      joined = true;

      socket.emit('state:init', {
        room: roomId,
        self: user,
        revision: roomObj.state.revision,
        ops: roomObj.state.serialize()
      });

      io.to(roomId).emit('user:list', roomObj.getUsers());
    });

    socket.on('cursor:move', (payload) => {
      if (!joined) return;
      payload.userId = socket.id;
      payload.color = user?.color;
      payload.name = user?.name;
      socket.to(roomId).emit('cursor:move', payload);
    });

    socket.on('stroke:begin', (s) => {
      if (!joined) return;
      const payload = { ...s, userId: socket.id, color: s.tool === 'eraser' ? null : user.color };
      socket.to(roomId).emit('stroke:begin', payload);
    });

    socket.on('stroke:chunk', (s) => {
      if (!joined) return;
      const payload = { ...s, userId: socket.id };
      socket.to(roomId).emit('stroke:chunk', payload);
    });

    socket.on('stroke:end', (s) => {
      if (!joined) return;
      const roomObj = rooms.get(roomId);
      if (!roomObj) return;

      const op = {
        id: s.strokeId || randomUUID(),
        userId: socket.id,
        username: user?.name,
        tool: s.tool,
        color: s.tool === 'eraser' ? null : s.color,
        width: s.width,
        points: s.points,
        t0: Date.now()
      };

      roomObj.state.addOperation(op);

      const announce = {
        revision: roomObj.state.revision,
        op
      };
      io.to(roomId).emit('state:op-append', announce);
    });

    socket.on('op:undo', () => {
      if (!joined) return;
      const roomObj = rooms.get(roomId);
      if (!roomObj) return;
      const changed = roomObj.state.undoUser(socket.id);
      if (changed) {
        io.to(roomId).emit('state:full', {
          revision: roomObj.state.revision,
          ops: roomObj.state.serialize()
        });
      }
    });

    socket.on('op:redo', () => {
      if (!joined) return;
      const roomObj = rooms.get(roomId);
      if (!roomObj) return;
      const changed = roomObj.state.redoUser(socket.id);
      if (changed) {
        io.to(roomId).emit('state:full', {
          revision: roomObj.state.revision,
          ops: roomObj.state.serialize()
        });
      }
    });

    socket.on('disconnect', () => {
      if (!joined) return;
      const roomObj = rooms.get(roomId);
      if (roomObj) {
        roomObj.removeUser(socket.id);
        io.to(roomId).emit('user:list', roomObj.getUsers());
        rooms.cleanup();
        io.emit('rooms:list', rooms.listPublicRooms());
      }
    });
  });
}

// Serve Socket.io
app.use('/api/socket.io/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }

  io.engine.handleRequest(req, res);
});

module.exports = app;
