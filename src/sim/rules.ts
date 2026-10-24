import { BUILDINGS, CONFIG, OPEN, type BuildingType } from './config';
import { territory } from './territory';
import { hub, idx, inBounds, type Building, type GameState } from './state';

export type Result = { ok: true } | { ok: false; reason: string };
export const fail = (reason: string): Result => ({ ok: false, reason });
export const OK: Result = { ok: true };

/** The value for a level from a per-level table. 0 below level 1. */
export const lv = (arr: number[] | undefined, level: number) => (arr && level > 0 ? arr[Math.min(level, arr.length) - 1] : 0);

export const isStorage = (b: Building) => (BUILDINGS[b.type].kind === 'hub' || BUILDINGS[b.type].kind === 'storage') && b.level >= 1;

export const hubLevel = (s: GameState) => hub(s).level;
export const countOf = (s: GameState, t: BuildingType) => s.buildings.filter((b) => b.type === t).length;
export const maxCountOf = (s: GameState, t: BuildingType) => BUILDINGS[t].maxCount[Math.min(hubLevel(s), CONFIG.maxHubLevel) - 1];

export interface Stats {
  powerGen: number;
  powerUse: number;
  /** 0..1, how much of the demand is met. */
  powerRatio: number;
  popCap: number;
  /** How much of each good storage can hold. */
  storageCap: number;
  colonists: number;
  /** Colonists with nothing to do right now. */
  free: number;
  workers: number;
  builders: number;
  carriers: number;
}

export function stats(s: GameState): Stats {
  let powerGen = 0;
  let powerUse = 0;
  let popCap = 0;
  let storageCap = 0;
  for (const b of s.buildings) {
    const d = BUILDINGS[b.type];
    powerGen += lv(d.powerGen, b.level);
    if (!b.paused) powerUse += lv(d.powerUse, b.level);
    popCap += lv(d.population, b.level);
    storageCap += lv(d.storage, b.level);
  }
  let free = 0;
  let workers = 0;
  let builders = 0;
  let carriers = 0;
  for (const c of s.colonists) {
    const k = c.job?.kind;
    if (!k || k === 'home') free++;
    else if (k === 'work') workers++;
    else if (k === 'build') builders++;
    else carriers++;
  }
  const powerRatio = powerUse === 0 ? 1 : Math.min(1, powerGen / powerUse);
  return { powerGen, powerUse, powerRatio, popCap, storageCap, colonists: s.colonists.length, free, workers, builders, carriers };
}

const occCache = new WeakMap<GameState, { rev: number; occ: Int32Array }>();

/** Building id on each tile, or 0. Cached until buildings change. */
export function occupancy(s: GameState): Int32Array {
  const hit = occCache.get(s);
  if (hit && hit.rev === s.buildingsRev) return hit.occ;
  const occ = new Int32Array(s.size * s.size);
  for (const b of s.buildings) {
    const n = BUILDINGS[b.type].size;
    for (let y = b.y; y < b.y + n; y++) for (let x = b.x; x < b.x + n; x++) occ[idx(s, x, y)] = b.id;
  }
  occCache.set(s, { rev: s.buildingsRev, occ });
  return occ;
}

/** A tile a new road can go on. */
export function roadable(s: GameState, i: number, occ = occupancy(s), land = territory(s)) {
  return land[i] === 1 && !occ[i] && !s.roads[i] && !s.trees[i] && !s.rocks[i];
}

export function canPlace(s: GameState, type: BuildingType, x: number, y: number): Result {
  const d = BUILDINGS[type];
  const occ = occupancy(s);
  const land = territory(s);
  let onDeposit = 0;
  for (let ty = y; ty < y + d.size; ty++) {
    for (let tx = x; tx < x + d.size; tx++) {
      if (!inBounds(s, tx, ty)) return fail('Off the edge of the map');
      const i = idx(s, tx, ty);
      if (!land[i]) return fail('Outside your territory');
      if (occ[i]) return fail('Something is already built here');
      if (s.roads[i]) return fail('A road is in the way');
      if (s.trees[i]) return fail('Trees are in the way');
      if (s.rocks[i]) return fail('Rocks are in the way');
      const t = s.terrain[i];
      if (d.deposit != null && t === d.deposit) onDeposit++;
      else if (t !== OPEN) return fail(d.deposit != null ? 'Wrong kind of deposit' : 'Keep deposits free for mines and drills');
    }
  }
  if (d.deposit != null && onDeposit < 2) return fail(`Must sit on ${depositName(d.deposit)}`);
  return OK;
}

export function depositName(t: number) {
  return t === 1 ? 'violet lumenite crystals' : t === 2 ? 'rust-red ferrite ground' : 'pale blue ice';
}

/** Why a building type can't be started at all right now, or null. */
export function buildBlocker(s: GameState, type: BuildingType): string | null {
  const d = BUILDINGS[type];
  if (type === 'hub') return 'Only one Command Hub';
  if (hubLevel(s) < d.unlock) return `Unlocks at Command Hub level ${d.unlock}`;
  if (countOf(s, type) >= maxCountOf(s, type)) return 'Upgrade the Command Hub to build more';
  return null;
}
