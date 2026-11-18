import { describe, expect, it } from 'vitest';
import { BUILDINGS, type BuildingType } from '../src/sim/config';
import { bestSpot, placeBuilding, simulate, startUpgrade, stats } from '../src/sim/game';
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
