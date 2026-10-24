import { describe, expect, it } from 'vitest';
import { BUILDINGS, CONFIG, FERRITE, ICE, LUMENITE, OPEN, type BuildingType } from '../src/sim/config';
import {
  buildingStatus,
  canPlace,
  demolish,
  placeBuilding,
  simulate,
  speedUp,
  speedUpBlocker,
  startUpgrade,
  stats,
  togglePause,
} from '../src/sim/game';
import { assignJobs } from '../src/sim/jobs';
import { connected } from '../src/sim/path';
import { buildRoad, connectRoad, planRoad, removeRoad } from '../src/sim/roads';
import { deserialize, serialize } from '../src/sim/save';
import { createGame, hub, idx, type Building, type GameState } from '../src/sim/state';
import { territory } from '../src/sim/territory';

const T0 = 1_000_000;

/** A cleared map: no trees, rocks or deposits, so each test sets up its own layout. */
function blank(): GameState {
  const s = createGame(1, T0);
  s.terrain.fill(OPEN);
  s.trees.fill(0);
  s.rocks.fill(0);
  s.stock = { planks: 200, stone: 200 };
  s.crystals = 10_000;
  return s;
}

/** Stops new colonists arriving, so tests control the head count. */
const noSpawning = (s: GameState) => (s.spawnTimer = -1e9);

// The hub sits at (47, 47) to (49, 49). A road along y = 50 runs under it;
// buildings placed at y = 51 sit on that road.
const ROAD_Y = 50;
function mainRoad(s: GameState, x0 = 40, x1 = 62) {
  expect(buildRoad(s, { x: x0, y: ROAD_Y }, { x: x1, y: ROAD_Y }).ok).toBe(true);
}

function build(s: GameState, type: BuildingType, x: number, y: number): Building {
  const r = placeBuilding(s, type, x, y);
  expect(r).toMatchObject({ ok: true });
  return s.buildings.find((b) => b.id === r.id)!;
}

/** Places and instantly finishes a building (crystals pay, stock supplies the materials). */
function built(s: GameState, type: BuildingType, x: number, y: number): Building {
  const b = build(s, type, x, y);
  expect(speedUp(s, b.id)).toEqual({ ok: true });
  return b;
}

function fill(s: GameState, x: number, y: number, n: number, layer: 'trees' | 'rocks' | 'terrain', value: number) {
  for (let j = y; j < y + n; j++) for (let i = x; i < x + n; i++) s[layer][idx(s, i, j)] = value;
}

describe('map', () => {
  it('keeps the hub clear and puts every kind of resource close by', () => {
    for (const seed of [1, 2, 42, 999]) {
      const s = createGame(seed, T0);
      const h = hub(s);
      for (let y = h.y - 1; y < h.y + 4; y++) {
        for (let x = h.x - 1; x < h.x + 4; x++) {
          const i = idx(s, x, y);
          expect([s.terrain[i], s.trees[i], s.rocks[i]]).toEqual([OPEN, 0, 0]);
        }
      }
      const near = (pred: (i: number) => boolean, r: number) => {
        let n = 0;
        for (let i = 0; i < s.size * s.size; i++) {
          if (pred(i) && Math.hypot((i % s.size) + 0.5 - 48.5, Math.floor(i / s.size) + 0.5 - 48.5) <= r) n++;
        }
        return n;
      };
      expect(near((i) => s.trees[i] === 100, 14)).toBeGreaterThan(60);
      expect(near((i) => s.rocks[i] > 0, 13)).toBeGreaterThan(8);
      for (const t of [ICE, LUMENITE, FERRITE]) expect(near((i) => s.terrain[i] === t, 18)).toBeGreaterThan(5);
    }
  });
});

describe('territory', () => {
  it('limits building to your land and grows with the Command Hub', () => {
    const s = blank();
    const land = territory(s);
    const r1 = BUILDINGS.hub.territory![0];
    expect(land[idx(s, 48, 48 + r1 - 2)]).toBe(1);
    expect(land[idx(s, 48, 48 + r1 + 2)]).toBe(0);
    expect(canPlace(s, 'solar', 48, 48 + r1 + 2)).toEqual({ ok: false, reason: 'Outside your territory' });
    expect(startUpgrade(s, hub(s).id).ok).toBe(true);
    expect(speedUp(s, hub(s).id).ok).toBe(true);
    expect(territory(s)[idx(s, 48, 48 + r1 + 2)]).toBe(1);
    expect(canPlace(s, 'solar', 48, 48 + r1 + 2).ok).toBe(true);
  });

  it('survey beacons claim more land once built', () => {
    const s = blank();
    startUpgrade(s, hub(s).id);
    speedUp(s, hub(s).id);
    const r2 = BUILDINGS.hub.territory![1];
    const edge = 48 + r2 - 1;
    expect(territory(s)[idx(s, 48, edge + 4)]).toBe(0);
    const beacon = build(s, 'beacon', 48, edge);
    expect(territory(s)[idx(s, 48, edge + 4)]).toBe(0);
    speedUp(s, beacon.id);
    expect(territory(s)[idx(s, 48, edge + 4)]).toBe(1);
  });
});

describe('placement', () => {
  it('drills and mines need their deposit; everything else keeps off deposits', () => {
    const s = blank();
    fill(s, 40, 40, 2, 'terrain', ICE);
    fill(s, 56, 40, 2, 'terrain', FERRITE);
    startUpgrade(s, hub(s).id);
    speedUp(s, hub(s).id);
    expect(canPlace(s, 'icedrill', 40, 40).ok).toBe(true);
    expect(canPlace(s, 'icedrill', 56, 40).ok).toBe(false);
    expect(canPlace(s, 'mine', 56, 40).ok).toBe(true);
    expect(canPlace(s, 'icedrill', 44, 40).ok).toBe(false);
    expect(canPlace(s, 'habitat', 40, 40).ok).toBe(false);
  });

  it('trees, rocks, roads and other buildings block placement', () => {
    const s = blank();
    fill(s, 40, 40, 1, 'trees', 100);
    fill(s, 44, 40, 1, 'rocks', 5);
    mainRoad(s);
    expect(canPlace(s, 'habitat', 40, 40).ok).toBe(false);
    expect(canPlace(s, 'habitat', 44, 40).ok).toBe(false);
    expect(canPlace(s, 'habitat', 50, ROAD_Y).ok).toBe(false);
    expect(canPlace(s, 'habitat', 48, 48).ok).toBe(false);
    expect(canPlace(s, 'habitat', 52, 51).ok).toBe(true);
  });

  it('Hub level unlocks buildings and raises how many you can have', () => {
    const s = blank();
    expect(placeBuilding(s, 'mine', 40, 40)).toEqual({ ok: false, reason: 'Unlocks at Command Hub level 2' });
    build(s, 'quarry', 40, 40);
    expect(placeBuilding(s, 'quarry', 44, 40)).toEqual({ ok: false, reason: 'Upgrade the Command Hub to build more' });
    startUpgrade(s, hub(s).id);
    speedUp(s, hub(s).id);
    expect(placeBuilding(s, 'quarry', 44, 40).ok).toBe(true);
  });
});

describe('construction', () => {
  it('carriers bring the materials and a builder puts it up', () => {
    const s = blank();
    mainRoad(s);
    const lumber = build(s, 'lumber', 52, 51);
    const planks = s.stock.planks!;
    expect(lumber.level).toBe(0);
    simulate(s, 40);
    expect(lumber.level).toBe(1);
    expect(s.stock.planks).toBe(planks - BUILDINGS.lumber.levels[0].cost.planks!);
    expect(lumber.site).toBeUndefined();
  });

  it('nothing gets built without a road', () => {
    const s = blank();
    const lumber = build(s, 'lumber', 52, 54);
    simulate(s, 60);
    expect(lumber.level).toBe(0);
    expect(lumber.site!.have).toEqual({});
    expect(buildingStatus(s, lumber)).toContain('Needs a road to the Command Hub');
    expect(connectRoad(s, lumber.id).ok).toBe(true);
    expect(connected(s, lumber)).toBe(true);
    simulate(s, 60);
    expect(lumber.level).toBe(1);
  });

  it('waits until a colonist is free', () => {
    const s = blank();
    noSpawning(s);
    const everyone = s.colonists;
    s.colonists = [];
    mainRoad(s);
    const camp = build(s, 'lumber', 52, 51);
    simulate(s, 60);
    expect(camp.site!.work).toBe(0);
    expect(buildingStatus(s, camp)).toContain('Every colonist is busy. Build a Habitat for more, or pause a workplace');
    s.colonists = everyone.slice(0, 1);
    simulate(s, 60);
    expect(camp.level).toBe(1);
  });

  it('construction comes before hauling goods to storage', () => {
    const s = blank();
    noSpawning(s);
    s.colonists = s.colonists.slice(0, 1);
    mainRoad(s);
    const camp = built(s, 'lumber', 52, 51);
    togglePause(s, camp.id);
    camp.out = { timber: 4 };
    const site = build(s, 'habitat', 56, 51);
    assignJobs(s);
    expect(s.colonists[0].job).toMatchObject({ kind: 'haul', to: site.id, dest: 'site' });
  });

  it('materials can come straight from a workplace, not just storage', () => {
    const s = blank();
    noSpawning(s);
    mainRoad(s);
    const mill = built(s, 'sawmill', 52, 51);
    s.stock = {};
    togglePause(s, mill.id);
    mill.out = { planks: 6 };
    const camp = build(s, 'lumber', 56, 51);
    simulate(s, 40);
    expect(camp.level).toBe(1);
    // Storage started empty, so the camp's planks came from the mill.
    expect((mill.out.planks ?? 0) + (s.stock.planks ?? 0)).toBe(6 - BUILDINGS.lumber.levels[0].cost.planks!);
  });
});

describe('workers', () => {
  it('a sawmill only runs with a worker inside', () => {
    const s = blank();
    mainRoad(s);
    const mill = built(s, 'sawmill', 52, 51);
    s.stock = { timber: 20 };
    togglePause(s, mill.id);
    simulate(s, 60);
    expect(s.made.planks ?? 0).toBe(0);
    togglePause(s, mill.id);
    simulate(s, 60);
    expect(mill.worker).toBeDefined();
    expect(s.made.planks ?? 0).toBeGreaterThan(5);
    expect(s.stock.planks ?? 0).toBeGreaterThan(0);
    expect(s.stock.timber!).toBeLessThan(20);
  });

  it('woodcutters fell trees nearby and the timber reaches storage', () => {
    const s = blank();
    mainRoad(s);
    fill(s, 53, 54, 4, 'trees', 100);
    const camp = built(s, 'lumber', 52, 51);
    simulate(s, 120);
    expect(camp.worker).toBeDefined();
    expect(s.trees.filter((t) => t === 100).length).toBeLessThan(16);
    expect(s.stock.timber ?? 0).toBeGreaterThan(0);
  });

  it('quarry workers break up rocks', () => {
    const s = blank();
    mainRoad(s);
    fill(s, 53, 54, 2, 'rocks', 3);
    built(s, 'quarry', 52, 51);
    simulate(s, 120);
    expect(s.rocks.reduce((a, b) => a + b, 0)).toBeLessThan(12);
    expect(s.made.stone ?? 0).toBeGreaterThan(0);
  });

  it('grove keepers plant saplings that grow into trees', () => {
    const s = blank();
    mainRoad(s);
    built(s, 'forester', 52, 51);
    simulate(s, 60);
    const planted = s.trees.filter((t) => t > 0).length;
    expect(planted).toBeGreaterThan(2);
    simulate(s, CONFIG.treeGrowSec + 5);
    expect(s.trees.filter((t) => t === 100).length).toBeGreaterThanOrEqual(planted);
  });

  it('workplaces always leave colonists free to build and carry', () => {
    const s = blank();
    noSpawning(s);
    mainRoad(s);
    startUpgrade(s, hub(s).id);
    speedUp(s, hub(s).id);
    const camps = [52, 56].map((x) => built(s, 'lumber', x, 51));
    const mill = built(s, 'sawmill', 44, 51);
    simulate(s, 30);
    const staffed = [...camps, mill].filter((b) => b.worker != null).length;
    expect(staffed).toBe(s.colonists.length - CONFIG.reserveFree);
  });

  it('a power shortfall slows producers down', () => {
    const run = (solar: boolean) => {
      const s = blank();
      mainRoad(s);
      startUpgrade(s, hub(s).id);
      speedUp(s, hub(s).id);
      built(s, 'sawmill', 52, 51);
      built(s, 'sawmill', 56, 51);
      fill(s, 60, 51, 2, 'terrain', ICE);
      built(s, 'icedrill', 60, 51);
      if (solar) built(s, 'solar', 44, 51);
      s.stock = { timber: 100 };
      simulate(s, 120);
      return { made: s.made.planks ?? 0, ratio: stats(s).powerRatio };
    };
    const low = run(false);
    const ok = run(true);
    expect(low.ratio).toBeLessThan(1);
    expect(ok.ratio).toBe(1);
    expect(ok.made).toBeGreaterThan(low.made);
  });
});

describe('speed-ups and upgrades', () => {
  it('crystals finish a build only when storage has the materials', () => {
    const s = blank();
    s.stock = {};
    const site = build(s, 'habitat', 40, 40);
    expect(speedUpBlocker(s, site)).toMatch(/^Needs \d+ more planks in storage$/);
    expect(speedUp(s, site.id).ok).toBe(false);
    s.stock = { planks: 10, stone: 10 };
    const crystals = s.crystals;
    expect(speedUp(s, site.id).ok).toBe(true);
    expect(site.level).toBe(1);
    expect(s.crystals).toBeLessThan(crystals);
    expect(s.stock).toEqual({ planks: 7, stone: 8 });
  });

  it('upgrades wait for the Command Hub', () => {
    const s = blank();
    const solar = built(s, 'solar', 40, 40);
    expect(startUpgrade(s, solar.id)).toEqual({ ok: false, reason: 'Needs Command Hub level 2' });
    startUpgrade(s, hub(s).id);
    speedUp(s, hub(s).id);
    expect(startUpgrade(s, solar.id).ok).toBe(true);
    expect(solar.site?.toLevel).toBe(2);
  });

  it('a building keeps its old level while the upgrade is built', () => {
    const s = blank();
    mainRoad(s);
    startUpgrade(s, hub(s).id);
    expect(stats(s).storageCap).toBe(BUILDINGS.hub.storage![0]);
    simulate(s, 120);
    expect(hub(s).level).toBe(2);
    expect(stats(s).storageCap).toBe(BUILDINGS.hub.storage![1]);
  });
});

describe('roads', () => {
  it('route around rocks and trees on their own', () => {
    const s = blank();
    fill(s, 45, 40, 1, 'rocks', 5);
    fill(s, 46, 40, 1, 'trees', 100);
    const tiles = planRoad(s, { x: 42, y: 40 }, { x: 50, y: 40 })!;
    expect(tiles).not.toBeNull();
    expect(tiles).not.toContain(idx(s, 45, 40));
    expect(tiles).not.toContain(idx(s, 46, 40));
    expect(tiles[0]).toBe(idx(s, 42, 40));
    expect(tiles[tiles.length - 1]).toBe(idx(s, 50, 40));
  });

  it('cutting a road disconnects buildings', () => {
    const s = blank();
    mainRoad(s);
    const camp = build(s, 'lumber', 56, 51);
    expect(connected(s, camp)).toBe(true);
    removeRoad(s, 51, ROAD_Y);
    expect(connected(s, camp)).toBe(false);
  });

  it('the Command Hub works as a junction between roads on different sides', () => {
    const s = blank();
    const west = build(s, 'lumber', 43, 47);
    const east = build(s, 'habitat', 52, 47);
    expect(connectRoad(s, west.id).ok).toBe(true);
    expect(connectRoad(s, east.id).ok).toBe(true);
    simulate(s, 60);
    expect(west.level).toBe(1);
    expect(east.level).toBe(1);
  });
});

describe('demolish', () => {
  it('returns delivered materials and frees the worker', () => {
    const s = blank();
    mainRoad(s);
    const camp = built(s, 'lumber', 52, 51);
    simulate(s, 20);
    expect(camp.worker).toBeDefined();
    const site = build(s, 'habitat', 56, 51);
    simulate(s, 8);
    const before = (s.stock.planks ?? 0) + (s.stock.stone ?? 0);
    const have = (site.site!.have.planks ?? 0) + (site.site!.have.stone ?? 0);
    expect(demolish(s, site.id).ok).toBe(true);
    expect((s.stock.planks ?? 0) + (s.stock.stone ?? 0)).toBe(before + have);
    expect(demolish(s, camp.id).ok).toBe(true);
    expect(s.colonists.every((c) => c.job?.kind !== 'work')).toBe(true);
    expect(demolish(s, hub(s).id).ok).toBe(false);
    simulate(s, 30);
  });
});

describe('save', () => {
  it('round-trips and rejects old or broken saves', () => {
    const s = createGame(3, T0);
    simulate(s, 30);
    const back = deserialize(serialize(s))!;
    expect(back.buildings.length).toBe(s.buildings.length);
    expect(back.colonists.length).toBe(s.colonists.length);
    expect(back.trees.length).toBe(s.size * s.size);
    expect(deserialize('nope')).toBeNull();
    expect(deserialize(JSON.stringify({ ...back, version: 1 }))).toBeNull();
  });
});
