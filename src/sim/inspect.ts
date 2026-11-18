import { BUILDINGS, CONFIG, FERRITE, ICE, LUMENITE, OPEN } from './config';
import type { GameState } from './state';

export interface TileInfo {
  title: string;
  /** One or two short lines, e.g. "8 stone left in this rock". */
  lines: string[];
}

const timberPerTree = BUILDINGS.lumber.gather!.n;
const stonePerTrip = BUILDINGS.quarry.gather!.n;

/** Tiles joined to tile i (8-way) for which `has` is true, including i itself. */
function patch(s: GameState, i: number, has: (j: number) => boolean, limit = 400): number[] {
  const n = s.size;
  const seen = new Set([i]);
  const out: number[] = [];
  const queue = [i];
  while (queue.length && out.length < limit) {
    const j = queue.shift()!;
    out.push(j);
    const x = j % n;
    const y = Math.floor(j / n);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const k = ny * n + nx;
        if (seen.has(k) || !has(k)) continue;
        seen.add(k);
        queue.push(k);
      }
    }
  }
  return out;
}

const plural = (v: number, one: string, many = one + 's') => `${v} ${v === 1 ? one : many}`;

/** What a tile holds and how much it has left to give, for the long-press inspector. Null for empty ground. */
export function tileInfo(s: GameState, x: number, y: number): TileInfo | null {
  if (x < 0 || y < 0 || x >= s.size || y >= s.size) return null;
  const i = y * s.size + x;
  const tree = s.trees[i];
  if (tree > 0) {
    const grove = patch(s, i, (j) => s.trees[j] > 0);
    const grown = grove.filter((j) => s.trees[j] >= 100).length;
    const lines =
      tree >= 100
        ? [`Ready to fell: gives ${timberPerTree} timber`]
        : [`Sapling ${Math.floor(tree)}% grown, ready in about ${Math.ceil(((100 - tree) / 100) * CONFIG.treeGrowSec)}s`];
    lines.push(`This grove: ${plural(grown, 'grown tree')} (${grown * timberPerTree} timber)${grove.length > grown ? `, ${plural(grove.length - grown, 'sapling')}` : ''}`);
    return { title: 'Lantern tree', lines };
  }
  if (s.rocks[i] > 0) {
    const outcrop = patch(s, i, (j) => s.rocks[j] > 0);
    const left = outcrop.reduce((sum, j) => sum + s.rocks[j], 0);
    return {
      title: 'Rock outcrop',
      lines: [`${s.rocks[i] * stonePerTrip} stone left in this rock`, `This outcrop: ${left * stonePerTrip} stone in ${plural(outcrop.length, 'rock')}`],
    };
  }
  const t = s.terrain[i];
  if (t !== OPEN) {
    const title = t === LUMENITE ? 'Lumenite crystals' : t === FERRITE ? 'Ferrite ground' : t === ICE ? 'Ice deposit' : 'Deposit';
    const size = patch(s, i, (j) => s.terrain[j] === t).length;
    const by = BUILDINGS[t === LUMENITE ? 'extractor' : t === FERRITE ? 'mine' : 'icedrill'].name;
    return { title, lines: [`Never runs out. Work it with ${by === "Ore Mine" ? "an" : "a"} ${by}`, `This deposit: ${plural(size, 'tile')}`] };
  }
  return null;
}
