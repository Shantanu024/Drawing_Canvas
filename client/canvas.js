
(function(){
  const DPR = Math.max(1, window.devicePixelRatio || 1);
  const canvas = document.getElementById('canvas');
  const live = document.getElementById('live');
  const wrap = document.getElementById('canvasWrap');
  
  // Guard against missing elements
  if (!canvas || !live || !wrap) {
    console.error('Canvas elements not found. Check HTML structure.');
    return;
  }
  
  const cursorsEl = document.getElementById('cursors');
  const statusEl = document.getElementById('status');
  const revEl = document.getElementById('rev');

  const toolEl = document.getElementById('tool');
  const colorEl = document.getElementById('color');
  const widthEl = document.getElementById('width');
  const widthValEl = document.getElementById('widthVal');

  const ctx = canvas.getContext('2d');
  const liveCtx = live.getContext('2d');
  
  // Guard against canvas context failures
  if (!ctx || !liveCtx) {
    console.error('Failed to get canvas contexts');
    return;
  }

  let isDrawing = false;
  let strokeId = null;
  let localBuffer = []; // queued points to send
  let lastSent = 0;
  let rafHandle = null;

  // State
  let self = null;
  let revision = 0;
  const liveStrokes = new Map(); // strokeId -> { points, tool, color, width, userId }
  const cursorEls = new Map(); // userId -> HTMLElement

  // Normalize coordinates into [0..1]
  function normalize(pt){
    const rect = wrap.getBoundingClientRect();
    return { x: (pt.x - rect.left) / rect.width, y: (pt.y - rect.top) / rect.height, t: Date.now() };
  }
  function denorm(p){
    return { x: p.x * canvas.width / DPR, y: p.y * canvas.height / DPR };
  }

  function setCanvasSize(){
    const rect = wrap.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * DPR);
    canvas.height = Math.floor(rect.height * DPR);
    live.width = canvas.width; live.height = canvas.height;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    live.style.width = rect.width + 'px';
    live.style.height = rect.height + 'px';
    ctx.setTransform(1,0,0,1,0,0);
    liveCtx.setTransform(1,0,0,1,0,0);
    ctx.scale(DPR, DPR);
    liveCtx.scale(DPR, DPR);
    redrawAll();
  }
  window.addEventListener('resize', setCanvasSize);

  // Drawing helpers
  function drawStroke(context, op){
    const { tool, color, width, points } = op;
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = width;
    context.strokeStyle = color || '#000';
    context.globalCompositeOperation = (tool === 'eraser') ? 'destination-out' : 'source-over';

    context.beginPath();
    for (let i = 0; i < points.length; i++){
      const p = denorm(points[i]);
      if (i === 0){
        context.moveTo(p.x, p.y);
      } else {
        // simple smoothing: quadratic curve to midpoint
        const prev = denorm(points[i-1]);
        const midX = (prev.x + p.x) / 2;
        const midY = (prev.y + p.y) / 2;
        context.quadraticCurveTo(prev.x, prev.y, midX, midY);
      }
    }
    context.stroke();
    context.restore();
  }

  function clearCanvas(ctx){
    const rect = wrap.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  // State reconstruction on undo/redo or init
  let committedOps = [];
  function redrawAll(){
    const rect = wrap.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const op of committedOps){
      drawStroke(ctx, op);
    }
  }

  // Live strokes rendering
  function drawLive(){
    clearCanvas(liveCtx);
    for (const s of liveStrokes.values()){
      drawStroke(liveCtx, s);
    }
  }

  function scheduleSend(){
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      if (localBuffer.length){
        WS.strokeChunk({ strokeId, points: localBuffer.slice() });
        localBuffer.length = 0;
      }
      drawLive();
    });
  }

  function pointerDown(e){
    if (!self) return;
    isDrawing = true;
    strokeId = cryptoRandom();
    const tool = toolEl?.value || 'brush';
    const color = colorEl?.value || '#000000';
    const width = +(widthEl?.value || 3);
    const pt = normalize({ x: e.clientX, y: e.clientY });

    const liveObj = { strokeId, tool, color, width, points: [pt] };
    liveStrokes.set(strokeId, liveObj);
    WS.beginStroke({ strokeId, tool, color, width, start: pt });
    // Draw immediately so eraser/brush feedback is responsive
    // For eraser we also apply the path directly to the committed canvas
    if (tool === 'eraser') {
      // draw a tiny circle to start the erase
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      const d = denorm(pt);
      ctx.arc(d.x, d.y, width/2, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    drawLive();
    scheduleSend();
  }
  function pointerMove(e){
    if (!self) return;
    const rect = wrap.getBoundingClientRect();
    const cursor = { x: (e.clientX - rect.left), y: (e.clientY - rect.top) };
    // broadcast normalized cursor, but also position local indicator instantly
    const npos = { x: cursor.x/rect.width, y: cursor.y/rect.height };
    throttleCursor(npos);

    if (!isDrawing) return;
    const pt = normalize({ x: e.clientX, y: e.clientY });
    const s = liveStrokes.get(strokeId);
    if (!s) return;
    const last = s.points[s.points.length - 1];
    const dx = pt.x - last.x, dy = pt.y - last.y;
    // drop very small moves to optimize path
    if ((dx*dx + dy*dy) < 0.00001) return;
    s.points.push(pt);
    // For eraser send chunks immediately to avoid batching latency,
    // otherwise buffer points for RAF batching.
    if (s.tool === 'eraser') {
      WS.strokeChunk({ strokeId, points: [pt] });
    } else {
      localBuffer.push(pt);
    }
    // Render live immediately to avoid input lag (especially for eraser)
    // If erasing, also apply incremental erase directly to the committed canvas
    if (s.tool === 'eraser') {
      // draw segment from last -> pt on main canvas as destination-out
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = s.width;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      const p0 = denorm(last);
      const p1 = denorm(pt);
      ctx.moveTo(p0.x, p0.y);
      // simple smoothing to match drawStroke behavior
      ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x)/2, (p0.y + p1.y)/2);
      ctx.stroke();
      ctx.restore();
      // Also update live overlay so other clients see the stroke as it's drawn
      drawLive();
    } else {
      drawLive();
    }
    scheduleSend();
  }
  function pointerUp(){
    if (!isDrawing) return;
    isDrawing = false;
    const s = liveStrokes.get(strokeId);
    if (!s) return;
    // flush remaining points for non-eraser
    if (localBuffer.length){
      WS.strokeChunk({ strokeId, points: localBuffer.slice() });
      localBuffer.length = 0;
    }
    WS.endStroke({ strokeId, tool: s.tool, color: s.color, width: s.width, points: s.points });
    // Optimistic local commit: append op locally so eraser is immediate
    const optimisticOp = {
      id: strokeId,
      userId: self?.id || 'local',
      username: self?.name || 'You',
      tool: s?.tool || 'brush',
      color: (s?.tool === 'eraser') ? null : (s?.color || colorEl?.value || '#000000'),
      width: s?.width || +(widthEl?.value || 3),
      points: s?.points?.slice() || [],
      t0: Date.now()
    };
    if (!committedOps.find(o => o.id === optimisticOp.id)) {
      committedOps.push(optimisticOp);
    }
    // Remove live stroke now (we've moved it to committed)
    liveStrokes.delete(strokeId);
    // final pass: ensure any last tiny gap is removed by drawing last segment
    if (s.tool === 'eraser' && s.points.length >= 2) {
      const a = s.points[s.points.length-2];
      const b = s.points[s.points.length-1];
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = s.width;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      const p0 = denorm(a);
      const p1 = denorm(b);
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x)/2, (p0.y + p1.y)/2);
      ctx.stroke();
      ctx.restore();
    }
    drawLive();
  }

  // Event listeners on canvas wrapper to get correct coords
  wrap.addEventListener('pointerdown', (e)=>{ wrap.setPointerCapture(e.pointerId); pointerDown(e); });
  wrap.addEventListener('pointermove', pointerMove);
  wrap.addEventListener('pointerup', (e)=>{ wrap.releasePointerCapture(e.pointerId); pointerUp(e); });
  wrap.addEventListener('pointerleave', pointerUp);

  // Cursor indicators (others)
  function updateCursor(userId, norm, color, name){
    let el = cursorEls.get(userId);
    if (!el){
      el = document.createElement('div');
      el.className = 'cursor';
      el.innerHTML = `<div class="dot"></div><div class="label"></div>`;
      cursorsEl.appendChild(el);
      cursorEls.set(userId, el);
    }
    const rect = wrap.getBoundingClientRect();
    el.style.left = (norm.x * rect.width) + 'px';
    el.style.top = (norm.y * rect.height) + 'px';
    el.querySelector('.dot').style.background = color || '#000';
    el.querySelector('.label').textContent = name || '';
  }

  // Throttle cursor messages to ~30Hz
  let lastCursorSent = 0;
  function throttleCursor(npos){
    const now = performance.now();
    updateCursor(self?.id || 'self', npos, self?.color, 'You');
    if (now - lastCursorSent > 33){
      lastCursorSent = now;
      WS.sendCursor(npos);
    }
  }

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z'){
      e.preventDefault(); WS.undo();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z'){
      e.preventDefault(); WS.redo();
    } else if (e.key.toLowerCase() === 'e'){
      toolEl.value = 'eraser';
    } else if (e.key.toLowerCase() === 'b'){
      toolEl.value = 'brush';
    }
  });

  widthEl.addEventListener('input', ()=> widthValEl.textContent = widthEl.value);

  // WS events
  WS.on('status', ({ connected }) => {
    statusEl.textContent = connected ? 'Connected' : 'Disconnected';
  });

  WS.on('state:init', (s) => {
    self = s.self;
    revision = s.revision;
    revEl.textContent = `rev ${revision}`;
    // Store full ops data for visibility calculation
    window.fullOpsData = s.ops;
    committedOps = getVisibleOps(s.ops);
    // Ensure DOM has finished rendering before calculating canvas size
    requestAnimationFrame(() => {
      setCanvasSize();
    });
  });

  WS.on('state:op-append', ({ revision: rev, op }) => {
    revision = rev; revEl.textContent = `rev ${revision}`;
    // Avoid duplicate committed ops (may happen if we optimistic-commit locally)
    if (!committedOps.find(o => o.id === op.id)) {
      committedOps.push(op);
    }
    // Remove any corresponding live stroke
    liveStrokes.delete(op.id);
    drawStroke(ctx, op);
    drawLive();
  });

  WS.on('state:full', ({ revision: rev, ops }) => {
    revision = rev; revEl.textContent = `rev ${revision}`;
    window.fullOpsData = ops;
    committedOps = getVisibleOps(ops);
    redrawAll();
  });

  // Helper to get only visible ops (excluding user-undone ones)
  function getVisibleOps(opsData) {
    const visible = [];
    const { ops, activeCount, userUndoState } = opsData;
    const undoStates = userUndoState ? Object.entries(userUndoState) : [];
    const undoneMap = new Map();
    
    // Build map of undone op indices per user
    for (const [userId, state] of undoStates) {
      for (const idx of state.undoneOpIndices) {
        if (!undoneMap.has(userId)) undoneMap.set(userId, new Set());
        undoneMap.get(userId).add(idx);
      }
    }
    
    // Filter ops
    for (let i = 0; i < activeCount; i++) {
      const op = ops[i];
      const userUndo = undoneMap.get(op.userId);
      if (!userUndo || !userUndo.has(i)) {
        visible.push(op);
      }
    }
    return visible;
  }

  // Presence updates handled in main.js for list

  // Receiving other users' live strokes
  WS.on('stroke:begin', (s) => {
    const { strokeId, tool, color, width, userId, start } = s;
    liveStrokes.set(strokeId, { strokeId, tool, color, width, points: [start] });
    drawLive();
  });
  WS.on('stroke:chunk', (s) => {
    const cur = liveStrokes.get(s.strokeId);
    if (!cur) return;
    cur.points.push(...s.points);
    drawLive();
  });

  WS.on('cursor:move', ({ userId, x, y, color, name }) => {
    updateCursor(userId, { x, y }, color, name);
  });

  function cryptoRandom(){
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }

  window.CanvasApp = { redrawAll };
})();
