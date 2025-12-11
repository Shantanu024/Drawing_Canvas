# Collaborative Canvas — Complete Project Explanation for Interview

## TABLE OF CONTENTS
1. Project Synopsis
2. Deep Dive into Architecture
3. Critical Code Sections & Reasoning
4. Interview Q&A Guide

---

# 1. PROJECT SYNOPSIS

## One-Sentence Summary
**Collaborative Canvas is a real-time multi-user drawing app where users can create password-protected rooms, draw together with live cursor feedback, undo only their own work, and see immediate erasing without lag.**

## Short Summary (30 seconds)
Collaborative Canvas is a web-based drawing application built with Node.js + Socket.io + vanilla JavaScript. Multiple users join the same room and draw on a shared canvas in real-time. Each user's strokes appear immediately on others' screens as they draw. Undo/Redo is **per-user** (not global), so when you undo, only your strokes disappear. Rooms can be password-protected. The app handles latency well—the eraser sends immediate updates and applies locally to feel responsive.

## Explanatory Summary (1-2 minutes)
Collaborative Canvas is a real-time collaborative drawing platform. Users start by creating or joining a room (with optional password protection). Once in a room, they see a shared canvas and the list of active users. Drawing is implemented with pointer events (mouse or touch); as you move, points are normalized and sent to the server. The server holds an authoritative history of all operations. Other users see your stroke in two phases: (1) a "live" preview as you draw (for responsiveness) and (2) a finalized stroke once you lift the pointer. Undo/Redo is per-user, meaning user A can undo without affecting user B's drawing. The eraser tool optimizes for low latency by sending chunks immediately and applying locally. The app supports cursor tracking so you see where others are hovering. Room management includes password hashing (SHA256), public room discovery, and automatic cleanup of empty password-protected rooms.

---

# 2. DEEP DIVE INTO ARCHITECTURE

## 2.1 System Overview

**Architecture Layers:**
```
┌─────────────────────────────────────────────────────┐
│              Browser Clients (Vanilla JS)            │
├─────────────────────────────────────────────────────┤
│ Canvas UI + WebSocket Wrapper + Event Handlers       │
├─────────────────────────────────────────────────────┤
│         Socket.io Bidirectional Communication        │
├─────────────────────────────────────────────────────┤
│  Server: Express + Socket.io + In-Memory State       │
│  ├─ Rooms Manager (room creation, join, cleanup)     │
│  ├─ DrawingState (op history + undo/redo tracking)   │
│  └─ Event Handlers (draw, undo, presence, cursor)    │
└─────────────────────────────────────────────────────┘
```

## 2.2 Data Flow for a Typical Drawing Action

**Scenario: User A draws a brush stroke, User B sees it.**

```
USER A (Browser)
  ├─ pointerDown → normalize coords, emit 'stroke:begin'
  ├─ pointerMove (x5) → batch points, emit 'stroke:chunk' (RAF batched)
  │  └─ Local: render to live overlay immediately for responsiveness
  └─ pointerUp → emit 'stroke:end' with full path
     └─ Local: move to committed canvas (optimistic commit)

SERVER
  └─ On 'stroke:end':
     1. Create op = { id, userId, tool, color, width, points, t0 }
     2. roomObj.state.addOperation(op)
     3. Broadcast 'state:op-append' to ALL users including sender
     
USER B (Browser)
  ├─ Receive 'stroke:chunk' during drawing → update live overlay, redraw
  └─ Receive 'state:op-append' on completion → draw finalized op to committed canvas, remove live
```

**Why Two Canvas Layers?**
- `ctx` (committed): holds finalized operations. Redraw only on undo/redo or new ops.
- `liveCtx` (ephemeral): shows in-progress strokes from you and others. Clears after commit.
- Benefit: smooth local feedback + efficient redraws (don't replay entire history on every point).

## 2.3 Core Architecture Components

### 2.3.1 Server-Side: DrawingState (drawing-state.js)

**Purpose:** Authoritative history of all drawing operations in a room.

**Key Data:**
```javascript
this.ops = [];               // linear array of all operations
this.activeCount = 0;        // pointer to visible prefix (undo/redo boundary)
this.revision = 0;           // incremented on any change
this.userUndoState = Map;    // { userId -> { undoneOpIndices: Set } }
```

**Why Linear History?**
- Simple, deterministic, and easy to reason about.
- When a new op arrives, we truncate redo tail: `ops.slice(0, activeCount)` then push.
- This ensures a single authoritative timeline, not a branching tree.
- Trade-off: can't have multiple redo branches; simplicity over flexibility.

**Per-User Undo Strategy:**
Instead of moving a global `activeCount` pointer (which affects everyone), we mark individual ops as "undone" by index in each user's undo set.
```javascript
undoUser(userId) {
  // Find the most recent active op by this user (not already undone)
  for (let i = activeCount - 1; i >= 0; i--) {
    if (ops[i].userId === userId && !undoneSet.has(i)) {
      undoneSet.add(i);  // Mark as undone
      return true;
    }
  }
}
```
When rendering, `getVisibleOps()` filters out ops where the user is in the undone set.

**Why This Approach?**
- Intuitive for collaboration: you can undo your mistakes without affecting others.
- Preserves other users' drawing history.
- Downside: visual results can be surprising if ops overlap (e.g., eraser removes a stroke, then another user draws on that erased area—undoing the eraser won't restore it).

### 2.3.2 Server-Side: Rooms (rooms.js)

**Purpose:** Manage room creation, password verification, user presence, and room discovery.

**Key Methods:**
```javascript
create(id, password)        // create new room, hash password
join(id, password)          // join existing, verify password
listPublicRooms()           // list non-password rooms with user counts
cleanup()                   // remove empty password-protected rooms
```

**Password Hashing:**
```javascript
hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}
```
- Uses SHA256 (one-way hash).
- Stored in memory; not persisted, so hashes are lost on server restart.
- Prevents casual eavesdropping but not a production-grade auth system.

**Room Lifecycle:**
1. User A creates room "art-1" with password "secret" → Room created, added to `rooms` map.
2. User B tries to join "art-1" → password verified, user added.
3. User A disconnects → user removed from room.
4. If room is now empty AND has password → room deleted (cleanup).
5. Public rooms (no password) stay alive as long as anyone is in them.

**Why Cleanup?**
- Prevents memory leaks from accumulating empty password-protected rooms.
- Public rooms are kept because they may be discovered and joined later.

### 2.3.3 Server-Side: Event Handlers (server.js)

**Key Events:**

1. **room:create** → Create room, auto-join creator, emit `state:init` + `rooms:list`
2. **room:join** → Join room, emit `state:init` + `rooms:list`
3. **stroke:end** → Create op, append to history, broadcast `state:op-append`
4. **op:undo** → Call `undoUser()`, broadcast `state:full` (full serialized state)
5. **disconnect** → Remove user, emit updated `user:list`, cleanup rooms

**Critical: Why state:full on undo/redo?**
When a user undos, other clients need to know which ops to render (exclude undone ops). Sending the full serialized state (with `userUndoState`) tells clients the complete picture.

### 2.3.4 Client-Side: WebSocket Wrapper (websocket.js)

**Purpose:** Manage Socket.io connection and provide a clean event bus API.

**Key Design:** IIFE (Immediately Invoked Function Expression) to encapsulate socket state.
```javascript
(function() {
  const bus = new EventTarget();  // Event bus for decoupling
  let socket = null;
  
  function initSocket() {
    // Lazy-load socket, returns promise
  }
  
  window.WS = { on, createRoom, joinRoom, ... };  // Public API
})();
```

**Why an Event Bus?**
- Decouples WebSocket from UI logic.
- Multiple components (`canvas.js`, `room-dialog.js`, `main.js`) listen to events without tight coupling.
- Example: `WS.on('state:init', handleInit)` instead of `socket.on(...)` everywhere.

**Initialization Pattern:**
```javascript
function createRoom({ room, password, username }) {
  return new Promise((resolve, reject) => {
    initSocket().then(() => {
      socket.emit('room:create', { room, password, username }, (response) => {
        if (response.success) resolve(response);
        else reject(new Error(response.error));
      });
    });
  });
}
```
- `initSocket()` returns a promise, ensuring socket is ready.
- Emit callback-based acknowledgment from server.
- Resolve promise immediately on ack (don't wait for `state:init` to avoid race).

### 2.3.5 Client-Side: Canvas Rendering (canvas.js)

**Key Concepts:**

1. **Normalized Coordinates:**
   ```javascript
   function normalize(pt) {
     const rect = wrap.getBoundingClientRect();
     return { x: (pt.x - rect.left) / rect.width, y: (pt.y - rect.top) / rect.height };
   }
   ```
   - Convert screen pixels to [0..1] relative to canvas wrapper.
   - All points are transmitted normalized; each client scales to its local size.
   - Benefit: multi-client consistency even with different viewport sizes/DPR.

2. **Batching & RAF Optimization:**
   ```javascript
   function scheduleSend() {
     if (rafHandle) return;  // Skip if already scheduled
     rafHandle = requestAnimationFrame(() => {
       if (localBuffer.length) {
         WS.strokeChunk({ strokeId, points: localBuffer.slice() });
         localBuffer.length = 0;  // Clear buffer
       }
       drawLive();
     });
   }
   ```
   - Batch pointer points into a single network message per frame (~16ms).
   - Reduces network chatter by ~30x compared to sending every point.
   - RAF (requestAnimationFrame) ties to browser refresh rate for smooth rendering.

3. **Eraser Latency Optimization:**
   ```javascript
   if (s.tool === 'eraser') {
     WS.strokeChunk({ strokeId, points: [pt] });  // Send immediately, not batched
   } else {
     localBuffer.push(pt);  // Buffer for RAF
   }
   ```
   - Eraser sends each point immediately (no RAF batching).
   - Also applies eraser directly to committed canvas (`ctx`) locally for instant feedback.
   - Reasoning: eraser is latency-sensitive; users expect to see erase effect right away.

4. **Optimistic Local Commit:**
   ```javascript
   function pointerUp() {
     // ... send stroke:end ...
     const optimisticOp = { id: strokeId, userId: self.id, ... };
     committedOps.push(optimisticOp);  // Local commit immediately
     liveStrokes.delete(strokeId);  // Move from live to committed
   }
   ```
   - After pointerUp, append op to local `committedOps` without waiting for server.
   - Removes the stroke from the live overlay to avoid double-rendering.
   - When server emits `state:op-append`, deduplication prevents double-add.

5. **Two-Layer Rendering:**
   ```javascript
   const ctx = canvas.getContext('2d');      // Committed strokes
   const liveCtx = live.getContext('2d');    // Ephemeral (in-progress)
   ```
   - Base canvas: committed ops (drawn via drawStroke).
   - Live overlay: in-progress strokes and remote strokes being previewed.
   - On remote `stroke:end` + `state:op-append`: move from live to base, redraw.

6. **Undo/Redo Rendering:**
   ```javascript
   WS.on('state:full', ({ revision: rev, ops }) => {
     committedOps = getVisibleOps(ops);  // Filter user-undone ops
     redrawAll();  // Reconstruct canvas from visible ops
   });
   
   function getVisibleOps(opsData) {
     // Exclude ops where userId is in undoneIndices
     const visible = [];
     for (let i = 0; i < activeCount; i++) {
       const op = ops[i];
       const userUndo = undoneMap.get(op.userId);
       if (!userUndo || !userUndo.has(i)) {
         visible.push(op);
       }
     }
     return visible;
   }
   ```
   - After undo, client receives `state:full` with full serialized state including `userUndoState`.
   - Parse undone indices per user, filter ops, redraw from scratch.
   - Full replay is only on undo/redo (not frequent), so performance acceptable.

### 2.3.6 Client-Side: Room Dialog (room-dialog.js)

**Purpose:** Handle room creation/joining flow before canvas is active.

**Key Flow:**
```javascript
1. Modal shown on load (showModal)
2. User selects "Create" or "Join"
3. Tab switches, loads public rooms list
4. User enters room ID, optional password, username
5. Click button → WS.createRoom() or WS.joinRoom()
6. On success → hideModal(), modal disappears, canvas is active
```

**Dynamic Room List:**
```javascript
WS.on('rooms:list', (rooms) => {
  if (activeTab === 'join') updateRoomsList(rooms);
});
```
- Server broadcasts `rooms:list` on connect, create, join, disconnect.
- Client updates UI if join tab is visible.

---

# 3. CRITICAL CODE SECTIONS & REASONING

## 3.1 Per-User Undo Implementation

**Code (server/drawing-state.js):**
```javascript
undoUser(userId) {
  if (!this.userUndoState.has(userId)) {
    this.userUndoState.set(userId, { undoneOpIndices: new Set() });
  }
  const userState = this.userUndoState.get(userId);
  
  // Search backward for the most recent active op by this user
  for (let i = this.activeCount - 1; i >= 0; i--) {
    if (this.ops[i].userId === userId && !userState.undoneOpIndices.has(i)) {
      userState.undoneOpIndices.add(i);
      this.revision++;
      return true;
    }
  }
  return false;
}
```

**Reasoning:**
- **Why backward search?** Most recent op first; user expects undo to act on what they just did.
- **Why check `!undoneSet.has(i)`?** Prevent undoing an already-undone op; allows redo.
- **Why mark as undone instead of deleting?** Preserves the op in history for redo and for other users' reference.
- **Why `activeCount`?** Only visible ops matter; undone ops beyond activeCount are redo buffer anyway.

**Trade-offs:**
- Pro: intuitive, doesn't affect other users.
- Con: visual result can be surprising if operations overlap. Example: User A erases pixels, User B draws on erased area, User A undoes eraser → erased pixels return but are below User B's strokes.

## 3.2 Immediate Eraser Updates

**Code (client/canvas.js pointerMove):**
```javascript
if (s.tool === 'eraser') {
  // Send chunk immediately, not batched
  WS.strokeChunk({ strokeId, points: [pt] });
  
  // Apply directly to main canvas for instant feedback
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.width;
  ctx.globalCompositeOperation = 'destination-out';  // Eraser mode
  ctx.beginPath();
  const p0 = denorm(last);
  const p1 = denorm(pt);
  ctx.moveTo(p0.x, p0.y);
  ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x)/2, (p0.y + p1.y)/2);
  ctx.stroke();
  ctx.restore();
  
  drawLive();  // Also show on live overlay for collaborators
}
```

**Reasoning:**
- **Why immediate send?** RAF batching (~16ms) feels like lag for eraser. Instant send = instant feedback locally.
- **Why apply directly to ctx?** User expects to see erased pixels disappear immediately, not after roundtrip.
- **globalCompositeOperation = 'destination-out'?** Removes (makes transparent) pixels instead of drawing over them.
- **Why drawLive() too?** Other users' live overlays need to show the erasing as it happens.

**Performance Impact:**
- Eraser now sends ~60 messages/sec (if at 60 FPS) vs ~3 for batched brush.
- Acceptable because eraser is specialized, not the norm. Could add throttling if needed.

## 3.3 Socket Connection Initialization

**Code (client/websocket.js):**
```javascript
let connectionPromise = null;

function initSocket() {
  if (connectionPromise) return connectionPromise;
  
  connectionPromise = new Promise((resolve) => {
    socket = io();
    socket.on('connect', () => {
      dispatch('status', { connected: true });
      resolve();
    });
    // ... event handlers ...
  });
  return connectionPromise;
}

function createRoom({ room, password, username }) {
  return new Promise((resolve, reject) => {
    initSocket().then(() => {  // Wait for socket ready
      socket.emit('room:create', { room, password, username }, (response) => {
        if (response.success) {
          resolve(response);  // Resolve on ack, not on state:init
        } else {
          reject(new Error(response.error));
        }
      });
    });
  });
}
```

**Reasoning:**
- **Why memoize connectionPromise?** Prevent multiple `io()` calls; socket is a singleton.
- **Why resolve on ack instead of state:init?** Avoids race: state:init might emit before the one-time listener is attached. Ack is synchronous callback, guaranteed.
- **Why initSocket().then(...)?** Ensures socket is connected before emitting.

**Alternative Approach:** Could wait for state:init but would need to attach listener before emit. Current approach is cleaner.

## 3.4 Room Password Hashing

**Code (server/rooms.js):**
```javascript
hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

verifyPassword(password) {
  if (!this.password) return true;  // No password = allow all
  return this.password === this.hashPassword(password);
}
```

**Reasoning:**
- **Why SHA256?** One-way hash; even if database leaks, attacker can't reverse-engineer passwords easily.
- **Why in-memory hashing?** This is a demo; production would use bcrypt or Argon2 with salt.
- **Why allow null?** Supports both public and private rooms.

**Security Note:** This is **not** production-grade. Lacks:
- Salt (prevents rainbow table attacks).
- KDF (key derivation function) like bcrypt (protects against brute force).
- HTTPS (passwords transmitted in plaintext if not over HTTPS).

---

# 4. INTERVIEW Q&A GUIDE

## Q1: "Walk me through what happens when one user draws a stroke while another watches."

**Answer:**
User A presses down on canvas:
1. `pointerDown` fires → normalize coords, generate strokeId, emit `stroke:begin`.
2. Local: add to `liveStrokes`, render to `liveCtx`.
3. Server receives `stroke:begin` → broadcasts to room (including User B).
4. User B receives `stroke:begin` → adds to their `liveStrokes`, renders to their `liveCtx`.

User A moves the pointer (e.g., 5 times):
1. `pointerMove` fires 5 times.
2. For brush: buffer points in `localBuffer`.
3. At next RAF (~16ms), emit `stroke:chunk` with 5 points (batched).
4. For eraser: emit `strokeChunk` immediately per point (no batching), apply directly to `ctx` locally.
5. Server relays `stroke:chunk` to User B.
6. User B updates their `liveStrokes`, re-renders `liveCtx`.

User A releases pointer:
1. `pointerUp` fires → emit `stroke:end` with full path.
2. Local: create optimistic op, append to `committedOps`, remove from `liveStrokes`, redraw `ctx`.
3. Server receives `stroke:end` → create op with metadata, append to `roomObj.state`, broadcast `state:op-append`.
4. User B receives `state:op-append` → draw op to their `ctx`, remove from `liveStrokes`.

**Total latency:** ~50-150ms (network roundtrip) for finalized stroke; ~0ms local feedback.

## Q2: "How does per-user undo work?"

**Answer:**
When User A presses undo (Ctrl+Z):
1. Client emits `op:undo`.
2. Server calls `roomObj.state.undoUser(socketId)`.
3. `undoUser` searches backward through ops, finds the most recent op with `userId == socketId`, marks its index as undone.
4. Server broadcasts `state:full` with serialized state (including `userUndoState`).
5. All clients receive `state:full`, extract visible ops (exclude User A's undone op), redraw canvas.

Result: User A's most recent stroke disappears. User B's strokes remain.

**Why not global undo?** Global undo would affect everyone, which is confusing in collaborative editing. Per-user undo is intuitive: "I want to undo my mistake."

**Edge case:** If User A undoes, then User B draws on the erased area, then User A redoes → User A's stroke reappears **below** User B's strokes (because order is linear).

## Q3: "What's the purpose of normalizing coordinates?"

**Answer:**
Coordinates are normalized to [0..1] relative to canvas wrapper width/height.

Example: If User A's viewport is 800x600 and they draw at pixel (400, 300), the normalized coordinate is (0.5, 0.5).
If User B's viewport is 1920x1440, the same (0.5, 0.5) maps to pixel (960, 720).

**Benefits:**
- Consistency across different client sizes.
- Handles different device pixel ratios (DPR) transparently.
- Easy resizing: if canvas is resized, points scale automatically.

**Downside:** Floating-point precision; not sub-pixel perfect, but acceptable for drawing.

## Q4: "Why do you use requestAnimationFrame batching for non-eraser strokes?"

**Answer:**
RAF batching (~16ms, tied to 60 FPS):
- Reduces network traffic from ~60 messages/sec (one per point) to ~3 messages/sec (one per frame).
- Reduces server processing load.
- Still provides smooth rendering (points arrive multiple times per second).

For eraser: immediate send because users expect instant visual feedback when erasing.

**Trade-off:** 16ms batching latency vs. 30x reduction in network traffic. Acceptable for most use cases.

## Q5: "How do you prevent race conditions between local and server state?"

**Answer:**
Several mechanisms:

1. **Deduplication on op:append**
   - Client optimistically commits op locally on `pointerUp`.
   - Server broadcasts `state:op-append`.
   - Client checks if op already in `committedOps` by id before adding.

2. **Server as Authoritative Source**
   - Server maintains single `ops` array and `activeCount`.
   - All clients trust server's order and serialization.
   - On undo/redo, server sends `state:full` (not incremental); clients rebuild from scratch.

3. **Joined Check**
   - Server validates `if (!joined) return` on all drawing events; prevents ops before room join.

4. **One-Time Listeners**
   - For room creation/join, don't attach one-time listener before emit; use ack callback to avoid race.

## Q6: "What are the limitations of this design?"

**Answer:**

1. **No Persistence:** In-memory only. Server restart = all history lost.
2. **Undo Overlap:** If ops overlap (e.g., eraser removes pixels, then another op draws on erased area), undoing eraser shows strange layering.
3. **No Conflict Resolution for Strokes:** Last-writer-wins by order. No sophisticated merging.
4. **Security:** Room passwords are SHA256-hashed, not bcrypt. No user authentication.
5. **Scalability:** Single-process Node server. Multi-user scaling requires Redis pub/sub or clustering.
6. **Full Replay on Undo/Redo:** With thousands of ops, redrawing is slow. Solution: snapshot every N ops.

## Q7: "How does the room password system work?"

**Answer:**
1. User creates room with password "secret".
2. Server hashes: `SHA256("secret")` → stores hash in `room.password`.
3. User B tries to join with password "secret".
4. Server verifies: `SHA256("secret") == room.password` → allow.
5. If password wrong → reject with error.

Public rooms (no password) are listed in `listPublicRooms()` and broadcasted in `rooms:list`.

## Q8: "Why two canvas layers instead of one?"

**Answer:**
- **Committed canvas (`ctx`):** Holds finalized ops. Only redrawn on undo/redo or new op commit.
- **Live canvas (`liveCtx`):** Shows in-progress (local + remote) strokes. Redrawn every pointer move and network update.

**Benefit:** Don't replay entire history every frame. If history has 1000 ops, committing a new op doesn't require redrawing all 1000 on the same canvas.

**Alternative:** Single canvas, redraw all ops every frame. Fast enough for small histories but slow for thousands of ops.

## Q9: "How does cursor tracking work?"

**Answer:**
1. During `pointerMove`, normalize cursor position.
2. Throttle: emit `cursor:move` max once per 33ms (~30 Hz).
3. Server: annotate with user's color and name, relay to room.
4. Other clients: create a div for each user's cursor, position it.
5. On disconnect, remove cursor div.

Provides real-time awareness of where others are hovering.

## Q10: "What would you improve if given more time?"

**Answer:**
1. **Persistence:** Add SQLite/PostgreSQL to persist rooms and ops.
2. **Undo/Redo Refinement:** Use operational transformation or CRDT for conflict-free merging.
3. **Performance:** Snapshot system (every N ops, save canvas bitmap + remaining ops).
4. **Security:** Use bcrypt for passwords, add user authentication (JWT).
5. **Scaling:** Add Redis pub/sub for multi-server support.
6. **Mobile:** Better touch event handling, brush preview.
7. **Testing:** Unit tests for DrawingState, integration tests for socket events.
8. **UI Polish:** Animations, toast notifications, better error messages.

---

## BONUS: Common Follow-Up Questions

### "How would you add multi-room support where one user is in multiple rooms?"

Each socket can join multiple Socket.io rooms:
```javascript
socket.join('room-1');
socket.join('room-2');
io.to('room-1').emit(...);  // Only room-1 clients receive
```
Downside: more complex UI (multiple canvases or tabs).

### "What happens if the server crashes?"

All in-memory state is lost. Clients reconnect but see no history. Solutions:
- Persist to DB before each op (latency hit).
- Batch persist (e.g., every 1s or 100 ops).
- Use Redis for distributed in-memory store.

### "How would you handle 1000 concurrent users?"

Current architecture doesn't scale:
- One Node process can handle ~1000 concurrent connections (depends on memory/CPU).
- Broadcasting to all users is O(n) network traffic.

Solutions:
- Horizontal scaling: multiple Node instances, Redis pub/sub for inter-process messages.
- Spatial partitioning: divide canvas into regions, only broadcast nearby strokes.
- Client filtering: client-side interest management (only render strokes in visible viewport).

### "What's the bandwidth usage for a typical session?"

Rough estimates:
- Brush: 30 points/sec × ~10 bytes per point × N clients = ~3 KB/s per user.
- Eraser: 60 points/sec × ~10 bytes = ~600 bytes/s per user.
- Cursor: 30 Hz × ~20 bytes = ~600 bytes/s per user.
- Total: ~5 KB/s per user (acceptable for modern networks).

---

## SUMMARY

**Key Takeaway:** Collaborative Canvas balances simplicity with responsiveness. Per-user undo is intuitive and implementable without complex OT. Optimistic commits and layered rendering provide low-latency UX. The trade-off is sacrificing global shared undo (which confuses collaborative users) and accepting some visual surprises with overlapping ops.

**Interview Strategy:**
1. Start with the 30-second summary.
2. Walk through the data flow (drawing action).
3. Deep dive into one critical section (e.g., per-user undo) if asked.
4. Discuss trade-offs and improvements to show systems thinking.
5. Ask clarifying questions about scale/security if interviewer cares about those aspects.

Good luck with your interview!
