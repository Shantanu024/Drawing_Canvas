# COLAB-CANVAS

A real-time collaborative drawing application that allows multiple users to draw simultaneously on a shared canvas. Built with vanilla JavaScript, Node.js, and Socket.io for seamless, low-latency collaboration.

## 📋 Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Socket Events](#socket-events)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Deployment](#deployment)
- [License](#license)

## ✨ Features

- **Real-time Collaboration**: Multiple users can draw on the same canvas simultaneously with instant synchronization
- **Room-based Organization**: Create or join drawing rooms with optional password protection
- **Drawing Tools**: 
  - Brush tool for freehand drawing
  - Eraser tool for removing content
  - Customizable stroke width (1-50px)
  - Color picker for custom colors
- **User Presence**: See active users in the room with color-coded indicators
- **Undo/Redo Functionality**: Individual undo/redo per user with support for global undo/redo
- **Responsive Canvas**: Automatically adapts to window resizing with high DPI support
- **Password-Protected Rooms**: Secure private rooms with optional password protection
- **Public Room Discovery**: Browse and join public rooms without passwords
- **Lightweight**: Uses vanilla JavaScript with no frontend framework dependencies
- **Vercel Deployment Ready**: Pre-configured for serverless deployment

## 📋 Requirements

- **Node.js**: 24.x or higher
- **npm**: 10.x or higher
- **Modern Browser**: Chrome, Firefox, Safari, or Edge (with WebSocket/polling support)

## 📦 Installation

### 1. Clone or Download the Repository

```bash
git clone <repository-url>
cd collaborative-canvas_cop
```

### 2. Install Dependencies

```bash
npm install
```

This installs the following packages:
- **express**: Web server framework
- **socket.io**: Real-time bidirectional communication
- **nodemon** (dev): Auto-restart server during development

## 🚀 Usage

### Development

Start the development server with auto-reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Production

Start the production server:

```bash
npm start
```

### Accessing the Application

1. Open your browser and navigate to `http://localhost:3000`
2. Create a new room or join an existing one
3. Enter your username
4. Start drawing!

### Room Workflow

#### Creating a Room
- Click on "Create Room" or the new room option
- Enter a room name
- (Optional) Set a password for private rooms
- Enter your username
- Begin drawing

#### Joining a Room
- Select from the list of public rooms, or
- Enter a room name to join
- Enter a password if the room is protected
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
