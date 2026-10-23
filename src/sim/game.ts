import { BUILDINGS, CONFIG, type BuildingType } from './config';
import { centre, connectedToHub, isConnected, pathLength, roadPath } from './path';
import { DEPOSIT, OPEN, byId, hub, idx, inBounds, type Building, type Colonist, type GameState } from './state';

export type Result = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

const lv = (arr: number[] | undefined, level: number) => (arr && level > 0 ? arr[Math.min(level, arr.length) - 1] : 0);

// ---------- Derived numbers ----------

export interface Stats {
  powerGen: number;
  powerUse: number;
  /** 0..1, how much of the demand is met. */
  powerRatio: number;
  popCap: number;
  oreCap: number;
  buildersBusy: number;
}

export function stats(s: GameState): Stats {
  let powerGen = 0;
  let powerUse = 0;
  let popCap = 0;
  let oreCap = 0;
  let buildersBusy = 0;
  for (const b of s.buildings) {
    const d = BUILDINGS[b.type];
    powerGen += lv(d.powerGen, b.level);
    powerUse += lv(d.powerUse, b.level);
    popCap += lv(d.population, b.level);
    oreCap += lv(d.storage, b.level);
    if (b.pending) buildersBusy++;
  }
  const powerRatio = powerUse === 0 ? 1 : Math.min(1, powerGen / powerUse);
  return { powerGen, powerUse, powerRatio, popCap, oreCap, buildersBusy };
}

export const countOf = (s: GameState, t: BuildingType) => s.buildings.filter((b) => b.type === t).length;
export const maxCountOf = (s: GameState, t: BuildingType) => BUILDINGS[t].maxCount[Math.min(hub(s).level, 3) - 1];

export function speedUpCost(b: Building, now: number): number {
  if (!b.pending) return 0;
  const left = Math.max(0, (b.pending.endAt - now) / 1000);
  return Math.max(1, Math.ceil(left / CONFIG.speedUpSecPerCrystal));
}

// ---------- Placement rules ----------

/** Building id on each tile, or 0. */
export function occupancy(s: GameState): number[] {
  const occ = new Array(s.size * s.size).fill(0);
  for (const b of s.buildings) {
    const n = BUILDINGS[b.type].size;
    for (let y = b.y; y < b.y + n; y++) for (let x = b.x; x < b.x + n; x++) occ[idx(s, x, y)] = b.id;
  }
  return occ;
}

export function canPlace(s: GameState, type: BuildingType, x: number, y: number): Result {
  const d = BUILDINGS[type];
  const occ = occupancy(s);
  let deposit = 0;
  for (let ty = y; ty < y + d.size; ty++) {
    for (let tx = x; tx < x + d.size; tx++) {
      if (!inBounds(s, tx, ty)) return fail('Out of bounds');
      const i = idx(s, tx, ty);
      if (occ[i]) return fail('Something is already built here');
      if (s.roads[i]) return fail('A road is in the way');
      if (s.terrain[i] === DEPOSIT) deposit++;
      else if (s.terrain[i] !== OPEN) return fail('Rocks are in the way');
    }
  }
  if (d.needsDeposit && deposit < 2) return fail('Must sit on a crystal deposit');
  if (!d.needsDeposit && deposit > 0) return fail('Keep crystal deposits free for extractors');
  return OK;
}

function canAffordAndStart(s: GameState, cost: number): Result {
  if (s.ore < cost) return fail(`Needs ${cost} ore`);
  if (stats(s).buildersBusy >= CONFIG.builderDrones) return fail('All builder drones are busy');
  return OK;
}

// ---------- Actions ----------

export function placeBuilding(s: GameState, type: BuildingType, x: number, y: number, now: number): Result & { id?: number } {
  if (type === 'hub') return fail('Only one Command Hub');
  if (countOf(s, type) >= maxCountOf(s, type)) return fail(`Upgrade the Command Hub to build more`);
  const where = canPlace(s, type, x, y);
  if (!where.ok) return where;
  const l1 = BUILDINGS[type].levels[0];
  const go = canAffordAndStart(s, l1.cost);
  if (!go.ok) return go;
  s.ore -= l1.cost;
  const id = s.nextId++;
  s.buildings.push({ id, type, x, y, level: 0, buffer: 0, reserved: 0, pending: { toLevel: 1, startAt: now, endAt: now + l1.buildSec * 1000 } });
  return { ok: true, id };
}

export function canUpgrade(s: GameState, b: Building): Result & { cost?: number; buildSec?: number } {
  const d = BUILDINGS[b.type];
  if (b.pending) return fail('Already building');
  if (b.level >= d.levels.length) return fail('Max level');
  if (b.type !== 'hub' && b.level + 1 > hub(s).level) return fail(`Needs Command Hub level ${b.level + 1}`);
  const next = d.levels[b.level];
  const go = canAffordAndStart(s, next.cost);
  if (!go.ok) return { ...go, cost: next.cost, buildSec: next.buildSec };
  return { ok: true, cost: next.cost, buildSec: next.buildSec };
}

export function startUpgrade(s: GameState, id: number, now: number): Result {
  const b = byId(s, id);
  if (!b) return fail('No such building');
  const check = canUpgrade(s, b);
  if (!check.ok) return check;
  s.ore -= check.cost!;
  b.pending = { toLevel: b.level + 1, startAt: now, endAt: now + check.buildSec! * 1000 };
  return OK;
}

export function speedUp(s: GameState, id: number, now: number): Result {
  const b = byId(s, id);
  if (!b?.pending) return fail('Nothing to speed up');
  const cost = speedUpCost(b, now);
  if (s.crystals < cost) return fail(`Needs ${cost} crystals`);
  s.crystals -= cost;
  b.pending.endAt = now;
  completeTimers(s, now);
  return OK;
}

export function canRoad(s: GameState, x: number, y: number, occ = occupancy(s)): boolean {
  if (!inBounds(s, x, y)) return false;
  const i = idx(s, x, y);
  return !s.roads[i] && !occ[i] && s.terrain[i] === OPEN;
}

/** Tiles of an L-shaped road from a to b: along x first, then along y. */
export function lTiles(a: { x: number; y: number }, b: { x: number; y: number }) {
  const out: { x: number; y: number }[] = [];
  const sx = Math.sign(b.x - a.x);
  const sy = Math.sign(b.y - a.y);
  let x = a.x;
  let y = a.y;
  out.push({ x, y });
  while (x !== b.x) out.push({ x: (x += sx), y });
  while (y !== b.y) out.push({ x, y: (y += sy) });
  return out;
}

/** Builds every buildable tile of an L-shaped road. Returns how many tiles were laid. */
export function buildRoadLine(s: GameState, a: { x: number; y: number }, b: { x: number; y: number }): Result & { placed: number } {
  const occ = occupancy(s);
  const tiles = lTiles(a, b).filter((t) => canRoad(s, t.x, t.y, occ));
  if (!tiles.length) return { ok: false, reason: 'Nothing to build there', placed: 0 };
  const cost = tiles.length * CONFIG.roadCost;
  if (s.ore < cost) return { ok: false, reason: `Needs ${cost} ore`, placed: 0 };
  s.ore -= cost;
  for (const t of tiles) s.roads[idx(s, t.x, t.y)] = 1;
  return { ok: true, placed: tiles.length };
}

export function removeRoad(s: GameState, x: number, y: number): Result {
  if (!inBounds(s, x, y) || !s.roads[idx(s, x, y)]) return fail('No road here');
  s.roads[idx(s, x, y)] = 0;
  return OK;
}

// ---------- Simulation ----------

function completeTimers(s: GameState, now: number) {
  for (const b of s.buildings) {
    if (b.pending && now >= b.pending.endAt) {
      b.level = b.pending.toLevel;
      b.pending = undefined;
    }
  }
}

function produce(s: GameState, dt: number, st: Stats, network: Set<number>) {
  for (const b of s.buildings) {
    if (b.type !== 'extractor' || b.level < 1) continue;
    if (!isConnected(s, b, network)) continue;
    const d = BUILDINGS.extractor;
    const cap = lv(d.buffer, b.level);
    b.buffer = Math.min(cap, b.buffer + lv(d.oreRate, b.level) * st.powerRatio * dt);
  }
}

function spawn(s: GameState, dt: number, st: Stats) {
  if (s.colonists.length >= st.popCap) return;
  s.spawnTimer += dt;
  if (s.spawnTimer < CONFIG.colonistSpawnSec) return;
  s.spawnTimer = 0;
  const homes = s.buildings.filter((b) => b.type === 'habitat' && b.level > 0);
  const home = homes.length ? homes[s.colonists.length % homes.length] : hub(s);
  const c = centre(home);
  s.colonists.push({ id: s.nextId++, x: c.x, y: c.y, task: 'idle', path: [], carry: 0, at: home.id });
}

function nearestStore(s: GameState, from: Building) {
  let best: { b: Building; path: NonNullable<ReturnType<typeof roadPath>>; len: number } | null = null;
  for (const b of s.buildings) {
    if ((b.type !== 'hub' && b.type !== 'storage') || b.level < 1) continue;
    const p = roadPath(s, from, b);
    if (!p) continue;
    const len = pathLength(p);
    if (!best || len < best.len) best = { b, path: p, len };
  }
  return best;
}

function assignJobs(s: GameState, st: Stats) {
  const inTransit = s.colonists.reduce((n, c) => n + c.carry + (c.pickupAmount ?? 0), 0);
  let room = st.oreCap - s.ore - inTransit;
  for (const c of s.colonists) {
    if (c.task !== 'idle' || room <= 0) continue;
    const at = byId(s, c.at);
    if (!at) continue;
    let best: { b: Building; path: NonNullable<ReturnType<typeof roadPath>>; len: number } | null = null;
    for (const b of s.buildings) {
      if (b.type !== 'extractor' || b.level < 1) continue;
      if (b.buffer - b.reserved < CONFIG.minPickup) continue;
      const p = at.id === b.id ? [centre(b)] : roadPath(s, at, b);
      if (!p) continue;
      const len = pathLength(p);
      if (!best || len < best.len) best = { b, path: p, len };
    }
    if (!best) continue;
    const amount = Math.min(CONFIG.carryAmount, Math.floor(best.b.buffer - best.b.reserved), room);
    if (amount <= 0) continue;
    best.b.reserved += amount;
    room -= amount;
    c.task = 'toPickup';
    c.pickupFrom = best.b.id;
    c.pickupAmount = amount;
    c.path = best.path.slice(1);
  }
}

function moveColonist(c: Colonist, dt: number): boolean {
  let budget = CONFIG.colonistSpeed * dt;
  while (budget > 0 && c.path.length) {
    const t = c.path[0];
    const dx = t.x - c.x;
    const dy = t.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d <= budget) {
      c.x = t.x;
      c.y = t.y;
      c.path.shift();
      budget -= d;
    } else {
      c.x += (dx / d) * budget;
      c.y += (dy / d) * budget;
      budget = 0;
    }
  }
  return c.path.length === 0;
}

function goIdle(c: Colonist, at: number) {
  c.task = 'idle';
  c.at = at;
  c.path = [];
  c.pickupFrom = c.pickupAmount = c.deliverTo = undefined;
}

function updateColonists(s: GameState, dt: number, st: Stats) {
  for (const c of s.colonists) {
    if (c.task === 'idle') continue;
    if (!moveColonist(c, dt)) continue;
    if (c.task === 'toPickup') {
      const ex = byId(s, c.pickupFrom);
      const amount = c.pickupAmount ?? 0;
      if (!ex) {
        goIdle(c, hub(s).id);
        continue;
      }
      ex.reserved = Math.max(0, ex.reserved - amount);
      const take = Math.min(amount, Math.floor(ex.buffer));
      ex.buffer -= take;
      c.carry = take;
      c.pickupAmount = undefined;
      const store = nearestStore(s, ex);
      if (!store) {
        // Road was cut: drop the ore back and wait here.
        ex.buffer += take;
        c.carry = 0;
        goIdle(c, ex.id);
        continue;
      }
      c.task = 'toDeliver';
      c.deliverTo = store.b.id;
      c.path = store.path.slice(1);
    } else if (c.task === 'toDeliver') {
      s.ore = Math.min(st.oreCap, s.ore + c.carry);
      s.delivered += c.carry;
      c.carry = 0;
      goIdle(c, c.deliverTo ?? hub(s).id);
    }
  }
}

/** One fixed simulation step. */
export function step(s: GameState, dt: number, now: number) {
  completeTimers(s, now);
  const st = stats(s);
  const network = connectedToHub(s);
  produce(s, dt, st, network);
  spawn(s, dt, st);
  assignJobs(s, st);
  updateColonists(s, dt, st);
  s.time = now;
}

/** Advance the colony to `now`, in small steps so long gaps (app closed) still play out. */
export function advance(s: GameState, now: number) {
  let gap = (now - s.time) / 1000;
  if (gap <= 0) return;
  if (gap > CONFIG.maxCatchUpSec) {
    s.time = now - CONFIG.maxCatchUpSec * 1000;
    gap = CONFIG.maxCatchUpSec;
  }
  const stepSec = gap > 2 ? 0.25 : gap;
  let t = s.time;
  while (now - t > 1e-6) {
    const dt = Math.min(stepSec, (now - t) / 1000);
    t += dt * 1000;
    step(s, dt, t);
  }
}

export function buildingStatus(s: GameState, b: Building, network = connectedToHub(s)): string[] {
  const out: string[] = [];
  if (b.level === 0) return out;
  if (b.type !== 'solar' && !isConnected(s, b, network)) out.push('Needs a road to the Command Hub');
  const d = BUILDINGS[b.type];
  if (lv(d.powerUse, b.level) > 0 && stats(s).powerRatio < 1) out.push('Low power: build or upgrade Solar Arrays');
  if (b.type === 'extractor' && b.buffer >= lv(d.buffer, b.level) - 0.01) out.push('Full: waiting for colonists');
  return out;
}

export { lv };
