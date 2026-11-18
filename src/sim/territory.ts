import { BUILDINGS } from './config';
import { type GameState } from './state';

export interface Claim {
  x: number;
  y: number;
  r: number;
}

/** The Command Hub and every finished Survey Beacon claim a disc of land. */
export function claims(s: GameState): Claim[] {
  const out: Claim[] = [];
  for (const b of s.buildings) {
    const d = BUILDINGS[b.type];
    if (!d.territory || b.level < 1) continue;
    out.push({ x: b.x + d.size / 2, y: b.y + d.size / 2, r: d.territory[Math.min(b.level, d.territory.length) - 1] });
  }
  return out;
}

const cache = new WeakMap<GameState, { rev: number; mask: Uint8Array }>();

/** 1 for tiles inside the colony's territory. Cached until buildings change. */
export function territory(s: GameState): Uint8Array {
  const hit = cache.get(s);
  if (hit && hit.rev === s.buildingsRev) return hit.mask;
  const mask = new Uint8Array(s.size * s.size);
  for (const c of claims(s)) {
    const r2 = c.r * c.r;
    for (let y = Math.max(0, Math.floor(c.y - c.r)); y <= Math.min(s.size - 1, Math.ceil(c.y + c.r)); y++) {
      for (let x = Math.max(0, Math.floor(c.x - c.r)); x <= Math.min(s.size - 1, Math.ceil(c.x + c.r)); x++) {
        const dx = x + 0.5 - c.x;
        const dy = y + 0.5 - c.y;
        if (dx * dx + dy * dy <= r2) mask[y * s.size + x] = 1;
      }
    }
  }
  cache.set(s, { rev: s.buildingsRev, mask });
  return mask;
}
