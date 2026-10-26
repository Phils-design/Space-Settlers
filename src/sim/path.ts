import { BUILDINGS } from './config';
import { byId, hub, inBounds, type Building, type Colonist, type GameState, type Point, type Waypoint } from './state';

export const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

export function centre(b: Building): Point {
  const n = BUILDINGS[b.type].size;
  return { x: b.x + n / 2, y: b.y + n / 2 };
}

export const tilePoint = (s: GameState, t: number): Waypoint => ({ x: (t % s.size) + 0.5, y: Math.floor(t / s.size) + 0.5, tile: t });

/** Tiles touching a building's footprint edge (no corners). */
export function edgeTiles(s: GameState, b: Building): number[] {
  const n = BUILDINGS[b.type].size;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    for (const [x, y] of [
      [b.x + i, b.y - 1],
      [b.x + i, b.y + n],
      [b.x - 1, b.y + i],
      [b.x + n, b.y + i],
    ]) {
      if (inBounds(s, x, y)) out.push(y * s.size + x);
    }
  }
  return out;
}

/** Road tiles touching a building. Colonists come and go through these. */
export const doorTiles = (s: GameState, b: Building) => edgeTiles(s, b).filter((t) => s.roads[t]);

/**
 * Distance along the roads from every road tile to a building, and the next step towards it.
 * Built by a breadth-first search out from the building's doors, and cached until the roads change.
 */
export interface Field {
  roadsRev: number;
  buildingsRev: number;
  dist: Int32Array;
  next: Int32Array;
  /** Steps that pass through a storage building: the id of that building. */
  via: Int32Array;
  doors: number[];
}

/**
 * Storage buildings (the Command Hub and depots) work as junctions: colonists can walk in one door
 * and out of another. Maps each of their door tiles to the buildings it opens into.
 */
function junctions(s: GameState): Map<number, Building[]> {
  const out = new Map<number, Building[]>();
  for (const b of s.buildings) {
    const k = BUILDINGS[b.type].kind;
    if ((k !== 'hub' && k !== 'storage') || b.level < 1) continue;
    for (const t of doorTiles(s, b)) {
      const list = out.get(t);
      if (list) list.push(b);
      else out.set(t, [b]);
    }
  }
  return out;
}

const fields = new WeakMap<GameState, Map<number, Field>>();

export function field(s: GameState, b: Building): Field {
  let all = fields.get(s);
  if (!all) fields.set(s, (all = new Map()));
  const hit = all.get(b.id);
  if (hit && hit.roadsRev === s.roadsRev && hit.buildingsRev === s.buildingsRev) return hit;
  const n = s.size * s.size;
  const dist = hit?.dist ?? new Int32Array(n);
  const next = hit?.next ?? new Int32Array(n);
  const via = hit?.via ?? new Int32Array(n);
  dist.fill(-1);
  via.fill(0);
  const doors = doorTiles(s, b);
  const joins = junctions(s);
  const queue: number[] = [];
  for (const t of doors) {
    dist[t] = 0;
    next[t] = -1;
    queue.push(t);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const cx = cur % s.size;
    const cy = (cur - cx) / s.size;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(s, nx, ny)) continue;
      const ni = ny * s.size + nx;
      if (!s.roads[ni] || dist[ni] >= 0) continue;
      dist[ni] = dist[cur] + 1;
      next[ni] = cur;
      queue.push(ni);
    }
    for (const j of joins.get(cur) ?? []) {
      if (j.id === b.id) continue;
      for (const t of doorTiles(s, j)) {
        if (dist[t] >= 0) continue;
        dist[t] = dist[cur] + 1;
        next[t] = cur;
        via[t] = j.id;
        queue.push(t);
      }
    }
  }
  const f = { roadsRev: s.roadsRev, buildingsRev: s.buildingsRev, dist, next, via, doors };
  all.set(b.id, f);
  return f;
}

export function forgetField(s: GameState, id: number) {
  fields.get(s)?.delete(id);
}

/** Road tiles a colonist can set off from: the doors of the building they're in, or the road under their feet. */
export function startTiles(s: GameState, c: Colonist): number[] {
  if (c.inside != null) {
    const b = byId(s, c.inside);
    return b ? field(s, b).doors : [];
  }
  return c.tile >= 0 && s.roads[c.tile] ? [c.tile] : [];
}

/**
 * Road tiles a colonist can set off from that also lead on to `then`, if given.
 * A colonist inside a building can leave by any door, so the Command Hub works as a junction.
 */
function usableStarts(s: GameState, c: Colonist, then?: Building): number[] {
  const starts = startTiles(s, c);
  if (!then) return starts;
  const onward = field(s, then).dist;
  return starts.filter((t) => onward[t] >= 0);
}

/** Road distance in tiles from a colonist to a building (and able to carry on to `then`), or Infinity. */
export function distTo(s: GameState, c: Colonist, target: Building, then?: Building): number {
  const f = field(s, target);
  if (c.inside === target.id) return !then || f.doors.some((t) => field(s, then).dist[t] >= 0) ? 0 : Infinity;
  let best = Infinity;
  for (const t of usableStarts(s, c, then)) {
    const d = f.dist[t];
    if (d >= 0 && d < best) best = d;
  }
  return best;
}

/** Road distance between two buildings, door to door, or Infinity. */
export function buildingDist(s: GameState, from: Building, to: Building): number {
  if (from.id === to.id) return 0;
  const f = field(s, to);
  let best = Infinity;
  for (const t of field(s, from).doors) {
    const d = f.dist[t];
    if (d >= 0 && d < best) best = d;
  }
  return best;
}

export type Arrive = 'door' | 'centre' | 'work';

/** Where a builder stands while working: just inside the site, by the door they came in through. */
export function workSpot(b: Building, door: Point): Point {
  const c = centre(b);
  return { x: door.x + (c.x - door.x) * 0.55, y: door.y + (c.y - door.y) * 0.55 };
}

/**
 * Waypoints along the roads from a colonist to a building, or null if there's no road.
 * With `then`, the walk ends at a door from which `then` can be reached.
 */
export function routeTo(s: GameState, c: Colonist, target: Building, arrive: Arrive, then?: Building): Waypoint[] | null {
  const f = field(s, target);
  let start = -1;
  if (c.inside === target.id) {
    if (arrive === 'centre') return [];
    // Leave by the door nearest where we're heading next.
    const onward = then ? field(s, then).dist : null;
    let best = Infinity;
    for (const t of f.doors) {
      const d = onward ? onward[t] : 0;
      if (d >= 0 && d < best) {
        best = d;
        start = t;
      }
    }
  } else {
    let best = Infinity;
    for (const t of usableStarts(s, c, then)) {
      const d = f.dist[t];
      if (d >= 0 && d < best) {
        best = d;
        start = t;
      }
    }
  }
  if (start < 0) return null;
  const pts: Waypoint[] = [];
  for (let t = start; t !== -1; t = f.next[t]) {
    pts.push(tilePoint(s, t));
    const j = f.via[t] ? byId(s, f.via[t]) : undefined;
    if (j) pts.push(centre(j));
  }
  const last = pts[pts.length - 1];
  if (arrive === 'centre') pts.push(centre(target));
  else if (arrive === 'work') pts.push(workSpot(target, last));
  return pts;
}

/** Is a building on the same road network as the Command Hub? */
export function connected(s: GameState, b: Building): boolean {
  if (b.type === 'hub') return true;
  return buildingDist(s, b, hub(s)) < Infinity;
}

export const pathLength = (from: Point, p: Point[]) =>
  p.reduce((d, pt, i) => d + Math.hypot(pt.x - (i ? p[i - 1].x : from.x), pt.y - (i ? p[i - 1].y : from.y)), 0);
