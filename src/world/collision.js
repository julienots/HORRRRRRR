// Collision & perception world: axis aligned boxes + walkable regions (flat floors and stair ramps).
// Used by the player controller, the doll navigation, line of sight and sound occlusion.

const CELL = 2;

export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
    this.regions = [];
    this.nextId = 1;
  }

  // box: { min:[x,y,z], max:[x,y,z], solid, occ (blocks sight / sound), kind, ref }
  add(box) {
    box.id = this.nextId++;
    if (box.solid === undefined) box.solid = true;
    if (box.occ === undefined) box.occ = true;
    if (box.enabled === undefined) box.enabled = true;
    this.boxes.push(box);
    this._insert(box);
    return box;
  }

  addBox(x0, y0, z0, x1, y1, z1, props = {}) {
    return this.add({
      min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      ...props,
    });
  }

  _cells(box) {
    const out = [];
    const cx0 = Math.floor(box.min[0] / CELL), cx1 = Math.floor(box.max[0] / CELL);
    const cz0 = Math.floor(box.min[2] / CELL), cz1 = Math.floor(box.max[2] / CELL);
    for (let i = cx0; i <= cx1; i++) for (let j = cz0; j <= cz1; j++) out.push(i + ',' + j);
    return out;
  }

  _insert(box) {
    box._cells = this._cells(box);
    for (const k of box._cells) {
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(box);
    }
  }

  // move a box (used for dynamic objects: door panels, sliding wardrobe)
  update(box, min, max) {
    for (const k of box._cells) {
      const arr = this.grid.get(k);
      const i = arr.indexOf(box);
      if (i >= 0) arr.splice(i, 1);
    }
    box.min = min; box.max = max;
    this._insert(box);
  }

  near(x, z, r, out = []) {
    out.length = 0;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    const cx0 = Math.floor((x - r) / CELL), cx1 = Math.floor((x + r) / CELL);
    const cz0 = Math.floor((z - r) / CELL), cz1 = Math.floor((z + r) / CELL);
    for (let i = cx0; i <= cx1; i++) for (let j = cz0; j <= cz1; j++) {
      const arr = this.grid.get(i + ',' + j);
      if (!arr) continue;
      for (const b of arr) if (!seen.has(b.id)) { seen.add(b.id); out.push(b); }
    }
    return out;
  }

  // ---------------------------------------------------------------- walkable regions
  addFloor(x0, z0, x1, z1, y, props = {}) {
    this.regions.push({ type: 'flat', x0, z0, x1, z1, y, ...props });
  }

  addRamp(ramp) {
    const [x0, z0, x1, z1] = ramp.rect;
    this.regions.push({ type: 'ramp', x0, z0, x1, z1, ramp });
  }

  regionHeight(r, x, z) {
    if (r.type === 'flat') return r.y;
    const { axis, a, b } = r.ramp;
    const p = axis === 'z' ? z : x;
    const t = (p - a.at) / (b.at - a.at);
    return a.y + (b.y - a.y) * Math.min(1, Math.max(0, t));
  }

  // Ground height under (x,z) closest to the reference feet height `y` (allows stepping up `step`).
  groundAt(x, z, y, step = 0.45) {
    let best = null, bestY = -Infinity;
    for (const r of this.regions) {
      if (x < r.x0 - 0.01 || x > r.x1 + 0.01 || z < r.z0 - 0.01 || z > r.z1 + 0.01) continue;
      const h = this.regionHeight(r, x, z);
      if (h <= y + step && h > bestY) { bestY = h; best = r; }
    }
    return best ? { y: bestY, region: best } : null;
  }

  // ---------------------------------------------------------------- movement collision
  // Pushes a vertical cylinder out of solid boxes. Returns true if a collision happened.
  collideCylinder(pos, radius, feetY, height, filter) {
    let hit = false;
    const list = this.near(pos.x, pos.z, radius + 0.5, this._tmp || (this._tmp = []));
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of list) {
        if (!b.solid || !b.enabled) continue;
        if (filter && !filter(b)) continue;
        if (b.max[1] <= feetY + 0.38 || b.min[1] >= feetY + height) continue;
        const cx = Math.max(b.min[0], Math.min(pos.x, b.max[0]));
        const cz = Math.max(b.min[2], Math.min(pos.z, b.max[2]));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // center inside box: push out along the smallest axis
          const pxn = pos.x - b.min[0], pxp = b.max[0] - pos.x;
          const pzn = pos.z - b.min[2], pzp = b.max[2] - pos.z;
          const m = Math.min(pxn, pxp, pzn, pzp);
          if (m === pxn) pos.x = b.min[0] - radius;
          else if (m === pxp) pos.x = b.max[0] + radius;
          else if (m === pzn) pos.z = b.min[2] - radius;
          else pos.z = b.max[2] + radius;
        }
        hit = moved = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  // ---------------------------------------------------------------- rays
  static rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
    let tmin = 0, tmax = maxT;
    const o = [ox, oy, oz], d = [dx, dy, dz];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < b.min[i] || o[i] > b.max[i]) return -1;
      } else {
        let t1 = (b.min[i] - o[i]) / d[i], t2 = (b.max[i] - o[i]) / d[i];
        if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
    }
    return tmin;
  }

  _boxesAlong(ax, az, bx, bz) {
    const minx = Math.min(ax, bx), maxx = Math.max(ax, bx), minz = Math.min(az, bz), maxz = Math.max(az, bz);
    const out = [];
    const seen = new Set();
    for (let i = Math.floor(minx / CELL); i <= Math.floor(maxx / CELL); i++) {
      for (let j = Math.floor(minz / CELL); j <= Math.floor(maxz / CELL); j++) {
        const arr = this.grid.get(i + ',' + j);
        if (!arr) continue;
        for (const b of arr) if (!seen.has(b.id)) { seen.add(b.id); out.push(b); }
      }
    }
    return out;
  }

  // First occluder hit between a and b (3D points). Returns the box or null.
  lineBlocked(a, b, filter) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return null;
    const ix = dx / len, iy = dy / len, iz = dz / len;
    for (const box of this._boxesAlong(a.x, a.z, b.x, b.z)) {
      if (!box.occ || !box.enabled) continue;
      if (filter && !filter(box)) continue;
      const t = CollisionWorld.rayBox(a.x, a.y, a.z, ix, iy, iz, box, len);
      if (t >= 0 && t < len - 0.05) return box;
    }
    return null;
  }

  // Number of distinct occluding boxes between two points (sound attenuation).
  countOccluders(a, b, max = 6) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return 0;
    const ix = dx / len, iy = dy / len, iz = dz / len;
    let n = 0;
    for (const box of this._boxesAlong(a.x, a.z, b.x, b.z)) {
      if (!box.occ || !box.enabled || box.thin) continue;
      const t = CollisionWorld.rayBox(a.x, a.y, a.z, ix, iy, iz, box, len);
      if (t >= 0 && t < len - 0.05) { n++; if (n >= max) break; }
    }
    return n;
  }

  // Distance to first solid/occluding surface along a ray (camera clipping, interaction reach).
  raycast(o, d, maxT, filter) {
    let best = maxT, hit = null;
    const ex = o.x + d.x * maxT, ez = o.z + d.z * maxT;
    for (const box of this._boxesAlong(o.x, o.z, ex, ez)) {
      if (!box.enabled) continue;
      if (filter && !filter(box)) continue;
      const t = CollisionWorld.rayBox(o.x, o.y, o.z, d.x, d.y, d.z, box, best);
      if (t >= 0 && t < best) { best = t; hit = box; }
    }
    return { t: best, box: hit };
  }
}
