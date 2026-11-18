import { CONFIG } from './config';
import { DIRS, edgeTiles, field } from './path';
import { fail, occupancy, roadable, type Result } from './rules';
import { territory } from './territory';
import { byId, hub, idx, inBounds, type GameState, type Point } from './state';

// Roads are free and plan their own route around trees, rocks and buildings.

const STEP_NEW = 3;
const STEP_ROAD = 2;
const TURN = 2;

/** A tiny binary heap of [cost, state] pairs. */
class Heap {
  private cost: number[] = [];
  private val: number[] = [];
  get size() {
    return this.val.length;
  }
  push(c: number, v: number) {
    const { cost, val } = this;
    let i = val.length;
    cost.push(c);
    val.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cost[p] <= c) break;
      cost[i] = cost[p];
      val[i] = val[p];
      i = p;
    }
    cost[i] = c;
    val[i] = v;
  }
  pop(): [number, number] {
    const { cost, val } = this;
    const top: [number, number] = [cost[0], val[0]];
    const lc = cost.pop()!;
    const lv = val.pop()!;
    if (val.length) {
      let i = 0;
      for (;;) {
        let k = 2 * i + 1;
        if (k >= val.length) break;
        if (k + 1 < val.length && cost[k + 1] < cost[k]) k++;
        if (cost[k] >= lc) break;
        cost[i] = cost[k];
        val[i] = val[k];
        i = k;
      }
      cost[i] = lc;
      val[i] = lv;
    }
    return top;
  }
}

/**
 * Cheapest road from any start tile to any goal tile. Prefers straight lines and reusing existing road.
 * Returns the tiles in order, or null.
 */
function route(s: GameState, starts: number[], isGoal: (i: number) => boolean): number[] | null {
  const occ = occupancy(s);
  const land = territory(s);
  const passable = (i: number) => s.roads[i] === 1 || roadable(s, i, occ, land);
  const n = s.size * s.size;
  const best = new Float64Array(n * 4).fill(Infinity);
  const prev = new Int32Array(n * 4).fill(-1);
  const heap = new Heap();
  for (const t of starts) {
    if (!passable(t)) continue;
    for (let d = 0; d < 4; d++) {
      best[t * 4 + d] = 0;
      heap.push(0, t * 4 + d);
    }
  }
  while (heap.size) {
    const [c, st] = heap.pop();
    if (c > best[st]) continue;
    const t = st >> 2;
    const dir = st & 3;
    if (isGoal(t)) {
      const out: number[] = [];
      for (let k = st; k !== -1; k = prev[k]) out.push(k >> 2);
      return out.reverse();
    }
    const x = t % s.size;
    const y = (t - x) / s.size;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0];
      const ny = y + DIRS[d][1];
      if (!inBounds(s, nx, ny)) continue;
      const ni = ny * s.size + nx;
      if (!passable(ni)) continue;
      const nc = c + (s.roads[ni] ? STEP_ROAD : STEP_NEW) + (d === dir ? 0 : TURN);
      const ns = ni * 4 + d;
      if (nc < best[ns]) {
        best[ns] = nc;
        prev[ns] = st;
        heap.push(nc, ns);
      }
    }
  }
  return null;
}

function lay(s: GameState, tiles: number[]): Result & { placed: number } {
  const fresh = tiles.filter((t) => !s.roads[t]);
  if (!fresh.length) return { ok: false, reason: 'There is already a road there', placed: 0 };
  if (fresh.length > CONFIG.maxRoadTiles) return { ok: false, reason: 'Too long for one road. Build it in shorter pieces', placed: 0 };
  for (const t of fresh) s.roads[t] = 1;
  s.roadsRev++;
  return { ok: true, placed: fresh.length };
}

/** Plans a road between two tiles without building it. */
export function planRoad(s: GameState, a: Point, b: Point): number[] | null {
  if (!inBounds(s, a.x, a.y) || !inBounds(s, b.x, b.y)) return null;
  const goal = idx(s, b.x, b.y);
  return route(s, [idx(s, a.x, a.y)], (i) => i === goal);
}

export function buildRoad(s: GameState, a: Point, b: Point): Result & { placed: number } {
  const tiles = planRoad(s, a, b);
  if (!tiles) return { ok: false, reason: "Can't find a way through. Try a different spot", placed: 0 };
  return lay(s, tiles);
}

export function removeRoad(s: GameState, x: number, y: number): Result {
  if (!inBounds(s, x, y) || !s.roads[idx(s, x, y)]) return fail('No road here');
  s.roads[idx(s, x, y)] = 0;
  s.roadsRev++;
  return { ok: true };
}

/** Lays the shortest road from a building to the Command Hub's road network. */
export function connectRoad(s: GameState, id: number): Result & { placed: number } {
  const b = byId(s, id);
  if (!b) return { ok: false, reason: 'No such building', placed: 0 };
  const h = hub(s);
  const hubField = field(s, h);
  if (b.type === 'hub' || field(s, b).doors.some((t) => hubField.dist[t] >= 0)) return { ok: false, reason: 'Already connected', placed: 0 };
  const hubEdge = new Set(edgeTiles(s, h));
  const tiles = route(s, edgeTiles(s, b), (i) => hubField.dist[i] >= 0 || hubEdge.has(i));
  if (!tiles) return { ok: false, reason: 'No clear way to the Command Hub', placed: 0 };
  return lay(s, tiles);
}

/** Tiles a road from the Command Hub could reach, going round trees, rocks and buildings. */
export function roadReach(s: GameState): Uint8Array {
  const occ = occupancy(s);
  const land = territory(s);
  const h = hub(s);
  const hubField = field(s, h);
  const seen = new Uint8Array(s.size * s.size);
  const queue: number[] = [];
  const passable = (i: number) => s.roads[i] === 1 || roadable(s, i, occ, land);
  for (const t of edgeTiles(s, h)) {
    if (passable(t) && !seen[t]) {
      seen[t] = 1;
      queue.push(t);
    }
  }
  for (let i = 0; i < s.roads.length; i++) {
    if (hubField.dist[i] >= 0 && !seen[i]) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const x = cur % s.size;
    const y = (cur - x) / s.size;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(s, nx, ny)) continue;
      const ni = ny * s.size + nx;
      if (seen[ni] || !passable(ni)) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

/**
 * Where a road tap should land. Taps on a building snap to the free tile beside it nearest `toward`.
 * Returns null for tiles a road can't use.
 */
export function snapRoadTile(s: GameState, tile: Point, toward?: Point | null): Point | null {
  if (!inBounds(s, tile.x, tile.y)) return null;
  const i = idx(s, tile.x, tile.y);
  if (s.roads[i] || roadable(s, i)) return tile;
  const b = byId(s, occupancy(s)[i]);
  if (!b) return null;
  const aim = toward ?? tile;
  let best: Point | null = null;
  let bd = Infinity;
  for (const t of edgeTiles(s, b)) {
    if (!s.roads[t] && !roadable(s, t)) continue;
    const p = { x: t % s.size, y: Math.floor(t / s.size) };
    const d = Math.hypot(p.x - aim.x, p.y - aim.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
