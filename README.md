# Collaborative Canvas

A real-time collaborative drawing application built with vanilla JavaScript, Node.js, and Socket.io. Multiple users can draw simultaneously on a shared canvas with instant synchronization.

## Features

- **Real-time Collaboration**: Multiple users drawing simultaneously with instant sync
- **Room-based Organization**: Create or join rooms with optional password protection
- **Drawing Tools**: Brush, eraser, customizable stroke width (1-50px), color picker
- **User Presence**: Color-coded indicators for active users
- **Undo/Redo**: Per-user and global undo/redo functionality
- **Responsive Canvas**: Auto-adapts to window resizing with high DPI support
- **Public Room Discovery**: Browse and join public rooms

## Requirements

- **Node.js**: 24.x or higher
- **npm**: 10.x or higher
- **Modern Browser**: Chrome, Firefox, Safari, or Edge

## Installation

```bash
git clone <repository-url>
cd collaborative-canvas_cop
npm install
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

Open `http://localhost:3000` in your browser to get started.

### Quick Start
1. Create a new room or join an existing one
2. Enter your username
3. Start drawing in real-time with others

## Project Structure

```
collaborative-canvas/
├── client/              # Frontend files
│   ├── index.html       # Main HTML
│   ├── style.css        # Styling
│   ├── main.js          # Canvas and drawing logic
│   ├── websocket.js     # Socket.io client
│   ├── room-dialog.js   # Room creation/join UI
│   └── canvas.js        # Canvas drawing utilities
├── server/              # Backend files
│   ├── server.js        # Express & Socket.io server
│   ├── rooms.js         # Room management
│   └── drawing-state.js # Drawing state handling
├── package.json         # Dependencies
└── README.md
```

## Deployment

### Render
1. Push code to GitHub
2. Create a new Web Service on [render.com](https://render.com)
3. Connect your GitHub repo
4. Set start command: `npm start`
5. Add environment variable: `NODE_ENV=production`
6. Deploy

### Important Notes
- **In-Memory Storage**: Rooms and drawing state are stored in memory and will reset on server restart
- **CORS**: Update CORS origin in `server/server.js` for production domains
- **WebSocket**: Fully supported on Render

## License

MIT
- Enter your username
- Join the canvas

## 🏗️ Project Structure

```
collaborative-canvas/
├── client/                 # Frontend application
│   ├── index.html         # Main HTML page with canvas
│   ├── main.js            # User presence list management
│   ├── canvas.js          # Canvas drawing logic and rendering
│   ├── websocket.js       # WebSocket event handling
│   ├── room-dialog.js     # Room creation/joining UI
│   └── style.css          # Styling
├── server/                 # Backend application
│   ├── server.js          # Express server and Socket.io setup
│   ├── rooms.js           # Room management and user tracking
│   └── drawing-state.js   # Drawing state and undo/redo logic
├── package.json           # Project dependencies
├── vercel.json           # Vercel deployment configuration
└── README.md             # This file
```

## 🔧 Architecture

### Frontend Architecture

**Canvas Rendering**:
- Maintains two canvases: a persistent canvas for completed strokes and a live canvas for in-progress strokes
- Uses high DPI scaling for sharp rendering on retina displays
- Normalized coordinate system for consistency across different screen sizes

**State Management**:
- Tracks the current drawing tool, color, and width
- Maintains a local buffer of drawing points before sending to server
- Live stroke rendering shows other users' drawings in real-time

**Input Handling**:
- Mouse/touch input captures points during drawing
- Throttled sending of points to reduce bandwidth (every 50ms)
- Keyboard shortcuts for quick tool switching

### Backend Architecture

**Room Management**:
- In-memory room registry with per-room user tracking
- Password hashing using SHA-256 for security
- Automatic room cleanup when empty
- Color assignment to users from a predefined palette

**Drawing State**:
- Linear operation history for all strokes
- Undo/redo with both global and per-user tracking
- Revision numbering for state synchronization

**Socket.io Communication**:
- Uses HTTP long-polling for Vercel compatibility
- Handles room lifecycle (create, join, leave)
- Broadcasts drawing operations to all room members
- Maintains user presence information

## 📡 Socket Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:create` | `{room, password?, username}` | Create a new drawing room |
| `room:join` | `{room, password?, username}` | Join an existing room |
| `draw:stroke:start` | `{tool, color, width}` | Begin a new stroke |
| `draw:stroke:point` | `{x, y, t}` | Add a point to current stroke |
| `draw:stroke:end` | - | Finish current stroke |
| `undo` | - | Undo user's last action |
| `redo` | - | Redo user's last undone action |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `rooms:list` | `[{id, userCount, hasPassword}]` | List of public rooms |
| `state:init` | `{room, self, revision, ops}` | Initial state on join |
| `user:list` | `[{id, name, color}]` | Active users in room |
| `draw:stroke:start` | `{strokeId, userId, tool, color, width}` | Remote stroke started |
| `draw:stroke:point` | `{strokeId, x, y}` | Remote stroke point added |
| `draw:stroke:end` | `{strokeId}` | Remote stroke finished |
| `cursor:move` | `{userId, x, y}` | Remote user cursor position |
| `state:updated` | `{ops, revision, activeCount}` | State change notification |

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo last action |
| `Ctrl+Shift+Z` | Redo last undone action |
| `B` | Switch to Brush tool |
| `E` | Switch to Eraser tool |

## 🚀 Deployment

### Vercel Deployment

The project is pre-configured for Vercel with the `vercel.json` configuration:

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. The configuration handles:
   - Server routing to `/api` and `/socket.io` endpoints
   - Static file serving from the `client/` directory
   - HTTP long-polling support for Socket.io (Vercel limitation)

### Environment Variables

For production deployment, set:
- `NODE_ENV=production`
- `PORT=3000` (default)

## 🔐 Security Notes

- Passwords are hashed using SHA-256
- Only public rooms (without passwords) appear in the room list
- Password-protected rooms are accessible only with the correct password
- No authentication system; usernames are self-chosen

## 📝 License

MIT License - See LICENSE file for details.

## 🎨 Technology Stack

- **Frontend**: HTML5 Canvas, Vanilla JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.io
- **Deployment**: Vercel (Node.js runtime)
- **Package Manager**: npm

## 🐛 Known Limitations

- In-memory storage: data is lost on server restart
- No persistent database; suitable for temporary sessions
- Maximum performance depends on network latency
- Canvas resolution limited by browser capabilities

## 📧 Support

For issues, questions, or contributions, please refer to the project repository.

---

**Version**: 1.0.0  
**Last Updated**: January 2026
