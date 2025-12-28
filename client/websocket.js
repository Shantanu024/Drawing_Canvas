
// Minimal Socket.io wrapper
(function(){
  const bus = new EventTarget();
  let socket = null;
  let publicRooms = [];
  let connectionPromise = null;

  // Initialize socket connection on script load
  function initSocket() {
    if (connectionPromise) return connectionPromise;
    
    connectionPromise = new Promise((resolve, reject) => {
      socket = io();
      socket.on('connect', () => {
        dispatch('status', { connected: true });
        resolve();
      });

      socket.on('disconnect', () => dispatch('status', { connected: false }));
      
      socket.on('error', (error) => {
        if (process.env.NODE_ENV !== 'production') console.error('Socket error:', error);
        dispatch('status', { connected: false, error: error });
      });
      
      socket.on('connect_error', (error) => {
        if (process.env.NODE_ENV !== 'production') console.error('Connection error:', error);
        dispatch('status', { connected: false, error: error });
      });

      // State sync
      socket.on('state:init', (s) => dispatch('state:init', s));
      socket.on('state:op-append', (s) => dispatch('state:op-append', s));
      socket.on('state:full', (s) => dispatch('state:full', s));

      // Presence
      socket.on('user:list', (u) => dispatch('user:list', u));

      // Cursors & live strokes
      socket.on('cursor:move', (c) => dispatch('cursor:move', c));
      socket.on('stroke:begin', (p) => dispatch('stroke:begin', p));
      socket.on('stroke:chunk', (p) => dispatch('stroke:chunk', p));

      // Public rooms list
      socket.on('rooms:list', (rooms) => {
        publicRooms = rooms;
        dispatch('rooms:list', rooms);
      });
    });
    
    return connectionPromise;
  }

  function connect({ room, username }){
    return new Promise((resolve, reject) => {
      initSocket().then(() => {
        socket.emit('join', { room, username });
        socket.once('state:init', (s) => resolve(s));
      }).catch(reject);
    });
  }

  function createRoom({ room, password, username }) {
    return new Promise((resolve, reject) => {
      initSocket().then(() => {
        // Emit room:create and resolve based on the server ack. The server
        // already emits the initial state before calling the ack callback,
        // and we have a global 'state:init' handler registered in initSocket(),
        // so we should resolve immediately when the ack arrives to avoid a
        // race where 'state:init' was emitted before a one-time listener is
        // attached.
        socket.emit('room:create', { room, password, username }, (response) => {
          if (response.success) {
            dispatch('status', { connected: true });
            resolve(response);
          } else {
            reject(new Error(response.error || 'Failed to create room'));
          }
        });
      }).catch(reject);
    });
  }

  function joinRoom({ room, password, username }) {
    return new Promise((resolve, reject) => {
      initSocket().then(() => {
        socket.emit('room:join', { room, password, username }, (response) => {
          if (response.success) {
            dispatch('status', { connected: true });
            resolve(response);
          } else {
            reject(new Error(response.error || 'Failed to join room'));
          }
        });
      }).catch(reject);
    });
  }

  function on(type, cb){ bus.addEventListener(type, (e) => cb(e.detail)); }
  function dispatch(type, detail){ bus.dispatchEvent(new CustomEvent(type, { detail })); }

  // Outbound emits
  function sendCursor(pos){ socket && socket.emit('cursor:move', pos); }
  function beginStroke(payload){ socket && socket.emit('stroke:begin', payload); }
  function strokeChunk(payload){ socket && socket.emit('stroke:chunk', payload); }
  function endStroke(payload){ socket && socket.emit('stroke:end', payload); }
  function undo(){ socket && socket.emit('op:undo'); }
  function redo(){ socket && socket.emit('op:redo'); }
  function getPublicRooms(){ return publicRooms; }

  // Initialize socket immediately when script loads
  initSocket();

  window.WS = { connect, createRoom, joinRoom, on, sendCursor, beginStroke, strokeChunk, endStroke, undo, redo, getPublicRooms };
})();
