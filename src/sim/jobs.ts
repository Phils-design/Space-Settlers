import { add, get, goodsOf, total } from './bag';
import { BUILDINGS, CONFIG, OPEN, type Good } from './config';
import { buildingDist, centre, distTo, routeTo, type Arrive } from './path';
import { isStorage, lv, occupancy, stats } from './rules';
import { territory } from './territory';
import { byId, hub, type Building, type Colonist, type GameState, type HaulDest, type Job, type Site, type Waypoint } from './state';

// Colonists pick up jobs in a fixed order of priority:
//   1. builders for construction sites that have work ready,
//   2. carrying materials to construction sites,
//   3. staffing workplaces (always leaving a couple of colonists free),
//   4. carrying inputs to producers,
//   5. carrying finished goods to storage.

/** How much of a site's work can be done with the materials already there. */
export function workAllowed(st: Site): number {
  const need = total(st.need);
  if (need <= 0) return st.total;
  return st.total * Math.min(1, total(st.have) / need);
}

// ---------- small helpers ----------

function setPath(c: Colonist, path: Waypoint[], offRoad = false) {
  if (c.inside != null && path.length) c.inside = undefined;
  c.path = path;
  c.offRoad = offRoad;
  c.idle = 0;
}

function enter(c: Colonist, b: Building) {
  const p = centre(b);
  c.inside = b.id;
  c.x = p.x;
  c.y = p.y;
  c.tile = -1;
  c.path = [];
  c.offRoad = false;
}

/** Ends a colonist's job where they stand. Anything they carry goes back into stock. */
export function release(s: GameState, c: Colonist) {
  if (c.carry) {
    add(s.stock, c.carry.good, c.carry.n);
    c.carry = undefined;
  }
  c.job = undefined;
  c.path = [];
  c.idle = 0;
}

function walk(c: Colonist, dt: number): boolean {
  let budget = (c.offRoad ? CONFIG.offRoadSpeed : CONFIG.roadSpeed) * dt;
  while (budget > 0 && c.path.length) {
    const t = c.path[0];
    const dx = t.x - c.x;
    const dy = t.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d <= budget) {
      c.x = t.x;
      c.y = t.y;
      if (t.tile != null) c.tile = t.tile;
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

const storages = (s: GameState) => s.buildings.filter(isStorage);

function nearestStorageTo(s: GameState, from: Building): Building | null {
  let best: Building | null = null;
  let bd = Infinity;
  for (const st of storages(s)) {
    const d = buildingDist(s, from, st);
    if (d < bd) {
      bd = d;
      best = st;
    }
  }
  return best;
}

function nearestStorageFor(s: GameState, c: Colonist): Building | null {
  let best: Building | null = null;
  let bd = Infinity;
  for (const st of storages(s)) {
    const d = distTo(s, c, st);
    if (d < bd) {
      bd = d;
      best = st;
    }
  }
  return best;
}

/** Can this colonist take a new job right now? Only when they're somewhere on (or in) the road network. */
function isFree(s: GameState, c: Colonist) {
  if (c.job && c.job.kind !== 'home') return false;
  if (c.offRoad) return false;
  return c.inside != null || (c.tile >= 0 && s.roads[c.tile] === 1);
}

interface Source {
  b: Building;
  avail: number;
  store: boolean;
}

/** The nearest place a good can be fetched from for `dest`: storage, or straight from another building's output. */
function bestSource(s: GameState, g: Good, dest: Building): Source | null {
  let best: Source | null = null;
  let bd = Infinity;
  const pooled = get(s.stock, g) - get(s.reserved, g);
  for (const b of s.buildings) {
    let avail = 0;
    let store = false;
    if (isStorage(b) && pooled >= 1) {
      avail = Math.floor(pooled);
      store = true;
    } else {
      avail = Math.floor(get(b.out, g) - get(b.outReserved, g));
    }
    if (avail < 1) continue;
    const d = buildingDist(s, b, dest);
    if (d < bd) {
      bd = d;
      best = { b, avail, store };
    }
  }
  return best;
}

// ---------- hauling ----------

function reserveDest(s: GameState, to: Building, dest: HaulDest, g: Good, n: number) {
  if (dest === 'site') add(to.site!.incoming, g, n);
  else if (dest === 'input') add(to.incoming, g, n);
  else add(s.toStore, g, n);
}

/** Undo a delivery reservation, if the destination still holds it. */
function unreserveDest(s: GameState, job: Extract<Job, { kind: 'haul' }>, n = job.n) {
  const to = byId(s, job.to);
  if (job.dest === 'store') add(s.toStore, job.good, -Math.min(n, get(s.toStore, job.good)));
  else if (!to) return;
  else if (job.dest === 'site') {
    if (to.site && to.site.toLevel === job.siteLevel) add(to.site.incoming, job.good, -n);
  } else add(to.incoming, job.good, -n);
}

function destValid(s: GameState, job: Extract<Job, { kind: 'haul' }>) {
  const to = byId(s, job.to);
  if (!to) return false;
  if (job.dest === 'site') return !!to.site && to.site.toLevel === job.siteLevel;
  if (job.dest === 'store') return isStorage(to);
  return true;
}

function startHaul(s: GameState, c: Colonist, from: Source, to: Building, g: Good, n: number, dest: HaulDest) {
  const path = routeTo(s, c, from.b, 'door', to);
  if (!path) return false;
  if (from.store) add(s.reserved, g, n);
  else add(from.b.outReserved, g, n);
  reserveDest(s, to, dest, g, n);
  c.job = { kind: 'haul', from: from.b.id, to: to.id, good: g, n, stage: 'pickup', fromStore: from.store, dest, siteLevel: to.site?.toLevel ?? 0 };
  setPath(c, path);
  return true;
}

/** Sends goods a colonist is carrying to the nearest storage instead. Walks cross-country if the roads are cut. */
function redirectToStore(s: GameState, c: Colonist, job: Extract<Job, { kind: 'haul' }>) {
  const store = nearestStorageFor(s, c);
  const path = store ? routeTo(s, c, store, 'door') : null;
  job.dest = 'store';
  add(s.toStore, job.good, job.n);
  if (store && path) {
    job.to = store.id;
    setPath(c, path);
  } else {
    job.to = hub(s).id;
    setPath(c, [centre(hub(s))], true);
  }
}

function updateHaul(s: GameState, c: Colonist, job: Extract<Job, { kind: 'haul' }>, dt: number) {
  if (job.stage === 'pickup') {
    const from = byId(s, job.from);
    if (!from || !destValid(s, job) || (job.fromStore && !isStorage(from))) {
      if (job.fromStore) add(s.reserved, job.good, -job.n);
      else if (from) add(from.outReserved, job.good, -job.n);
      unreserveDest(s, job);
      release(s, c);
      return;
    }
    if (!walk(c, dt)) return;
    let got: number;
    if (job.fromStore) {
      add(s.reserved, job.good, -job.n);
      got = Math.min(job.n, Math.floor(get(s.stock, job.good)));
      add(s.stock, job.good, -got);
    } else {
      add(from.outReserved, job.good, -job.n);
      got = Math.min(job.n, Math.floor(get(from.out, job.good)));
      add(from.out, job.good, -got);
    }
    if (got < job.n) unreserveDest(s, job, job.n - got);
    if (got <= 0) {
      release(s, c);
      return;
    }
    job.n = got;
    c.carry = { good: job.good, n: got };
    job.stage = 'deliver';
    const to = byId(s, job.to)!;
    const path = routeTo(s, c, to, 'door');
    if (path) setPath(c, path);
    else {
      unreserveDest(s, job);
      redirectToStore(s, c, job);
    }
    return;
  }
  if (!destValid(s, job)) {
    unreserveDest(s, job);
    redirectToStore(s, c, job);
    return;
  }
  if (!walk(c, dt)) return;
  const to = byId(s, job.to)!;
  unreserveDest(s, job);
  if (job.dest === 'site') add(to.site!.have, job.good, job.n);
  else if (job.dest === 'input') add(to.inv, job.good, job.n);
  else add(s.stock, job.good, job.n);
  c.carry = undefined;
  if (c.offRoad) enter(c, to);
  release(s, c);
}

// ---------- building ----------

export type CompleteFn = (s: GameState, b: Building) => void;

function updateBuild(s: GameState, c: Colonist, job: Extract<Job, { kind: 'build' }>, dt: number, complete: CompleteFn) {
  const b = byId(s, job.site);
  if (!b || !b.site || b.site.builder !== c.id) {
    release(s, c);
    return;
  }
  if (job.stage === 'go') {
    if (walk(c, dt)) job.stage = 'work';
    return;
  }
  const st = b.site;
  const allowed = workAllowed(st);
  if (st.work < allowed - 1e-9) {
    st.work = Math.min(allowed, st.work + dt);
    job.wait = 0;
    if (st.work >= st.total - 1e-9) complete(s, b);
  } else if (total(st.incoming) <= 0) {
    // Nothing to build with and nothing on the way: go and help elsewhere.
    job.wait += dt;
    if (job.wait >= CONFIG.builderPatienceSec) {
      st.builder = undefined;
      release(s, c);
    }
  }
}

// ---------- workplaces ----------

const isReserved = (s: GameState, node: number, self: Colonist) =>
  s.colonists.some((o) => o !== self && o.job?.kind === 'work' && o.job.node === node);

/** Nearest grown tree or rock within reach of a gatherer's hut. */
export function findNode(s: GameState, b: Building, self?: Colonist): number {
  const d = BUILDINGS[b.type];
  if (!d.gather) return -1;
  const r = lv(d.gather.radius, b.level || 1);
  const c = centre(b);
  const land = territory(s);
  let best = -1;
  let bd = Infinity;
  for (let y = Math.max(0, Math.floor(c.y - r)); y <= Math.min(s.size - 1, Math.ceil(c.y + r)); y++) {
    for (let x = Math.max(0, Math.floor(c.x - r)); x <= Math.min(s.size - 1, Math.ceil(c.x + r)); x++) {
      const i = y * s.size + x;
      if (!land[i]) continue;
      if (d.gather.node === 'tree' ? s.trees[i] < 100 : s.rocks[i] <= 0) continue;
      const dist = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
      if (dist > r || dist >= bd) continue;
      if (self && isReserved(s, i, self)) continue;
      bd = dist;
      best = i;
    }
  }
  return best;
}

/** Trees (grown or growing) within a forester's reach. */
export function treesNear(s: GameState, b: Building, r: number) {
  const c = centre(b);
  let n = 0;
  for (let y = Math.max(0, Math.floor(c.y - r)); y <= Math.min(s.size - 1, Math.ceil(c.y + r)); y++) {
    for (let x = Math.max(0, Math.floor(c.x - r)); x <= Math.min(s.size - 1, Math.ceil(c.x + r)); x++) {
      if (s.trees[y * s.size + x] > 0 && Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= r) n++;
    }
  }
  return n;
}

/** A free patch of ground for a sapling, keeping clear of roads and buildings. */
export function findPlantSpot(s: GameState, b: Building, self?: Colonist): number {
  const d = BUILDINGS[b.type];
  if (!d.plant) return -1;
  const r = lv(d.plant.radius, b.level || 1);
  if (treesNear(s, b, r) >= d.plant.maxTrees) return -1;
  const c = centre(b);
  const occ = occupancy(s);
  const land = territory(s);
  const clear = (i: number) => !occ[i] && !s.roads[i];
  let best = -1;
  let bs = Infinity;
  for (let y = Math.max(1, Math.floor(c.y - r)); y <= Math.min(s.size - 2, Math.ceil(c.y + r)); y++) {
    for (let x = Math.max(1, Math.floor(c.x - r)); x <= Math.min(s.size - 2, Math.ceil(c.x + r)); x++) {
      const i = y * s.size + x;
      if (!land[i] || s.terrain[i] !== OPEN || s.trees[i] || s.rocks[i] || !clear(i)) continue;
      if (!clear(i - 1) || !clear(i + 1) || !clear(i - s.size) || !clear(i + s.size)) continue;
      const dist = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
      if (dist > r || dist < 2) continue;
      // A little deterministic scatter so groves look natural.
      const score = dist + (((i * 2654435761) >>> 0) / 4294967296) * 2.5;
      if (score >= bs || (self && isReserved(s, i, self))) continue;
      bs = score;
      best = i;
    }
  }
  return best;
}

/** Stand beside a tree or rock rather than inside it. */
function besideNode(s: GameState, node: number, b: Building): Waypoint {
  const x = (node % s.size) + 0.5;
  const y = Math.floor(node / s.size) + 0.5;
  const c = centre(b);
  const d = Math.hypot(c.x - x, c.y - y) || 1;
  return { x: x + ((c.x - x) / d) * 0.45, y: y + ((c.y - y) / d) * 0.45 };
}

function updateWork(s: GameState, c: Colonist, job: Extract<Job, { kind: 'work' }>, dt: number) {
  const b = byId(s, job.at);
  if (!b || b.worker !== c.id) {
    release(s, c);
    return;
  }
  const d = BUILDINGS[b.type];
  switch (job.stage) {
    case 'go':
      if (walk(c, dt)) {
        enter(c, b);
        job.stage = 'inside';
        job.timer = CONFIG.gatherRestSec;
      }
      return;
    case 'inside': {
      if ((!d.gather && !d.plant) || b.site) return;
      job.timer -= dt;
      if (job.timer > 0) return;
      if (d.gather && total(b.out) >= CONFIG.outCap) {
        job.timer = 1;
        return;
      }
      const node = d.gather ? findNode(s, b, c) : findPlantSpot(s, b, c);
      if (node < 0) {
        job.timer = 3;
        return;
      }
      job.node = node;
      job.stage = 'out';
      setPath(c, [besideNode(s, node, b)], true);
      c.tile = -1;
      return;
    }
    case 'out':
      if (walk(c, dt)) {
        job.stage = 'harvest';
        job.timer = lv(d.gather ? d.gather.sec : d.plant!.sec, b.level);
      }
      return;
    case 'harvest': {
      job.timer -= dt;
      if (job.timer > 0) return;
      const i = job.node;
      if (d.gather?.node === 'tree' && s.trees[i] >= 100) {
        s.trees[i] = 0;
        c.carry = { good: d.gather.good, n: d.gather.n };
        s.natureRev++;
      } else if (d.gather?.node === 'rock' && s.rocks[i] > 0) {
        s.rocks[i]--;
        c.carry = { good: d.gather.good, n: d.gather.n };
        s.natureRev++;
      } else if (d.plant && !s.trees[i] && !occupancy(s)[i] && !s.roads[i]) {
        s.trees[i] = 1;
        s.natureRev++;
      }
      job.node = -1;
      job.stage = 'back';
      setPath(c, [centre(b)], true);
      return;
    }
    case 'back':
      if (walk(c, dt)) {
        if (c.carry) {
          add(b.out, c.carry.good, c.carry.n);
          add(s.made, c.carry.good, c.carry.n);
          c.carry = undefined;
        }
        enter(c, b);
        job.stage = 'inside';
        job.timer = CONFIG.gatherRestSec;
      }
      return;
  }
}

/** Is this workplace's worker inside and ready? */
export function workerInside(s: GameState, b: Building): boolean {
  if (b.worker == null) return false;
  const c = s.colonists.find((o) => o.id === b.worker);
  return !!c && c.inside === b.id && c.job?.kind === 'work' && c.job.stage === 'inside';
}

// ---------- idle colonists ----------

function goHome(s: GameState, c: Colonist) {
  const store = nearestStorageFor(s, c);
  const path = store ? routeTo(s, c, store, 'centre') : null;
  if (store && path) {
    c.job = { kind: 'home', to: store.id };
    setPath(c, path);
  } else {
    // Stranded: walk cross-country to the Command Hub.
    const h = hub(s);
    c.job = { kind: 'home', to: h.id };
    c.inside = undefined;
    c.tile = -1;
    setPath(c, [centre(h)], true);
  }
}

function updateIdle(s: GameState, c: Colonist, dt: number) {
  if (c.inside != null) {
    const b = byId(s, c.inside);
    if (b && isStorage(b)) return;
    if (!b) c.inside = undefined;
    goHome(s, c);
    return;
  }
  if (c.offRoad || c.tile < 0 || !s.roads[c.tile]) {
    goHome(s, c);
    return;
  }
  c.idle += dt;
  if (c.idle >= CONFIG.idleReturnSec) goHome(s, c);
}

function updateHome(s: GameState, c: Colonist, job: Extract<Job, { kind: 'home' }>, dt: number) {
  const to = byId(s, job.to);
  if (!to) {
    release(s, c);
    return;
  }
  if (walk(c, dt)) {
    enter(c, to);
    release(s, c);
  }
}

export function updateColonists(s: GameState, dt: number, complete: CompleteFn) {
  for (const c of s.colonists) {
    const job = c.job;
    if (!job) updateIdle(s, c, dt);
    else if (job.kind === 'home') updateHome(s, c, job, dt);
    else if (job.kind === 'haul') updateHaul(s, c, job, dt);
    else if (job.kind === 'build') updateBuild(s, c, job, dt, complete);
    else updateWork(s, c, job, dt);
  }
}

// ---------- handing out jobs ----------

export function assignJobs(s: GameState) {
  const free = s.colonists.filter((c) => isFree(s, c));
  if (!free.length) return;

  /** The free colonist nearest a building by road (who can carry on to `then`). */
  const nearest = (target: Building, then?: Building): Colonist | null => {
    let best: Colonist | null = null;
    let bd = Infinity;
    for (const c of free) {
      const d = distTo(s, c, target, then);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  };
  const claim = (c: Colonist) => {
    free.splice(free.indexOf(c), 1);
    if (c.job?.kind === 'home') c.job = undefined;
  };
  /** Sends the nearest free colonist to a building, or returns null if nobody can get there. */
  const take = (target: Building, arrive: Arrive): { c: Colonist; path: Waypoint[] } | null => {
    const c = nearest(target);
    const path = c && routeTo(s, c, target, arrive);
    if (!c || !path) return null;
    claim(c);
    return { c, path };
  };
  /** Starts a haul with the free colonist nearest the pickup. */
  const haul = (src: Source, to: Building, g: Good, n: number, dest: HaulDest) => {
    const c = nearest(src.b, to);
    if (!c) return false;
    claim(c);
    return startHaul(s, c, src, to, g, n, dest);
  };

  const sites = s.buildings.filter((b) => b.site).sort((a, b) => a.id - b.id);

  // 1. Builders.
  for (const b of sites) {
    if (!free.length) return;
    const st = b.site!;
    if (st.builder != null) continue;
    if (!(workAllowed(st) > st.work + 1e-6 || total(st.incoming) > 0)) continue;
    const got = take(b, 'work');
    if (!got) continue;
    got.c.job = { kind: 'build', site: b.id, stage: 'go', wait: 0 };
    st.builder = got.c.id;
    setPath(got.c, got.path);
  }

  /** Hauls of one good towards a building until it has what it needs or nobody is left. */
  const supply = (b: Building, g: Good, missing: number, dest: HaulDest) => {
    while (missing > 0 && free.length) {
      const src = bestSource(s, g, b);
      if (!src) return;
      const n = Math.min(CONFIG.carryMax, missing, src.avail);
      if (!haul(src, b, g, n, dest)) return;
      missing -= n;
    }
  };

  // 2. Materials for construction sites, oldest site first.
  for (const b of sites) {
    if (!free.length) return;
    const st = b.site!;
    for (const g of goodsOf(st.need)) supply(b, g, get(st.need, g) - get(st.have, g) - get(st.incoming, g), 'site');
  }

  // 3. Workers for workplaces, keeping enough colonists free to build and carry.
  let workers = s.colonists.filter((c) => c.job?.kind === 'work').length;
  for (const b of s.buildings) {
    if (!free.length || !canStaff(s.colonists.length, workers)) break;
    const d = BUILDINGS[b.type];
    if (!d.workers || b.level < 1 || b.worker != null || b.paused) continue;
    const got = take(b, 'centre');
    if (!got) continue;
    got.c.job = { kind: 'work', at: b.id, stage: got.path.length ? 'go' : 'inside', node: -1, timer: 0 };
    b.worker = got.c.id;
    setPath(got.c, got.path);
    workers++;
  }

  // 4. Inputs for staffed producers.
  for (const b of s.buildings) {
    if (!free.length) return;
    const d = BUILDINGS[b.type];
    if (!d.recipe || b.level < 1 || b.paused || b.worker == null) continue;
    for (const g of goodsOf(d.recipe.in)) supply(b, g, get(d.recipe.in, g) * CONFIG.inCycles - get(b.inv, g) - get(b.incoming, g), 'input');
  }

  // 5. Finished goods to storage, fullest buildings first. Each good has its own storage limit.
  const cap = stats(s).storageCap;
  const room = (g: Good) => cap - get(s.stock, g) - get(s.toStore, g);
  const outs = s.buildings
    .map((b) => ({ b, n: total(b.out) - total(b.outReserved) }))
    .filter((o) => o.n >= 1)
    .sort((a, b) => b.n - a.n);
  for (const { b } of outs) {
    if (!free.length) return;
    const store = nearestStorageTo(s, b);
    if (!store) continue;
    for (const g of goodsOf(b.out)) {
      let avail = Math.floor(get(b.out, g) - get(b.outReserved, g));
      while (avail >= 1 && room(g) >= 1 && free.length) {
        const n = Math.min(CONFIG.carryMax, avail, Math.floor(room(g)));
        if (!haul({ b, avail, store: false }, store, g, n, 'store')) break;
        avail -= n;
      }
    }
  }
}

/** Can one more colonist become a worker and still leave enough to build and carry? */
export function canStaff(colonists: number, workers: number) {
  return colonists - workers - 1 >= Math.max(CONFIG.reserveFree, Math.ceil((workers + 1) * CONFIG.carriersPerWorker));
}

/** Frees the worker of a building (pausing, demolishing). */
export function releaseWorker(s: GameState, b: Building) {
  const c = s.colonists.find((o) => o.id === b.worker);
  b.worker = undefined;
  if (!c) return;
  release(s, c);
}

/** Make sure a builder field is cleared if that colonist no longer works there. */
export function tidySites(s: GameState) {
  for (const b of s.buildings) {
    const st = b.site;
    if (!st || st.builder == null) continue;
    const c = s.colonists.find((o) => o.id === st.builder);
    if (!c || c.job?.kind !== 'build' || c.job.site !== b.id) st.builder = undefined;
  }
  for (const b of s.buildings) {
    if (b.worker == null) continue;
    const c = s.colonists.find((o) => o.id === b.worker);
    if (!c || c.job?.kind !== 'work' || c.job.at !== b.id) b.worker = undefined;
  }
}
