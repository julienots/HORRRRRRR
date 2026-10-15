// Player options, persisted in localStorage.
const KEY = 'superessence.settings.v1';

export const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  sprint: 'ShiftLeft', crouch: 'KeyC', interact: 'KeyE', flashlight: 'KeyF',
  leanLeft: 'KeyQ', leanRight: 'KeyR', holdBreath: 'Space', throw: 'KeyG',
  inventory: 'Tab', journal: 'KeyJ', heal: 'KeyH', objectives: 'KeyO', lock: 'KeyX',
};

export const QUALITY = {
  low: { label: 'Basse', pixelRatio: 0.75, tex: 256, aniso: 1, flashShadow: 512, pointShadows: 0, pool: 4, bloom: false, ao: false, dust: 150 },
  medium: { label: 'Moyenne', pixelRatio: 1, tex: 512, aniso: 4, flashShadow: 1024, pointShadows: 0, pool: 6, bloom: true, ao: false, dust: 350 },
  high: { label: 'Haute', pixelRatio: 1.25, tex: 1024, aniso: 8, flashShadow: 1024, pointShadows: 1, pool: 8, bloom: true, ao: false, dust: 600 },
  ultra: { label: 'Ultra', pixelRatio: 2, tex: 1024, aniso: 16, flashShadow: 2048, pointShadows: 2, pool: 8, bloom: true, ao: true, dust: 900 },
};

export const DIFFICULTY = {
  easy: { label: 'Facile', aggro: 0.7, dmg: 30, hearing: 0.75, sight: 0.8, searchTime: 0.8, lockTime: 1.6, checkChance: 0.6, speed: 0.9 },
  normal: { label: 'Normal', aggro: 1, dmg: 40, hearing: 1, sight: 1, searchTime: 1, lockTime: 1, checkChance: 0.8, speed: 1 },
  nightmare: { label: 'Cauchemar', aggro: 1.3, dmg: 55, hearing: 1.3, sight: 1.2, searchTime: 1.4, lockTime: 0.6, checkChance: 0.95, speed: 1.12 },
};

const defaults = {
  // phones / tablets start in low quality (the setting can be raised in Options)
  quality: typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && !window.matchMedia?.('(pointer: fine)').matches ? 'low' : 'medium',
  fov: 72,
  sensitivity: 1.0,
  invertY: false,
  headBob: 1.0,
  filmGrain: true,
  chromatic: true,
  brightness: 1.0,
  master: 0.9,
  music: 0.6,
  sfx: 1.0,
  subtitles: true,
  bloodTrail: true,
  bindings: { ...DEFAULT_BINDINGS },
};

export const settings = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...defaults, ...s, bindings: { ...DEFAULT_BINDINGS, ...(s.bindings || {}) } };
    }
  } catch { /* storage unavailable */ }
  return structuredClone(defaults);
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

export function resetSettings() {
  Object.assign(settings, structuredClone(defaults));
  saveSettings();
}
