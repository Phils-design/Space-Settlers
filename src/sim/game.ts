import { add, entries, get, total } from './bag';
import { BUILDINGS, CONFIG, GOOD_INFO, type Bag, type BuildingType, type Good } from './config';
import { assignJobs, findNode, findPlantSpot, release, releaseWorker, tidySites, updateColonists, workAllowed, workerInside } from './jobs';
import { connected, forgetField } from './path';
import { roadReach } from './roads';
import { buildBlocker, canPlace, fail, hubLevel, isStorage, lv, OK, stats, type Result } from './rules';
import { addColonist, byId, colonistById, hub, newBuilding, type Building, type GameState } from './state';

export * from './rules';

// ---------- actions ----------

function newSite(toLevel: number, type: BuildingType) {
  const l = BUILDINGS[type].levels[toLevel - 1];
  return { toLevel, need: { ...l.cost }, have: {}, incoming: {}, work: 0, total: l.work };
}

/** Marks out a construction site. Colonists bring the materials and build it. */
export function placeBuilding(s: GameState, type: BuildingType, x: number, y: number): Result & { id?: number } {
  const blocked = buildBlocker(s, type);
  if (blocked) return fail(blocked);
  const where = canPlace(s, type, x, y);
  if (!where.ok) return where;
  const b = newBuilding(s, type, x, y);
  b.site = newSite(1, type);
  return { ok: true, id: b.id };
}

export function canUpgrade(s: GameState, b: Building): Result & { cost?: Bag; work?: number } {
  const d = BUILDINGS[b.type];
  if (b.site) return fail(b.level === 0 ? 'Still under construction' : 'Already upgrading');
  if (b.level >= d.levels.length) return fail('Max level');
  if (b.type !== 'hub' && b.level + 1 > hubLevel(s)) return fail(`Needs Command Hub level ${b.level + 1}`);
  const next = d.levels[b.level];
  return { ok: true, cost: next.cost, work: next.work };
}

export function startUpgrade(s: GameState, id: number): Result {
  const b = byId(s, id);
  if (!b) return fail('No such building');
  const check = canUpgrade(s, b);
  if (!check.ok) return check;
  b.site = newSite(b.level + 1, b.type);
  return OK;
}

/** Materials a site still needs from storage to finish right now. */
export function missingForSite(b: Building): Bag {
  const out: Bag = {};
  if (!b.site) return out;
  for (const [g, n] of entries(b.site.need)) {
    const m = n - get(b.site.have, g);
    if (m > 0) out[g] = m;
  }
  return out;
}

export function speedUpCost(b: Building): number {
  if (!b.site) return 0;
  return Math.max(1, Math.ceil((b.site.total - b.site.work) / CONFIG.speedUpSecPerCrystal));
}

/** What stops a crystal speed-up, or null. */
export function speedUpBlocker(s: GameState, b: Building): string | null {
  if (!b.site) return 'Nothing to finish';
  for (const [g, n] of entries(missingForSite(b))) {
    const have = Math.max(0, Math.floor(get(s.stock, g) - get(s.reserved, g)));
    if (have < n) return `Needs ${n - have} more ${goodName(g)} in storage`;
  }
  const cost = speedUpCost(b);
  if (s.crystals < cost) return `Needs ${cost} crystals`;
  return null;
}

export const goodName = (g: Good) => GOOD_INFO[g].name.toLowerCase();

/** Units of a good that carriers could fetch right now, from storage or straight from buildings. */
export function available(s: GameState, g: Good): number {
  let n = Math.max(0, get(s.stock, g) - get(s.reserved, g));
  for (const b of s.buildings) n += Math.max(0, get(b.out, g) - get(b.outReserved, g));
  return Math.floor(n);
}

/** Finishes a site at once for crystals. The missing materials still come out of storage. */
export function speedUp(s: GameState, id: number): Result {
  const b = byId(s, id);
  if (!b?.site) return fail('Nothing to finish');
  const blocked = speedUpBlocker(s, b);
  if (blocked) return fail(blocked);
  s.crystals -= speedUpCost(b);
  for (const [g, n] of entries(missingForSite(b))) add(s.stock, g, -n);
  b.site.have = { ...b.site.need };
  b.site.work = b.site.total;
  completeSite(s, b);
  return OK;
}

function completeSite(s: GameState, b: Building) {
  const st = b.site;
  if (!st) return;
  const builder = colonistById(s, st.builder);
  if (builder?.job?.kind === 'build') release(s, builder);
  b.level = st.toLevel;
  b.site = undefined;
  s.buildingsRev++;
}

export function togglePause(s: GameState, id: number): Result {
  const b = byId(s, id);
  if (!b || !BUILDINGS[b.type].workers) return fail('Nothing to pause');
  b.paused = !b.paused;
  if (b.paused) releaseWorker(s, b);
  return OK;
}

/** Knocks a building down. Materials on a site and goods inside go back into storage. */
export function demolish(s: GameState, id: number): Result {
  const b = byId(s, id);
  if (!b) return fail('No such building');
  if (b.type === 'hub') return fail("The Command Hub can't be demolished");
  releaseWorker(s, b);
  for (const bag of [b.site?.have ?? {}, b.inv, b.out]) for (const [g, n] of entries(bag)) add(s.stock, g, n);
  s.buildings = s.buildings.filter((o) => o !== b);
  s.buildingsRev++;
  forgetField(s, b.id);
  for (const c of s.colonists) if (c.inside === b.id) c.inside = undefined;
  return OK;
}

// ---------- simulation ----------

function produce(s: GameState, dt: number, powerRatio: number) {
  for (const b of s.buildings) {
    const d = BUILDINGS[b.type];
    const r = d.recipe;
    if (!r || b.level < 1 || b.site || b.paused || !workerInside(s, b)) continue;
    if (b.progress <= 0) {
      if (total(b.out) >= CONFIG.outCap) continue;
      if (entries(r.in).some(([g, n]) => get(b.inv, g) < n)) continue;
      for (const [g, n] of entries(r.in)) add(b.inv, g, -n);
      b.progress = 1e-6;
    }
    b.progress += (dt / lv(r.sec, b.level)) * (d.powerUse ? powerRatio : 1);
    if (b.progress >= 1) {
      for (const [g, n] of entries(r.out)) {
        add(b.out, g, n);
        add(s.made, g, n);
      }
      b.progress = 0;
    }
  }
}

function spawn(s: GameState, dt: number, popCap: number) {
  if (s.colonists.length >= popCap) {
    s.spawnTimer = 0;
    return;
  }
  s.spawnTimer += dt;
  if (s.spawnTimer < CONFIG.colonistSpawnSec) return;
  s.spawnTimer = 0;
  addColonist(s, hub(s));
}

/** Saplings grow a little every second. */
function grow(s: GameState, dt: number) {
  s.natureTimer += dt;
  if (s.natureTimer < 1) return;
  const step = (100 / CONFIG.treeGrowSec) * s.natureTimer;
  s.natureTimer = 0;
  let changed = false;
  for (let i = 0; i < s.trees.length; i++) {
    const t = s.trees[i];
    if (t > 0 && t < 100) {
      s.trees[i] = Math.min(100, t + step);
      changed = true;
    }
  }
  if (changed) s.natureRev++;
}

/** One simulation step of `dt` seconds. */
export function step(s: GameState, dt: number) {
  const st = stats(s);
  spawn(s, dt, st.popCap);
  grow(s, dt);
  s.jobTimer += dt;
  if (s.jobTimer >= CONFIG.jobTickSec) {
    s.jobTimer = 0;
    tidySites(s);
    assignJobs(s);
  }
  updateColonists(s, dt, completeSite);
  produce(s, dt, st.powerRatio);
}

/** Advance the colony to `now` (epoch ms), in small steps so long gaps (app closed) still play out. */
export function advance(s: GameState, now: number) {
  let gap = (now - s.time) / 1000;
  if (gap <= 0) return;
  if (gap > CONFIG.maxCatchUpSec) gap = CONFIG.maxCatchUpSec;
  const stepSec = gap > 1 ? 0.25 : gap;
  while (gap > 1e-6) {
    const dt = Math.min(stepSec, gap);
    step(s, dt);
    gap -= dt;
  }
  s.time = now;
}

/** Runs the colony forward a fixed number of seconds. Handy for tests. */
export function simulate(s: GameState, seconds: number, dt = 0.25) {
  for (let t = 0; t < seconds - 1e-9; t += dt) step(s, Math.min(dt, seconds - t));
  s.time += seconds * 1000;
}

// ---------- what's going on, for the HUD ----------

export type SiteState = 'needs-road' | 'materials' | 'no-colonist' | 'delivering' | 'building' | 'waiting';

export function siteState(s: GameState, b: Building): SiteState {
  const st = b.site!;
  if (!connected(s, b)) return 'needs-road';
  if (st.builder != null) {
    const c = colonistById(s, st.builder);
    return c?.job?.kind === 'build' && c.job.stage === 'work' && st.work < workAllowed(st) ? 'building' : 'waiting';
  }
  if (total(st.incoming) > 0) return 'delivering';
  if (shortages(s, b).length) return 'materials';
  return 'no-colonist';
}

/** Goods a site is stuck on: still needed, not all on the way, and none to be had. */
export function shortages(s: GameState, b: Building): Good[] {
  const st = b.site;
  if (!st) return [];
  return entries(missingForSite(b))
    .filter(([g, n]) => get(st.incoming, g) < n && available(s, g) < 1)
    .map(([g]) => g);
}

export function buildingStatus(s: GameState, b: Building): string[] {
  const d = BUILDINGS[b.type];
  const out: string[] = [];
  if (b.site) {
    const st = siteState(s, b);
    if (st === 'needs-road') out.push('Needs a road to the Command Hub');
    else if (st === 'materials') out.push(`Waiting for ${shortages(s, b).map(goodName).join(' and ')}: none in storage`);
    else if (st === 'no-colonist' && stats(s).free === 0) out.push('Every colonist is busy. Build a Habitat for more, or pause a workplace');
    return out;
  }
  if (b.type !== 'hub' && !connected(s, b)) out.push('Needs a road to the Command Hub');
  if (d.workers && !b.paused) {
    if (b.worker == null) out.push('No worker yet: waiting for a free colonist');
    if (d.powerUse && stats(s).powerRatio < 1) out.push(`Low power: running at ${Math.round(stats(s).powerRatio * 100)}% speed`);
    if (total(b.out) >= CONFIG.outCap) {
      const full = entries(b.out).filter(([g]) => get(s.stock, g) >= stats(s).storageCap);
      out.push(
        full.length
          ? `Storage is full of ${full.map(([g]) => goodName(g)).join(' and ')}. Pause this, or build a Storage Depot`
          : 'Output full: waiting for carriers. More colonists (Habitats) means more carriers',
      );
    }
    if (d.recipe && b.worker != null && b.progress <= 0) {
      const lacking = entries(d.recipe.in)
        .filter(([g, n]) => get(b.inv, g) < n)
        .map(([g]) => g);
      if (lacking.length) out.push(`Waiting for ${lacking.map(goodName).join(' and ')}`);
    }
    if (d.gather && b.worker != null && findNode(s, b) < 0) out.push(d.gather.node === 'tree' ? 'No grown trees in reach. A Grove Keeper can plant more' : 'No rocks left in reach');
    if (d.plant && b.worker != null && findPlantSpot(s, b) < 0) out.push('No room to plant, or the grove is full');
  }
  if (isStorage(b)) {
    const full = entries(s.stock).filter(([, n]) => n >= stats(s).storageCap);
    if (full.length) out.push(`Full of ${full.map(([g]) => goodName(g)).join(', ')}`);
  }
  return out;
}

// ---------- placement advice ----------

/** Trees or rocks a gatherer placed at x, y could reach. */
function nodesInReach(s: GameState, type: BuildingType, x: number, y: number) {
  const g = BUILDINGS[type].gather;
  if (!g) return 0;
  const n = BUILDINGS[type].size;
  const cx = x + n / 2;
  const cy = y + n / 2;
  const r = lv(g.radius, 1);
  let count = 0;
  for (let ty = Math.max(0, Math.floor(cy - r)); ty <= Math.min(s.size - 1, Math.ceil(cy + r)); ty++) {
    for (let tx = Math.max(0, Math.floor(cx - r)); tx <= Math.min(s.size - 1, Math.ceil(cx + r)); tx++) {
      const i = ty * s.size + tx;
      if ((g.node === 'tree' ? s.trees[i] >= 100 : s.rocks[i] > 0) && Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy) <= r) count++;
    }
  }
  return count;
}

/**
 * A good free spot for a new building near a point: close by, and for gatherers, with plenty to gather.
 * Returns null if there's nowhere to put it.
 */
export function bestSpot(s: GameState, type: BuildingType, near: { x: number; y: number }): { x: number; y: number } | null {
  const n = BUILDINGS[type].size;
  const gatherer = !!BUILDINGS[type].gather;
  if (BUILDINGS[type].plant) {
    // Grove Keepers belong next to the woodcutters.
    const camps = s.buildings.filter((b) => b.type === 'lumber');
    let bd = Infinity;
    for (const c of camps) {
      const d = Math.hypot(c.x + 1 - near.x, c.y + 1 - near.y);
      if (d < bd) {
        bd = d;
        near = { x: c.x + 1, y: c.y + 1 };
      }
    }
  }
  const reach = roadReach(s);
  /** Could a road get to this spot from the Command Hub? */
  const reachable = (x: number, y: number) => {
    for (let i = 0; i < n; i++) {
      for (const [tx, ty] of [
        [x + i, y - 1],
        [x + i, y + n],
        [x - 1, y + i],
        [x + n, y + i],
      ]) {
        if (tx >= 0 && ty >= 0 && tx < s.size && ty < s.size && reach[ty * s.size + tx]) return true;
      }
    }
    return false;
  };
  let best: { x: number; y: number } | null = null;
  let bs = Infinity;
  for (let y = 0; y <= s.size - n; y++) {
    for (let x = 0; x <= s.size - n; x++) {
      const d = Math.hypot(x + n / 2 - near.x, y + n / 2 - near.y);
      if (d >= bs + 26) continue;
      if (!canPlace(s, type, x, y).ok || !reachable(x, y)) continue;
      const score = gatherer ? d - Math.min(nodesInReach(s, type, x, y), 36) * 0.7 : d;
      if (score < bs) {
        bs = score;
        best = { x, y };
      }
    }
  }
  return best;
}
