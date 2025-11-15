### **ARCHITECTURE**

---
## **1. How Drawing Events Flow (Data Flow)**

1. You start drawing → Your browser batches pointer movements and sends them to the server
2. Server receives your stroke → It relays the live drawing to other users immediately
3. You finish drawing → Server saves it as a permanent "operation" and broadcasts it to everyone
4. Others see your stroke → First as a live preview, then as a committed drawing

***flowchart***
Your Canvas -> [batched points] -> Server -> [relay] -> 
Other Users' Canvas -> [save as operation] -> 
[broadcast to everyone]

The same flow works for erasers and cursors, just with different message types.

---
## **2. WebSocket Messages**
What your browser sends to the server:

-->`join` - Join a room with your username
-->`cursor:move` - Your cursor position (x, y between 0-1)
-->`stroke:begin` - Started drawing (tool, color, width, starting point)
-->`stroke:chunk` - Drawing in progress (list of points)
-->`stroke:end` - Finished drawing (complete stroke data)
-->`op:undo / op:redo` - Undo or redo request

What the server sends back:

-->`state:init` - Initial room state when you join
-->`user:list` - Who's currently in the room
-->`cursor:move` - Someone else's cursor moving
-->`stroke:begin/chunk` - Someone else drawing in real-time
-->`state:op-append` - A new permanent drawing was committed
-->`state:full` - Complete canvas state (after undo/redo)

---
## **3. Undo/Redo: How It Works**
The server maintains a single timeline of all drawings as a list, like a stack of transparent sheets.

-->**Undo:** Move the "active pointer" back one step (hide the last drawing)
-->**Redo:** Move the pointer forward one step (show it again)
-->**Draw something new after undo:** Everything after the pointer gets deleted, and your new drawing is added to the end

When someone hits undo/redo, the server sends everyone the complete list of active operations. Your browser then clears the canvas and redraws everything from scratch in order.

*Why I didn't use fancy conflict-free data structures?* :- Because a simple linear timeline is easier to understand, matches what users expect from drawing apps, and makes undo/redo predictable for everyone.

---
## **4. Performance Optimizations**
Pointer batching: Instead of sending every tiny mouse movement, it collect points during each animation frame and send them in batches. This keeps the network quiet while drawings stay smooth.
Normalized coordinates: All positions are stored as 0-1 values (percentages), so different screen sizes don't need special handling.

-->**Two-layer canvas system:**
1. Bottom layer: Finished, committed drawings (never changes unless undo/redo)
2. Top layer: Live strokes (yours and others') that are still being drawn

This avoids redrawing thousands of finished strokes every time someone moves their mouse.

-->**Smart redrawing:** Most of the time, we only add new strokes. Full canvas replays only happen after undo/redo or when you first join. For rooms with thousands of strokes, we *could* add snapshots (saving canvas images every 100 strokes) to avoid replaying everything.

---
## **5. Handling Drawing Conflicts**
-->**Overlapping strokes:** Later drawings appear on top. If two people draw at the same spot simultaneously, whoever's stroke reaches the server first wins the bottom layer.
-->**The eraser:** Uses a special "cut out" mode that removes pixels from anything below it, regardless of who drew it. So yes, you can erase other people's work.
-->**Live vs committed order:** While drawing, you see everyone's strokes in real-time on the overlay. Once committed, the server determines the final stacking order, and everyone's canvas updates to match.

---
## **6. Error Handling**

-->Can't draw until you've joined a room.
-->Server checks you're in the room before accepting your strokes.
-->If you disconnect, your cursor disappears from everyone's screen.
-->If you miss some live packets due to network issues, the committed operation messages keep you in sync.
-->No authentication system (this is a demo), so anyone can join any room.

>**Data persistence:** Everything lives in server memory. Restart the server = lose all drawings.