import { BUILDINGS } from './config';
import { idx, inBounds, type Building, type GameState, type Point } from './state';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Road tiles that touch a building's footprint edge. Colonists enter and leave through these. */
export function doorTiles(s: GameState, b: Building): number[] {
  const n = BUILDINGS[b.type].size;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const edge: [number, number][] = [
      [b.x + i, b.y - 1],
      [b.x + i, b.y + n],
      [b.x - 1, b.y + i],
      [b.x + n, b.y + i],
    ];
    for (const [x, y] of edge) if (inBounds(s, x, y) && s.roads[idx(s, x, y)]) out.push(idx(s, x, y));
  }
  return out;
}

export function centre(b: Building): Point {
  const n = BUILDINGS[b.type].size;
  return { x: b.x + n / 2, y: b.y + n / 2 };
}

/** Breadth-first search over road tiles from any door of `from` to any door of `to`. */
export function roadPath(s: GameState, from: Building, to: Building): Point[] | null {
  const starts = doorTiles(s, from);
  const goals = new Set(doorTiles(s, to));
  if (!starts.length || !goals.size) return null;
  const prev = new Map<number, number>();
  const queue: number[] = [];
  for (const t of starts) {
    prev.set(t, -1);
    queue.push(t);
  }
  let found = -1;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (goals.has(cur)) {
      found = cur;
      break;
    }
    const cx = cur % s.size;
    const cy = Math.floor(cur / s.size);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(s, nx, ny)) continue;
      const ni = idx(s, nx, ny);
      if (!s.roads[ni] || prev.has(ni)) continue;
      prev.set(ni, cur);
      queue.push(ni);
    }
  }
  if (found < 0) return null;
  const tiles: number[] = [];
  for (let t = found; t !== -1; t = prev.get(t)!) tiles.push(t);
  tiles.reverse();
  const pts: Point[] = [centre(from)];
  for (const t of tiles) pts.push({ x: (t % s.size) + 0.5, y: Math.floor(t / s.size) + 0.5 });
  pts.push(centre(to));
  return pts;
}

export const pathLength = (p: Point[]) => p.reduce((d, pt, i) => (i ? d + Math.hypot(pt.x - p[i - 1].x, pt.y - p[i - 1].y) : 0), 0);

/** Road tiles reachable from the hub, for the "needs road" warning. */
export function connectedToHub(s: GameState): Set<number> {
  const h = s.buildings.find((b) => b.type === 'hub');
  const seen = new Set<number>();
  if (!h) return seen;
  const queue = doorTiles(s, h);
  queue.forEach((t) => seen.add(t));
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const cx = cur % s.size;
    const cy = Math.floor(cur / s.size);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(s, nx, ny)) continue;
      const ni = idx(s, nx, ny);
      if (!s.roads[ni] || seen.has(ni)) continue;
      seen.add(ni);
      queue.push(ni);
    }
  }
  return seen;
}

export function isConnected(s: GameState, b: Building, network = connectedToHub(s)): boolean {
  if (b.type === 'hub') return true;
  return doorTiles(s, b).some((t) => network.has(t));
}
