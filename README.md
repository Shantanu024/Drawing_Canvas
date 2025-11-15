
### 🖌️ Collaborative Canvas
A real-time multiplayer drawing app where you can sketch with friends. Built with vanilla JavaScript, HTML5 Canvas, and Node.js. See everyone's cursor, watch them draw live, and even undo each other's work!

---
## **1. What You Can Do**

1. Draw together - Pick colors, adjust brush size, or grab the eraser
2. See it happen - Watch strokes appear as others draw them, *not after* they're done
3. Track everyone - Live cursor indicators show who's where
Undo/Redo for everyone - Hit undo and it affects the whole canvas, not just your drawings
4. Join rooms - Multiple groups can draw in separate rooms
Works everywhere - Handles different screen sizes and resolutions automatically

---
## **2. Getting Started**
*in bash*
```npm install
npm start
```
Then open http://localhost:3000 in your browser. That's it!
If you want auto-reload during development then use 
`npm run dev` instead.

---
## **3. Testing with Multiple Users**
The easiest way to test is opening multiple browser tabs or windows:

Open http://localhost:3000?room=test&name=Alice  in one window
Open http://localhost:3000?room=test&name=Bob in another window
Start drawing in one window *(taken names Alice and Bob for examples)* and watch it appear in the other

**Try these things:**
1. Draw at the same time (you'll see both strokes)
Move your cursor around (you'll see each other's cursors with names)
2. Hit Undo in one window (it affects both canvases)

**shortcuts:**
Ctrl+Z for Undo
Ctrl+Shift+Z for Redo

---
## **4. How It Works**
**Live drawing:** As you draw, your browser sends small batches of points to the server every 16ms. The server immediately relays these to everyone else, so they see your stroke forming in real-time.
**Committing drawings:** When you lift your mouse/pen, the server saves your complete stroke as a permanent "operation" and tells everyone to add it to their canvas.
**Undo/Redo for everyone:** The server keeps a master list of all drawings. When someone hits undo, the server moves a pointer back one step and tells everyone to redraw the canvas with everything except the last operation. New drawings after an undo wipe out the redo history .
**Handling conflicts:** If two people draw at the same spot, the one whose stroke reaches the server first goes underneath. The eraser cuts through everything, regardless of who drew it.

---
## **5. Known Issues & Limitations**
1. **No saved drawings:** Everything lives in the server's memory. Restart the server and all drawings disappear.
2. **Undo affects everyone:** There's no "undo just my stuff" option. One person's undo undoes the last action from anyone.
3. **Large canvases get slow:** With thousands of strokes, undo/redo has to redraw everything from scratch. This works fine for normal use but could lag with massive drawings. (We could fix this with periodic snapshots.)
4. **Basic smoothing:** Strokes are smoothed using simple curves. More advanced algorithms could make them even prettier.
5. **No authentication:** Anyone can join any room. This is a demo, not a production app!

---
## **6. Time Breakdown**

Planning the architecture and API: 2 hours
Building the server (Socket.io, room logic): 4 hours
Building the client (canvas, drawing, events): 5 hours
Testing and fixing bugs: 3-4 hours
Writing documentation: 2 hours

Total: ~ 16-17 hours

---
## **7. Available Commands**
`npm start` - Run the server
`npm run dev` - Run with auto-reload (needs Nodemon)