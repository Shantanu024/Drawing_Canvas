(function(){
  const modal = document.getElementById('roomModal');
  const createTab = document.getElementById('createTab');
  const joinTab = document.getElementById('joinTab');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const createRoomBtn = document.getElementById('createRoomBtn');
  const joinRoomBtn = document.getElementById('joinRoomBtn');
  const createRoomId = document.getElementById('createRoomId');
  const createPassword = document.getElementById('createPassword');
  const createUsername = document.getElementById('createUsername');
  const joinRoomId = document.getElementById('joinRoomId');
  const joinPassword = document.getElementById('joinPassword');
  const joinUsername = document.getElementById('joinUsername');
  const modalError = document.getElementById('modalError');
  const roomsList = document.getElementById('roomsList');
  const roomInfo = document.getElementById('roomInfo');

  let currentRoom = null;
  let currentUsername = null;

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      createTab.classList.remove('active');
      joinTab.classList.remove('active');
      
      if (btn.dataset.tab === 'create') {
        createTab.classList.add('active');
      } else {
        joinTab.classList.add('active');
        loadPublicRooms();
      }
    });
  });

  function showError(msg) {
    modalError.textContent = msg;
    modalError.style.display = 'block';
    setTimeout(() => {
      modalError.style.display = 'none';
    }, 5000);
  }

  function hideModal() {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }

  function showModal() {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalError.style.display = 'none';
  }

  createRoomBtn.addEventListener('click', async () => {
    const roomId = createRoomId.value.trim();
    const password = createPassword.value.trim();
    const username = createUsername.value.trim() || 'Guest';

    if (!roomId) {
      showError('Please enter a room ID');
      return;
    }

    createRoomBtn.disabled = true;
    try {
      const result = await WS.createRoom({ room: roomId, password: password || null, username });
      currentRoom = roomId;
      currentUsername = username;
      roomInfo.textContent = `Room: ${roomId} | User: ${username}`;
      setTimeout(() => hideModal(), 100);
    } catch (e) {
      showError('Failed to create room: ' + e.message);
      createRoomBtn.disabled = false;
    }
  });

  joinRoomBtn.addEventListener('click', async () => {
    const roomId = joinRoomId.value.trim();
    const password = joinPassword.value.trim();
    const username = joinUsername.value.trim() || 'Guest';

    if (!roomId) {
      showError('Please enter a room ID');
      return;
    }

    joinRoomBtn.disabled = true;
    try {
      const result = await WS.joinRoom({ room: roomId, password: password || null, username });
      currentRoom = roomId;
      currentUsername = username;
      roomInfo.textContent = `Room: ${roomId} | User: ${username}`;
      setTimeout(() => hideModal(), 100);
    } catch (e) {
      showError('Failed to join room: ' + e.message);
      joinRoomBtn.disabled = false;
    }
  });

  // Quick join from public rooms list
  async function quickJoin(roomId) {
    const username = prompt('Enter your name:', 'Guest') || 'Guest';
    if (!username) return; // User cancelled
    try {
      const result = await WS.joinRoom({ room: roomId, password: null, username });
      currentRoom = roomId;
      currentUsername = username;
      roomInfo.textContent = `Room: ${roomId} | User: ${username}`;
      setTimeout(() => hideModal(), 100);
    } catch (e) {
      showError('Failed to join room: ' + e.message);
    }
  }

  function loadPublicRooms() {
    // This would ideally fetch from server, but for now we'll load from WS
    if (WS.getPublicRooms) {
      updateRoomsList(WS.getPublicRooms() || []);
    }
  }

  // Update the public rooms list UI
  function updateRoomsList(list) {
    const rooms = list || [];
    roomsList.innerHTML = '';
    if (!rooms || rooms.length === 0) {
      roomsList.innerHTML = '<li>No public rooms available. Create one first!</li>';
      return;
    }
    rooms.forEach(room => {
      const li = document.createElement('li');
      li.className = 'room-item';
      li.innerHTML = `
        <span class="room-name">${room.id}</span>
        <span class="room-users">${room.userCount} user${room.userCount !== 1 ? 's' : ''}</span>
        <button class="quick-join-btn">Join</button>
      `;
      li.querySelector('.quick-join-btn').addEventListener('click', () => {
        quickJoin(room.id);
      });
      roomsList.appendChild(li);
    });
  }

  // Listen for rooms updates from server
  WS.on('rooms:list', (rooms) => {
    // update UI if join tab is active
    const activeTab = document.querySelector('.tab-btn.active')?.dataset?.tab;
    if (activeTab === 'join') updateRoomsList(rooms);
  });

  // The header "Change Room" button was removed; modal can still be shown on load

  // Show modal on load
  window.addEventListener('load', () => {
    if (!modal) return; // Skip if modal not found
    showModal();
    // Pre-fill from URL params if available
    const params = new URLSearchParams(location.search);
    if (params.get('room')) {
      if (joinRoomId) joinRoomId.value = params.get('room');
      // Switch to join tab
      const joinBtn = document.querySelector('[data-tab="join"]');
      if (joinBtn) joinBtn.click();
    }
    if (params.get('name')) {
      if (joinUsername) joinUsername.value = params.get('name');
    }
  });

  window.RoomDialog = { hideModal, showModal, showError };
})();
