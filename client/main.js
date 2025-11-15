
(function(){
  const usersEl = document.getElementById('users');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');

  undoBtn.addEventListener('click', () => WS.undo());
  redoBtn.addEventListener('click', () => WS.redo());

  // Presence list
  WS.on('user:list', (list) => {
    usersEl.innerHTML = '';
    list.forEach(u => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="swatch" style="background:${u.color}"></span> <span>${u.name}</span>`;
      usersEl.appendChild(li);
    });
  });
})();
