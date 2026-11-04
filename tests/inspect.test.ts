import { describe, expect, it } from 'vitest';
import { CONFIG, OPEN } from '../src/sim/config';
import { tileInfo } from '../src/sim/inspect';
import { createGame } from '../src/sim/state';

describe('long-press inspector', () => {
  const s = createGame(1, 0);
  const at = (pred: (i: number) => boolean) => {
    const i = s.terrain.findIndex((_, j) => pred(j));
    return { x: i % s.size, y: Math.floor(i / s.size), i };
  };

  it('shows stone left in a rock and its outcrop', () => {
    const r = at((i) => s.rocks[i] > 0);
    const info = tileInfo(s, r.x, r.y)!;
    expect(info.title).toBe('Rock outcrop');
    expect(info.lines[0]).toBe(`${s.rocks[r.i]} stone left in this rock`);
    s.rocks[r.i] = 1;
    expect(tileInfo(s, r.x, r.y)!.lines[0]).toBe('1 stone left in this rock');
  });

  it('shows grown trees and saplings', () => {
    const t = at((i) => s.trees[i] >= 100);
    expect(tileInfo(s, t.x, t.y)!.lines[0]).toMatch(/Ready to fell/);
    s.trees[t.i] = 50;
    expect(tileInfo(s, t.x, t.y)!.lines[0]).toBe(`Sapling 50% grown, ready in about ${Math.ceil(CONFIG.treeGrowSec / 2)}s`);
  });

  it('says deposits never run out, and open ground has nothing', () => {
    const d = at((i) => s.terrain[i] !== OPEN);
    expect(tileInfo(s, d.x, d.y)!.lines[0]).toMatch(/Never runs out/);
    const g = at((i) => s.terrain[i] === OPEN && !s.trees[i] && !s.rocks[i]);
    expect(tileInfo(s, g.x, g.y)).toBeNull();
  });
});
