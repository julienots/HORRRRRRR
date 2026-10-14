// Save slots in localStorage: one manual slot + one autosave (checkpoints at act changes).
const PREFIX = 'superessence.save.';

export function writeSave(slot, data) {
  try {
    localStorage.setItem(PREFIX + slot, JSON.stringify({ ...data, savedAt: Date.now(), version: 1 }));
    return true;
  } catch {
    return false;
  }
}

export function readSave(slot) {
  try {
    const raw = localStorage.getItem(PREFIX + slot);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s.version === 1 ? s : null;
  } catch {
    return null;
  }
}

// most recent of manual / auto
export function latestSave() {
  const a = readSave('manual'), b = readSave('auto');
  if (a && b) return a.savedAt >= b.savedAt ? { slot: 'manual', data: a } : { slot: 'auto', data: b };
  if (a) return { slot: 'manual', data: a };
  if (b) return { slot: 'auto', data: b };
  return null;
}

export function clearSaves() {
  try { localStorage.removeItem(PREFIX + 'manual'); localStorage.removeItem(PREFIX + 'auto'); } catch { /* ignore */ }
}
