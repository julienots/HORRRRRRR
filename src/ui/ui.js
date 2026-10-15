// DOM user interface: menus, HUD, inventory, journal, document reader, options & key bindings.
import { settings, saveSettings, resetSettings, QUALITY, DEFAULT_BINDINGS } from '../core/settings.js';
import { ITEMS } from '../game/items.js';
import { DOCUMENTS } from '../game/story.js';

const $ = (s) => document.querySelector(s);
const ACTION_LABELS = {
  forward: 'Avancer', back: 'Reculer', left: 'Gauche', right: 'Droite', sprint: 'Courir', crouch: "S'accroupir",
  interact: 'Interagir / se cacher', flashlight: 'Lampe torche', leanLeft: 'Se pencher à gauche', leanRight: 'Se pencher à droite',
  holdBreath: 'Retenir son souffle', throw: 'Lancer une bouteille', inventory: 'Inventaire', journal: 'Journal', heal: 'Se soigner (bandage)',
  objectives: 'Afficher l\'objectif', lock: 'Verrouiller une porte (WC, salle de bain)',
};
// shows the real label of the key on the player's layout (AZERTY...) when the browser exposes it
let layout = null;
if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then((m) => { layout = m; }).catch(() => {});
export const keyName = (code) => (layout && /^(Key|Digit)/.test(code || "") && layout.get(code) ? layout.get(code).toUpperCase() : null) || (code || '—').replace('Key', '').replace('Digit', '').replace('Left', ' G').replace('Right', ' D').replace('Space', 'Espace').replace('Shift', 'Maj').replace('Control', 'Ctrl');

export class UI {
  constructor(game) {
    this.game = game;
    this.toastT = 0;
    this.subT = 0;
    this.objT = 0;
    this.actT = 0;
    this.openPanel = null;
    this.returnTo = null;
    this.bindListen = null;
    this.wire();
  }

  show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  wire() {
    const g = this.game;
    $('#mainbuttons').addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.act;
      if (a === 'new') { this.show('#mainbuttons', false); this.show('#diffbuttons'); }
      if (a === 'continue') g.continueGame();
      if (a === 'options') this.openOptions('#menu');
      if (a === 'controls') this.openControls('#menu');
    });
    $('#diffbuttons').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'back') { this.show('#diffbuttons', false); this.show('#mainbuttons'); return; }
      if (b.dataset.diff) g.newGame(b.dataset.diff);
    });
    $('#pause').addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.act;
      if (a === 'resume') g.resume();
      if (a === 'save') g.saveGame(true);
      if (a === 'load') g.loadGame();
      if (a === 'options') this.openOptions('#pause');
      if (a === 'controls') this.openControls('#pause');
      if (a === 'quit') g.quitToMenu();
    });
    $('#death').addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.act;
      if (a === 'load') g.loadGame();
      if (a === 'quit') g.quitToMenu();
    });
    $('#ending').addEventListener('click', (e) => {
      if (e.target.closest('button')?.dataset.act === 'quit') g.quitToMenu();
    });
    for (const id of ['#options', '#controls']) {
      $(id).addEventListener('click', (e) => {
        const a = e.target.closest('button')?.dataset.act;
        if (a === 'close') this.closeSub(id);
        if (a === 'reset') { resetSettings(); this.openOptions(this.returnTo); g.applySettings(); }
      });
    }
    $('#inventory').addEventListener('click', (e) => { if (e.target.closest('button')?.dataset.act === 'close') g.togglePanel('inventory'); });
    $('#journal').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b?.dataset.act === 'close') g.togglePanel('journal');
      if (b?.dataset.tab) this.renderJournal(b.dataset.tab);
      const d = e.target.closest('.doc');
      if (d) this.openDoc(d.dataset.doc);
    });
    $('#reader').addEventListener('click', () => this.closeDoc());
    $('#clicktoplay').addEventListener('click', () => g.resume());
    window.addEventListener('keydown', (e) => {
      if (this.bindListen) {
        e.preventDefault();
        if (e.code !== 'Escape') { settings.bindings[this.bindListen] = e.code; saveSettings(); }
        this.bindListen = null;
        this.renderControls();
      }
    }, true);
  }

  // ---------------------------------------------------------------- menus
  showMenu(hasSave) {
    for (const s of ['#pause', '#death', '#ending', '#options', '#controls', '#inventory', '#journal', '#reader', '#loading', '#clicktoplay']) this.show(s, false);
    this.show('#hud', false);
    this.show('#menu');
    this.show('#mainbuttons');
    this.show('#diffbuttons', false);
    $('#btn-continue').disabled = !hasSave;
  }

  openOptions(from) {
    this.returnTo = from;
    if (from) this.show(from, false);
    this.show('#options');
    const grid = $('#optgrid');
    const g = this.game;
    const row = (label, html) => `<label>${label}</label><div>${html}</div>`;
    const range = (key, min, max, step) => `<input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}">`;
    const check = (key) => `<input type="checkbox" data-k="${key}" ${settings[key] ? 'checked' : ''}>`;
    grid.innerHTML = [
      row('Qualité graphique', `<select data-k="quality">${Object.entries(QUALITY).map(([k, q]) => `<option value="${k}" ${settings.quality === k ? 'selected' : ''}>${q.label}</option>`).join('')}</select>`),
      row('Champ de vision', range('fov', 55, 100, 1) + `<span id="fovv"> ${settings.fov}°</span>`),
      row('Sensibilité souris', range('sensitivity', 0.2, 3, 0.05)),
      row('Inverser l\'axe Y', check('invertY')),
      row('Mouvements de caméra', range('headBob', 0, 1.5, 0.05)),
      row('Luminosité', range('brightness', 0.6, 1.8, 0.05)),
      row('Grain de film', check('filmGrain')),
      row('Aberration chromatique', check('chromatic')),
      row('Volume général', range('master', 0, 1, 0.01)),
      row('Musique', range('music', 0, 1, 0.01)),
      row('Effets sonores', range('sfx', 0, 1, 0.01)),
      row('Sous-titres', check('subtitles')),
      row('Traces de sang (indices pour la poupée)', check('bloodTrail')),
    ].join('');
    grid.querySelectorAll('[data-k]').forEach((el) => {
      el.addEventListener('input', () => {
        const k = el.dataset.k;
        settings[k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : parseFloat(el.value);
        if (k === 'fov') $('#fovv').textContent = ` ${settings.fov}°`;
        saveSettings();
        g.applySettings(k);
      });
    });
    if (settings.quality) this.note('#options', 'Le changement de qualité s\'applique entièrement au prochain lancement de partie.');
  }

  note() { /* reserved */ }

  openControls(from) {
    this.returnTo = from;
    if (from) this.show(from, false);
    this.show('#controls');
    this.renderControls();
  }

  renderControls() {
    const grid = $('#ctrlgrid');
    grid.innerHTML = Object.keys(DEFAULT_BINDINGS).map((a) => `<label>${ACTION_LABELS[a]}</label><div class="key ${this.bindListen === a ? 'wait' : ''}" data-a="${a}">${this.bindListen === a ? '…' : keyName(settings.bindings[a])}</div>`).join('')
      + '<label>Regarder</label><div>Souris</div><label>Pause</label><div>Échap</div>';
    grid.querySelectorAll('.key').forEach((el) => el.addEventListener('click', () => { this.bindListen = el.dataset.a; this.renderControls(); }));
  }

  closeSub(id) {
    this.show(id, false);
    if (this.returnTo) this.show(this.returnTo);
  }

  // ---------------------------------------------------------------- HUD
  toast(text, dur = 3) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('on');
    this.toastT = dur;
  }

  subtitle(text, dur = 3) {
    if (!settings.subtitles) return;
    $('#subs').textContent = text;
    this.subT = dur;
  }

  objective(text, dur = 7) {
    const o = $('#objective');
    o.textContent = text;
    o.classList.add('on');
    this.objT = dur;
  }

  actCard(title, sub) {
    $('#actcard .act-title').textContent = title;
    $('#actcard .act-sub').textContent = sub;
    $('#actcard').classList.add('on');
    this.actT = 5;
  }

  prompt(html) { $('#prompt').innerHTML = html || ''; }

  update(dt) {
    const g = this.game, p = g.player;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('#toast').classList.remove('on'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) $('#subs').textContent = ''; }
    if (this.objT > 0) { this.objT -= dt; if (this.objT <= 0) $('#objective').classList.remove('on'); }
    if (this.actT > 0) { this.actT -= dt; if (this.actT <= 0) $('#actcard').classList.remove('on'); }
    if (!p) return;
    $('#bleed').classList.toggle('on', p.injury.bleeding);
    $('#battery').classList.toggle('on', p.hasFlashlight);
    const bf = $('#battery .fill');
    bf.style.width = Math.max(0, p.battery) + '%';
    bf.style.background = p.battery < 20 ? '#b33' : '#d8cfbf';
    $('#stamina').classList.toggle('on', p.stamina < 99);
    $('#stamina .fill').style.width = p.stamina + '%';
    $('#stamina .fill').style.background = p.exhausted ? '#933' : '#d8cfbf';
    $('#breath').classList.toggle('on', p.holding || p.breath < 1);
    $('#breath .fill').style.width = p.breath * 100 + '%';
    if (p.healing) {
      $('#progress').classList.add('on');
      $('#progress .label').textContent = p.healing.label;
      $('#progress .fill').style.width = (p.healing.t / p.healing.dur) * 100 + '%';
    } else $('#progress').classList.remove('on');
    const k = settings.bindings;
    if (g.input.touch) $('#hidehint').innerHTML = p.hidden ? '<kbd>Agir</kbd>Sortir &nbsp; <kbd>Souffle</kbd>Retenir son souffle' : '';
    else $('#hidehint').innerHTML = p.hidden ? `<kbd>${keyName(k.interact)}</kbd>Sortir &nbsp; <kbd>${keyName(k.holdBreath)}</kbd>Retenir son souffle &nbsp; <kbd>Souris</kbd>Regarder` : '';
    $('#crosshair').style.display = p.hidden ? 'none' : 'block';
  }

  debug(text) { $('#debug').textContent = text; }

  // ---------------------------------------------------------------- inventory
  renderInventory() {
    const g = this.game, inv = g.inventory;
    const grid = $('#invgrid');
    const ids = Object.keys(inv).filter((k) => inv[k] > 0);
    grid.innerHTML = ids.length ? ids.map((id) => `<div class="slot" data-id="${id}"><div class="ic">${ITEMS[id].icon}</div><div class="nm">${ITEMS[id].name}</div>${inv[id] > 1 ? `<div class="ct">×${inv[id]}</div>` : ''}</div>`).join('') : '<div class="note">Tu n\'as rien.</div>';
    $('#invdesc').innerHTML = '';
    grid.querySelectorAll('.slot').forEach((el) => el.addEventListener('click', () => {
      grid.querySelectorAll('.slot').forEach((s) => s.classList.remove('sel'));
      el.classList.add('sel');
      const it = ITEMS[el.dataset.id];
      $('#invdesc').innerHTML = `<b>${it.name}</b> — ${it.desc}` + (it.usable ? `<br><button id="usebtn">Utiliser</button>` : '');
      const ub = $('#usebtn');
      if (ub) ub.addEventListener('click', () => { g.useItem(el.dataset.id); this.renderInventory(); });
    }));
    const p = g.player;
    const lvl = (v) => (v > 0.66 ? 'grave' : v > 0.33 ? 'sérieuse' : v > 0.05 ? 'légère' : 'aucune');
    $('#vitals').innerHTML = `Santé : ${Math.round(p.health)}% · Blessure à la jambe : ${lvl(p.injury.leg)} · Blessure au bras : ${lvl(p.injury.arm)}` +
      ` · ${p.injury.bleeding ? '<span style="color:#c33">Saignement</span>' : 'Pas de saignement'}` + (p.painRelief > 0 ? ' · Analgésiques actifs' : '') +
      ` · Piles : ${Math.round(p.battery)}%`;
  }

  // ---------------------------------------------------------------- journal
  renderJournal(tab = 'obj') {
    const g = this.game;
    document.querySelectorAll('#journal .tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const c = $('#jcontent');
    if (tab === 'obj') {
      c.innerHTML = g.objectiveLog.map((o, i) => `<div class="${i === g.objectiveLog.length - 1 ? 'cur' : 'done'}">${o}</div>`).join('') || '<div class="note">—</div>';
    } else if (tab === 'docs') {
      c.innerHTML = g.docsRead.map((id) => `<div class="doc" data-doc="${id}">📜 ${DOCUMENTS[id].title}</div>`).join('') || '<div class="note">Aucun document trouvé.</div>';
    } else {
      c.innerHTML = g.clues.map((t) => `<div>• ${t}</div>`).join('') || '<div class="note">Aucun indice.</div>';
    }
  }

  openDoc(id) {
    const d = DOCUMENTS[id];
    $('#reader .ptitle').textContent = d.title;
    $('#reader .ptext').textContent = d.text;
    this.show('#reader');
    this.readerOpen = true;
  }

  closeDoc() {
    this.show('#reader', false);
    this.readerOpen = false;
    this.game.onReaderClosed();
  }
}

export { $ };
