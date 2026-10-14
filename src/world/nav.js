// Navigation grid for the doll, generated from the collision world (floors, ramps, walls, furniture, doors).
// Cells are 0.5 m; links connect neighbouring cells of the same region and cross region borders (doors, stairs)
// when the height difference is small and no wall stands between them. A* runs over this graph.

const CS = 0.5;
const AGENT_R = 0.22;

export class NavGrid {
  constructor(world, doors) {
    this.world = world;
    this.doors = doors;
    this.nodes = []; // {id, x, z, y, region, door, links: [{to, door, cost}]}
    this.byRegionCell = new Map();
    this.spatial = new Map(); // "ix,iz" -> [node]
    this.build();
  }

  static key(ix, iz) { return ix + ',' + iz; }

  blockedAt(x, y, z, ignoreDoors = true) {
    const list = this.world.near(x, z, AGENT_R + 0.3);
    for (const b of list) {
      if (!b.solid || !b.enabled) continue;
      if (b.kind === 'door' && ignoreDoors) continue;
      if (b.kind === 'slab' || b.kind === 'prop') continue;
      if (b.kind === 'furniture' && b.max[1] - b.min[1] < 0.3) continue;
      if (b.max[1] <= y + 0.25 || b.min[1] >= y + 1.0) continue;
      const cx = Math.max(b.min[0], Math.min(x, b.max[0]));
      const cz = Math.max(b.min[2], Math.min(z, b.max[2]));
      if ((x - cx) ** 2 + (z - cz) ** 2 < AGENT_R * AGENT_R) return true;
    }
    return false;
  }

  doorAt(x, y, z) {
    for (const d of this.doors) {
      const c = d.closed;
      if (y < c.min[1] - 0.6 || y > c.max[1]) continue;
      if (x >= c.min[0] - 0.25 && x <= c.max[0] + 0.25 && z >= c.min[2] - 0.25 && z <= c.max[2] + 0.25) return d;
    }
    return null;
  }

  build() {
    const w = this.world;
    for (const [ri, r] of w.regions.entries()) {
      const ix0 = Math.ceil((r.x0 + 0.01) / CS - 0.5), ix1 = Math.floor((r.x1 - 0.01) / CS - 0.5);
      const iz0 = Math.ceil((r.z0 + 0.01) / CS - 0.5), iz1 = Math.floor((r.z1 - 0.01) / CS - 0.5);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const x = (ix + 0.5) * CS, z = (iz + 0.5) * CS;
          if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
          const y = w.regionHeight(r, x, z);
          if (this.blockedAt(x, y, z)) continue;
          const node = { id: this.nodes.length, x, z, y, ri, ix, iz, door: this.doorAt(x, y, z), links: [] };
          this.nodes.push(node);
          this.byRegionCell.set(ri + ':' + ix + ',' + iz, node);
          const k = NavGrid.key(ix, iz);
          if (!this.spatial.has(k)) this.spatial.set(k, []);
          this.spatial.get(k).push(node);
        }
      }
    }
    // links
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const n of this.nodes) {
      for (const [dx, dz] of dirs) {
        const cand = this.spatial.get(NavGrid.key(n.ix + dx, n.iz + dz));
        if (!cand) continue;
        for (const m of cand) {
          const diag = dx !== 0 && dz !== 0;
          if (Math.abs(m.y - n.y) > (m.ri === n.ri ? 0.6 : 0.3)) continue;
          if (diag && m.ri !== n.ri) continue;
          if (diag) {
            // both orthogonal neighbours must exist (no corner cutting)
            const a = this.byRegionCell.get(n.ri + ':' + (n.ix + dx) + ',' + n.iz);
            const b = this.byRegionCell.get(n.ri + ':' + n.ix + ',' + (n.iz + dz));
            if (!a || !b) continue;
          }
          if (!this.segmentClear(n, m)) continue;
          const cost = Math.hypot(m.x - n.x, m.y - n.y, m.z - n.z);
          const door = n.door || m.door || null;
          n.links.push({ to: m, cost, door });
          m.links.push({ to: n, cost, door });
        }
      }
    }
  }

  segmentClear(a, b) {
    const y = Math.max(a.y, b.y) + 0.5;
    const pa = { x: a.x, y, z: a.z }, pb = { x: b.x, y, z: b.z };
    const hit = this.world.lineBlocked(pa, pb, (box) => box.solid && box.kind !== 'door' && box.kind !== 'slab' && box.kind !== 'prop' && !(box.kind === 'furniture' && box.max[1] - box.min[1] < 0.3));
    if (hit) return false;
    // solid boxes that are not occluders (windows, rails) also block
    const list = this.world._boxesAlong(a.x, a.z, b.x, b.z);
    for (const box of list) {
      if (!box.solid || box.occ || box.kind === 'door' || box.kind === 'prop' || box.kind === 'slab') continue;
      if (box.min[1] > y || box.max[1] < y - 0.3) continue;
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const t = this.world.constructor.rayBox(a.x, y, a.z, dx / len, 0, dz / len, box, len);
      if (t >= 0 && t < len) return false;
    }
    return true;
  }

  // nearest node to a world point (same floor)
  nearest(p, maxR = 3) {
    let best = null, bd = Infinity;
    const ix = Math.floor(p.x / CS), iz = Math.floor(p.z / CS);
    const rr = Math.ceil(maxR / CS);
    for (let r = 0; r <= rr; r++) {
      for (let i = ix - r; i <= ix + r; i++) {
        for (let j = iz - r; j <= iz + r; j++) {
          if (Math.max(Math.abs(i - ix), Math.abs(j - iz)) !== r) continue;
          const arr = this.spatial.get(NavGrid.key(i, j));
          if (!arr) continue;
          for (const n of arr) {
            const dy = Math.abs(n.y - p.y);
            if (dy > 1.2) continue;
            const d = Math.hypot(n.x - p.x, n.z - p.z) + dy * 2;
            if (d < bd) { bd = d; best = n; }
          }
        }
      }
      if (best && r * CS > bd + CS) break;
    }
    return best;
  }

  // A*. opts.canPass(door) -> cost multiplier or Infinity
  path(from, to, opts = {}) {
    const start = from.id !== undefined ? from : this.nearest(from);
    const goal = to.id !== undefined ? to : this.nearest(to);
    if (!start || !goal) return null;
    if (start === goal) return [start];
    const N = this.nodes.length;
    const g = this._g || (this._g = new Float32Array(N));
    const f = this._f || (this._f = new Float32Array(N));
    const came = this._came || (this._came = new Int32Array(N));
    const stamp = this._stamp || (this._stamp = new Int32Array(N));
    const closed = this._closed || (this._closed = new Int32Array(N));
    this._run = (this._run || 0) + 1;
    const run = this._run;
    const h = (n) => Math.hypot(n.x - goal.x, (n.y - goal.y) * 1.5, n.z - goal.z);
    const heap = [];
    const push = (n) => {
      heap.push(n);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p].id] <= f[heap[i].id]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && f[heap[l].id] < f[heap[m].id]) m = l;
          if (r < heap.length && f[heap[r].id] < f[heap[m].id]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    stamp[start.id] = run; g[start.id] = 0; f[start.id] = h(start); came[start.id] = -1;
    push(start);
    let iter = 0;
    while (heap.length && iter++ < 20000) {
      const n = pop();
      if (closed[n.id] === run) continue;
      closed[n.id] = run;
      if (n === goal) {
        const out = [];
        let c = n.id;
        while (c !== -1) { out.push(this.nodes[c]); c = came[c]; }
        return out.reverse();
      }
      for (const l of n.links) {
        const m = l.to;
        if (closed[m.id] === run) continue;
        let mult = 1;
        if (l.door && opts.canPass) { mult = opts.canPass(l.door); if (!isFinite(mult)) continue; }
        const ng = g[n.id] + l.cost * mult;
        if (stamp[m.id] !== run || ng < g[m.id]) {
          stamp[m.id] = run; g[m.id] = ng; f[m.id] = ng + h(m); came[m.id] = n.id;
          push(m);
        }
      }
    }
    return null;
  }

  pathLength(path) {
    let l = 0;
    for (let i = 1; i < path.length; i++) l += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z, path[i].y - path[i - 1].y);
    return l;
  }

  randomNodeIn(rect, y, rnd = Math.random) {
    const cands = [];
    for (const n of this.nodes) if (n.x > rect[0] && n.x < rect[2] && n.z > rect[1] && n.z < rect[3] && Math.abs(n.y - y) < 0.3) cands.push(n);
    return cands.length ? cands[Math.floor(rnd() * cands.length)] : null;
  }
}
