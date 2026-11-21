import { describe, expect, it } from 'vitest';
import { total } from '../src/sim/bag';
import { BUILDABLE, BUILDINGS, CONFIG, type Bag, type BuildingType } from '../src/sim/config';
import { bestSpot, countOf, maxCountOf, placeBuilding, simulate, speedUp, startUpgrade, stats } from '../src/sim/game';
import { connectRoad } from '../src/sim/roads';
import { createGame, hub, type GameState } from '../src/sim/state';

/**
 * A scripted player that follows the goals using only the actions a real player has,
 * on a real generated map. It checks the whole chain works end to end and logs how long
 * each step takes, which is useful for balancing.
 */
type Step = BuildingType | 'hub';

const PLAN: Step[] = [
  'lumber',
  'quarry',
  'sawmill',
  'forester',
  'habitat',
  'lumber',
  'hub',
  'solar',
  'icedrill',
  'farm',
  'mine',
  'extractor',
  'habitat',
  'quarry',
  'forester',
  'solar',
  'depot',
  'hub',
  'habitat',
  'smelter',
  'solar',
  'fabricator',
];

function play(seed: number) {
  const s = createGame(seed, 0);
  const h = hub(s);
  const near = { x: h.x + 1.5, y: h.y + 1.5 };
  let t = 0;
  const timeline: string[] = [];
  const run = (sec: number) => {
    simulate(s, sec);
    t += sec;
  };
  const waitFor = (done: (s: GameState) => boolean, limit: number) => {
    const start = t;
    while (!done(s) && t - start < limit) run(5);
    return done(s);
  };
  const mins = () => (t / 60).toFixed(1);

  for (const step of PLAN) {
    if (step === 'hub') {
      const target = hub(s).level + 1;
      // A player saves up first: wait until the materials are mostly in stock.
      const r = startUpgrade(s, h.id);
      if (!r.ok) throw new Error(`hub upgrade: ${r.reason}`);
      const ok = waitFor(() => hub(s).level >= target, 1500);
      timeline.push(`${mins()} min  Command Hub level ${target}${ok ? '' : ' (TIMED OUT)'}`);
      if (!ok) return { s, t, timeline, ok: false };
      continue;
    }
    const spot = bestSpot(s, step, near);
    if (!spot) throw new Error(`no spot for ${step}`);
    const r = placeBuilding(s, step, spot.x, spot.y);
    if (!r.ok) throw new Error(`place ${step}: ${r.reason}`);
    const road = connectRoad(s, r.id!);
    if (!road.ok && road.reason !== 'Already connected') throw new Error(`road for ${step}: ${road.reason}`);
    const b = s.buildings.find((x) => x.id === r.id)!;
    const ok = waitFor(() => b.level >= 1, 900);
    timeline.push(`${mins()} min  ${BUILDINGS[step].name}${ok ? '' : ' (TIMED OUT)'}`);
    if (!ok) return { s, t, timeline, ok: false };
  }
  const ok = waitFor((x) => (x.made.circuits ?? 0) >= 1, 1200);
  timeline.push(`${mins()} min  first circuit${ok ? '' : ' (TIMED OUT)'}`);
  return { s, t, timeline, ok };
}

describe('play-through', () => {
  it('a scripted player reaches Command Hub 3 and makes circuits', () => {
    const { s, t, timeline, ok } = play(1);
    const st = stats(s);
    console.log(
      [
        ...timeline,
        `colonists ${st.colonists} (free ${st.free}, workers ${st.workers}), power ${st.powerGen}/${st.powerUse}`,
        `stock ${JSON.stringify(s.stock)}`,
        `made ${JSON.stringify(s.made)}`,
      ].join('\n'),
    );
    expect(ok).toBe(true);
    expect(hub(s).level).toBe(3);
    expect(t / 60).toBeLessThan(120);
  }, 120_000);

  it('works on other maps too', () => {
    for (const seed of [2, 7, 42, 1234]) {
      const { ok, timeline } = play(seed);
      expect(ok, `seed ${seed}:\n${timeline.join('\n')}`).toBe(true);
    }
  }, 120_000);
});

/** A colony at the top end: Command Hub 3, every building allowed, all at level 3. Built instantly with crystals. */
function fullColony(seed: number) {
  const s = createGame(seed, 0);
  const h = hub(s);
  const near = { x: h.x + 1.5, y: h.y + 1.5 };
  const materials: Bag = { planks: 100, stone: 100, steel: 100, lumenite: 100, ore: 100, circuits: 100 };
  const finish = (id: number) => {
    s.stock = { ...materials };
    s.crystals = 1e6;
    expect(speedUp(s, id)).toEqual({ ok: true });
  };
  for (let level = 2; level <= 3; level++) {
    startUpgrade(s, h.id);
    finish(h.id);
  }
  for (const type of BUILDABLE) {
    while (countOf(s, type) < maxCountOf(s, type)) {
      const spot = bestSpot(s, type, near);
      if (!spot) break;
      const r = placeBuilding(s, type, spot.x, spot.y);
      expect(r.ok).toBe(true);
      connectRoad(s, r.id!);
      finish(r.id!);
    }
  }
  for (const b of s.buildings) while (startUpgrade(s, b.id).ok) finish(b.id);
  s.stock = { planks: 60, stone: 60 };
  return s;
}

describe('late game', () => {
  it('a full colony has carriers to spare, so workplaces rarely wait on them', () => {
    for (const seed of [7, 1234]) {
      const s = fullColony(seed);
      expect(stats(s).popCap).toBe(70);
      // Let the colonists arrive and the colony settle.
      simulate(s, 360);
      let free = 0;
      let waiting = 0;
      let samples = 0;
      for (let t = 0; t < 240; t += 2) {
        simulate(s, 2);
        free += stats(s).free;
        waiting += s.buildings.filter((b) => BUILDINGS[b.type].workers && total(b.out) >= CONFIG.outCap).length;
        samples++;
      }
      console.log(`seed ${seed}: on average ${(free / samples).toFixed(1)} colonists free, ${(waiting / samples).toFixed(1)} workplaces waiting for carriers`);
      expect(stats(s).colonists).toBe(70);
      expect(free / samples, `seed ${seed}`).toBeGreaterThan(8);
      expect(waiting / samples, `seed ${seed}`).toBeLessThan(2);
    }
  }, 120_000);
});
