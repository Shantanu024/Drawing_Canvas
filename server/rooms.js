
const { DrawingState } = require('./drawing-state');
const crypto = require('crypto');

const COLORS = [
  '#e6194B','#3cb44b','#ffe119','#0082c8','#f58231','#911eb4','#46f0f0','#f032e6',
  '#d2f53c','#fabebe','#008080','#e6beff','#aa6e28','#fffac8','#800000','#aaffc3',
  '#808000','#ffd8b1','#000080','#808080'
];

class Room {
  constructor(id, password = null) {
    this.id = id;
    this.password = password ? this.hashPassword(password) : null;
    this.users = new Map(); // userId -> { id, name, color }
    this.state = new DrawingState();
    this.colorIndex = 0;
  }

  hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  verifyPassword(password) {
    if (!this.password) return true; // No password protection
    return this.password === this.hashPassword(password);
  }

  addUser(id, name) {
    const color = COLORS[this.colorIndex % COLORS.length];
    this.colorIndex++;
    const user = { id, name: name || `Guest-${id.slice(0,5)}`, color };
    this.users.set(id, user);
    return user;
  }

  removeUser(id) {
    this.users.delete(id);
  }

  getUsers() {
    return Array.from(this.users.values());
  }

  // Check if room is empty (for cleanup)
  isEmpty() {
    return this.users.size === 0;
  }
}

class Rooms {
  constructor() {
    this.rooms = new Map(); // roomId -> Room
  }

  // Create a new room with optional password
  create(id, password = null) {
    if (this.rooms.has(id)) {
      return null; // Room already exists
    }
    const room = new Room(id, password);
    this.rooms.set(id, room);
    return room;
  }

  // Join an existing room (verifies password if set)
  join(id, password = null) {
    const room = this.rooms.get(id);
    if (!room) {
      return { success: false, error: 'Room does not exist' };
    }
    if (!room.verifyPassword(password)) {
      return { success: false, error: 'Invalid password' };
    }
    return { success: true, room };
  }

  // Ensure a room exists (for backward compatibility with auto-lobby)
  ensure(id) {
    if (!this.rooms.has(id)) {
      this.rooms.set(id, new Room(id, null)); // Create without password
    }
    return this.rooms.get(id);
  }

  get(id) {
    return this.rooms.get(id);
  }

  // List all public rooms (those without password protection)
  listPublicRooms() {
    const list = [];
    for (const [id, room] of this.rooms) {
      if (!room.password && !room.isEmpty()) {
        list.push({
          id: room.id,
          userCount: room.users.size,
          hasPassword: !!room.password
        });
      }
    }
    return list;
  }

  // Clean up empty password-protected rooms
  cleanup() {
    for (const [id, room] of this.rooms) {
      if (room.password && room.isEmpty()) {
        this.rooms.delete(id);
      }
    }
  }
}

module.exports = Rooms;
