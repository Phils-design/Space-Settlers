import { describe, expect, it } from 'vitest';
import { BUILDINGS, CONFIG } from '../src/sim/config';
import { advance, buildRoadLine, canPlace, lTiles, placeBuilding, speedUp, startUpgrade, stats } from '../src/sim/game';
import { connectedToHub, isConnected, roadPath } from '../src/sim/path';
import { createGame, DEPOSIT, hub, idx, OPEN, type GameState } from '../src/sim/state';
import { deserialize, serialize } from '../src/sim/save';

const T0 = 1_000_000;

/** A blank, rock-free map so tests control the layout. */
function blank(): GameState {
  const s = createGame(1, T0);
  s.terrain = s.terrain.map(() => OPEN);
  s.ore = 10_000;
  return s;
}

function setDeposit(s: GameState, x: number, y: number, n = 2) {
  for (let j = y; j < y + n; j++) for (let i = x; i < x + n; i++) s.terrain[idx(s, i, j)] = DEPOSIT;
}

describe('map', () => {
  it('generates deposits and keeps the hub area clear', () => {
    const s = createGame(42, T0);
    expect(s.terrain.filter((t) => t === DEPOSIT).length).toBeGreaterThan(8);
    const h = hub(s);
    for (let y = h.y; y < h.y + 3; y++) for (let x = h.x; x < h.x + 3; x++) expect(s.terrain[idx(s, x, y)]).toBe(OPEN);
  });
});

describe('placement', () => {
  it('extractors need a deposit, other buildings must avoid one', () => {
    const s = blank();
    setDeposit(s, 2, 2);
    expect(canPlace(s, 'extractor', 2, 2).ok).toBe(true);
    expect(canPlace(s, 'extractor', 6, 6).ok).toBe(false);
    expect(canPlace(s, 'solar', 2, 2).ok).toBe(false);
    expect(canPlace(s, 'solar', 6, 6).ok).toBe(true);
  });

  it('blocks overlap with the hub and enforces count limits', () => {
    const s = blank();
    const h = hub(s);
    expect(placeBuilding(s, 'solar', h.x, h.y, T0).ok).toBe(false);
    expect(placeBuilding(s, 'solar', 0, 0, T0).ok).toBe(true);
    s.buildings.forEach((b) => (b.pending = undefined));
    expect(placeBuilding(s, 'solar', 3, 0, T0).ok).toBe(true);
    s.buildings.forEach((b) => (b.pending = undefined));
    const third = placeBuilding(s, 'solar', 6, 0, T0);
    expect(third.ok).toBe(false);
  });

  it('only two builder drones work at once', () => {
    const s = blank();
    expect(placeBuilding(s, 'solar', 0, 0, T0).ok).toBe(true);
    expect(placeBuilding(s, 'habitat', 3, 0, T0).ok).toBe(true);
    const r = placeBuilding(s, 'storage', 6, 0, T0);
    expect(r.ok).toBe(false);
  });
});

describe('timers', () => {
  it('finishes a build at its absolute end time', () => {
    const s = blank();
    placeBuilding(s, 'solar', 0, 0, T0);
    const b = s.buildings.find((x) => x.type === 'solar')!;
    advance(s, T0 + 4_000);
    expect(b.level).toBe(0);
    advance(s, T0 + BUILDINGS.solar.levels[0].buildSec * 1000 + 1);
    expect(b.level).toBe(1);
  });

  it('upgrades are capped by Command Hub level', () => {
    const s = blank();
    placeBuilding(s, 'solar', 0, 0, T0);
    advance(s, T0 + 60_000);
    const solar = s.buildings.find((x) => x.type === 'solar')!;
    expect(startUpgrade(s, solar.id, s.time).ok).toBe(false);
    expect(startUpgrade(s, hub(s).id, s.time).ok).toBe(true);
    expect(speedUp(s, hub(s).id, s.time).ok).toBe(true);
    expect(hub(s).level).toBe(2);
    expect(startUpgrade(s, solar.id, s.time).ok).toBe(true);
  });

  it('speed-up spends crystals', () => {
    const s = blank();
    placeBuilding(s, 'storage', 0, 0, T0);
    const before = s.crystals;
    const st = s.buildings.find((x) => x.type === 'storage')!;
    expect(speedUp(s, st.id, T0).ok).toBe(true);
    expect(st.level).toBe(1);
    expect(s.crystals).toBeLessThan(before);
  });
});

describe('roads and hauling', () => {
  it('lays an L-shaped road', () => {
    expect(lTiles({ x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  it('colonists carry ore from a connected extractor to the hub', () => {
    const s = blank();
    const h = hub(s);
    // Extractor bottom edge lines up with the hub's, so one straight road serves both.
    setDeposit(s, h.x + 6, h.y + 1);
    expect(placeBuilding(s, 'extractor', h.x + 6, h.y + 1, T0).ok).toBe(true);
    const ex = s.buildings.find((b) => b.type === 'extractor')!;
    speedUp(s, ex.id, T0);
    expect(isConnected(s, ex)).toBe(false);
    // Road along the row just below both buildings.
    expect(buildRoadLine(s, { x: h.x, y: h.y + 3 }, { x: h.x + 7, y: h.y + 3 }).ok).toBe(true);
    expect(isConnected(s, ex, connectedToHub(s))).toBe(true);
    expect(roadPath(s, h, ex)).not.toBeNull();

    s.ore = 100; // below the hub's storage cap
    const oreBefore = s.ore;
    advance(s, T0 + 90_000);
    expect(s.colonists.length).toBeGreaterThan(0);
    expect(s.ore).toBeGreaterThan(oreBefore);
  });

  it('no road means no deliveries', () => {
    const s = blank();
    const h = hub(s);
    setDeposit(s, h.x + 6, h.y);
    placeBuilding(s, 'extractor', h.x + 6, h.y, T0);
    speedUp(s, s.buildings[1].id, T0);
    s.ore = 100;
    const oreBefore = s.ore;
    advance(s, T0 + 90_000);
    expect(s.ore).toBe(oreBefore);
  });

  it('power shortfall slows extraction', () => {
    const s = blank();
    expect(stats(s).powerRatio).toBe(1);
    setDeposit(s, 0, 0);
    setDeposit(s, 4, 0);
    placeBuilding(s, 'extractor', 0, 0, T0);
    placeBuilding(s, 'extractor', 4, 0, T0);
    s.buildings.forEach((b) => (b.pending = undefined, (b.level = Math.max(1, b.level))));
    expect(stats(s).powerRatio).toBeLessThan(1);
  });
});

describe('save', () => {
  it('round-trips and rejects junk', () => {
    const s = blank();
    placeBuilding(s, 'solar', 0, 0, T0);
    const back = deserialize(serialize(s))!;
    expect(back.buildings.length).toBe(2);
    expect(deserialize('nope')).toBeNull();
    expect(deserialize(JSON.stringify({ version: 99 }))).toBeNull();
    expect(CONFIG.mapSize).toBe(back.size);
  });
});
