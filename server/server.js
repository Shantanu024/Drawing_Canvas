
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');
const Rooms = require('./rooms');
const { DrawingState } = require('./drawing-state');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket'] // Use WebSocket only for optimal real-time performance
});

const PORT = process.env.PORT || 3000;

// Serve static client
app.use(express.static(path.join(__dirname, '..', 'client')));

// In-memory rooms registry: { roomId -> Room }
const rooms = new Rooms();

io.on('connection', (socket) => {
  let joined = false;
  let roomId = null;
  let user = null; // { id, name, color }

  // Send current public rooms list to the newly connected client
  socket.emit('rooms:list', rooms.listPublicRooms());

  // Room creation: user initiates creating a new room
  socket.on('room:create', ({ room, password, username }, callback) => {
    if (!room || typeof room !== 'string' || room.trim().length === 0) {
      if (typeof callback === 'function') callback({ success: false, error: 'Invalid room name' });
      return;
    }
    const roomObj = rooms.create(room, password);
    if (!roomObj) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room already exists' });
      return;
    }
    // Auto-join the creator
    user = roomObj.addUser(socket.id, username);
    roomId = room;
    socket.join(roomId);
    joined = true;

    // Send initial state
    socket.emit('state:init', {
      room: roomId,
      self: user,
      revision: roomObj.state.revision,
      ops: roomObj.state.serialize()
    });

    io.to(roomId).emit('user:list', roomObj.getUsers());
    // Broadcast updated public rooms list
    io.emit('rooms:list', rooms.listPublicRooms());
    
    // Call callback after all state emissions
    if (typeof callback === 'function') {
      setImmediate(() => callback({ success: true, room: roomId }));
    }
  });

  // Room joining: user tries to join an existing room
  socket.on('room:join', ({ room, password, username }, callback) => {
    if (!room || typeof room !== 'string' || room.trim().length === 0) {
      if (typeof callback === 'function') callback({ success: false, error: 'Invalid room name' });
      return;
    }
    const result = rooms.join(room, password);
    if (!result.success) {
      if (typeof callback === 'function') callback({ success: false, error: result.error });
      return;
    }
    
    const roomObj = result.room;
    user = roomObj.addUser(socket.id, username);
    roomId = room;
    socket.join(roomId);
    joined = true;

    // Send initial state and user list to the new user
    socket.emit('state:init', {
      room: roomId,
      self: user,
      revision: roomObj.state.revision,
      ops: roomObj.state.serialize()
    });

    io.to(roomId).emit('user:list', roomObj.getUsers());
    // Broadcast updated public rooms list
    io.emit('rooms:list', rooms.listPublicRooms());
    
    // Call callback after all state emissions
    if (typeof callback === 'function') {
      setImmediate(() => callback({ success: true, room: roomId }));
    }
  });

  // Legacy join for backward compatibility (auto-create/join lobby)
  socket.on('join', ({ room, username }) => {
    if (joined) return;
    roomId = room || 'lobby';
    const roomObj = rooms.ensure(roomId);
    user = roomObj.addUser(socket.id, username);
    socket.join(roomId);
    joined = true;

    // Send initial state and user list to the new user
    socket.emit('state:init', {
      room: roomId,
      self: user,
      revision: roomObj.state.revision,
      ops: roomObj.state.serialize()
    });

    io.to(roomId).emit('user:list', roomObj.getUsers());
  });

  // Cursor broadcasting (throttled client-side)
  socket.on('cursor:move', (payload) => {
    if (!joined || !payload || typeof payload.x !== 'number' || typeof payload.y !== 'number') {
      console.warn('Invalid cursor:move payload from', socket.id);
      return;
    }
    payload.userId = socket.id;
    payload.color = user?.color;
    payload.name = user?.name;
    socket.to(roomId).emit('cursor:move', payload);
  });

  // Live stroke streaming so others can see drawing before commit
  socket.on('stroke:begin', (s) => {
    if (!joined || !s || !s.start || typeof s.start.x !== 'number' || typeof s.start.y !== 'number') {
      console.warn('Invalid stroke:begin payload from', socket.id);
      return;
    }
    const payload = { ...s, userId: socket.id, color: s.tool === 'eraser' ? null : user.color };
    socket.to(roomId).emit('stroke:begin', payload);
  });

  socket.on('stroke:chunk', (s) => {
    if (!joined || !s || !s.points || !Array.isArray(s.points)) {
      console.warn('Invalid stroke:chunk payload from', socket.id);
      return;
    }
    const payload = { ...s, userId: socket.id };
    socket.to(roomId).emit('stroke:chunk', payload);
  });

  socket.on('stroke:end', (s) => {
    if (!joined) return;
    const roomObj = rooms.get(roomId);
    if (!roomObj) return;
    if (!s || !s.points || !Array.isArray(s.points)) return; // Validate input

    // Commit operation to authoritative history (truncate redo tail if any)
    const op = {
      id: s.strokeId || randomUUID(),
      userId: socket.id,
      username: user?.name,
      tool: s.tool,
      color: s.tool === 'eraser' ? null : s.color, // eraser ignores color
      width: s.width,
      points: s.points, // normalized [ {x,y,t} ]
      t0: Date.now()
    };

    roomObj.state.addOperation(op);

    const announce = {
      revision: roomObj.state.revision,
      op
    };
    // Inform everyone (including sender) about the committed op
    io.to(roomId).emit('state:op-append', announce);
  });

  // Per-user undo: only undo this user's operations
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

  // Per-user redo: only redo this user's undone operations
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
      // Clean up empty password-protected rooms
      rooms.cleanup();
      // Broadcast updated public rooms list (rooms may have been removed or user counts changed)
      io.emit('rooms:list', rooms.listPublicRooms());
    }
  });
});

server.listen(PORT, () => {
  console.log(`Collaborative Canvas running on http://localhost:${PORT}`);
});
