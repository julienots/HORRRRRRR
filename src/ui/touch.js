// Touch controls (phones / tablets): left virtual stick to move, drag on the right half to look,
// buttons for every essential action. Created only on touch devices (or with ?touch=1).
export function setupTouch(game) {
  const input = game.input;
  const force = new URLSearchParams(location.search).get('touch') === '1';
  if (!force && !('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return null;
  input.touch = true;
  document.body.classList.add('touch');
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div id="tlook"></div>
    <div id="tstick"><div class="knob"></div></div>
    <div class="tbtns right">
      <button data-a="interact" data-mode="tap">Agir</button>
      <button data-a="flashlight" data-mode="tap">Lampe</button>
      <button data-a="crouch" data-mode="tap">Accroupi</button>
      <button data-a="holdBreath" data-mode="hold">Souffle</button>
      <button data-a="sprint" data-mode="hold">Courir</button>
      <button data-a="throw" data-mode="tap">Lancer</button>
      <button data-a="lock" data-mode="tap">Verrou</button>
    </div>
    <div class="tbtns top">
      <button data-ui="inventory">Sac</button>
      <button data-ui="journal">Journal</button>
      <button data-ui="pause">❚❚</button>
    </div>`;
  document.getElementById('hud').appendChild(root);

  // ---- virtual stick
  const stick = root.querySelector('#tstick'), knob = stick.querySelector('.knob');
  let stickId = null, cx = 0, cy = 0;
  const R = 55;
  stick.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    stickId = t.identifier;
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(t);
    e.preventDefault();
  }, { passive: false });
  const move = (t) => {
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.axisX = dx / R;
    input.axisY = dy / R;
  };
  const end = () => { stickId = null; input.axisX = input.axisY = 0; knob.style.transform = ''; };
  stick.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === stickId) move(t);
    e.preventDefault();
  }, { passive: false });
  stick.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) end(); });
  stick.addEventListener('touchcancel', end);

  // ---- look: drag anywhere on the right part of the screen
  const look = root.querySelector('#tlook');
  const last = new Map();
  look.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) last.set(t.identifier, [t.clientX, t.clientY]);
    e.preventDefault();
  }, { passive: false });
  look.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      const p = last.get(t.identifier);
      if (!p) continue;
      input.mouseDX += (t.clientX - p[0]) * 1.6;
      input.mouseDY += (t.clientY - p[1]) * 1.6;
      last.set(t.identifier, [t.clientX, t.clientY]);
    }
    e.preventDefault();
  }, { passive: false });
  const lookEnd = (e) => { for (const t of e.changedTouches) last.delete(t.identifier); };
  look.addEventListener('touchend', lookEnd);
  look.addEventListener('touchcancel', lookEnd);

  // ---- action buttons (same virtual actions as the keyboard)
  for (const b of root.querySelectorAll('[data-a]')) {
    const a = b.dataset.a;
    b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      b.classList.add('on');
      if (b.dataset.mode === 'tap') input.tap(a);
      else input.hold(a, true);
    }, { passive: false });
    const up = (e) => { e.preventDefault(); b.classList.remove('on'); if (b.dataset.mode === 'hold') input.hold(a, false); };
    b.addEventListener('touchend', up, { passive: false });
    b.addEventListener('touchcancel', up, { passive: false });
  }
  for (const b of root.querySelectorAll('[data-ui]')) {
    b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const u = b.dataset.ui;
      if (u === 'pause') game.pause();
      else game.togglePanel(u);
    }, { passive: false });
  }
  return root;
}
