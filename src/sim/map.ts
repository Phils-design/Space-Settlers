import { FERRITE, ICE, LUMENITE, OPEN, type Terrain } from './config';

export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface MapLayers {
  terrain: Terrain[];
  trees: number[];
  rocks: number[];
}

/**
 * Lays out the world around a clear patch where the Command Hub sits.
 * A ring close to the hub always has a forest, rocks and one deposit of each kind,
 * so every colony can get started. More of everything is scattered further out.
 */
export function generateMap(seed: number, size: number, hub: { x: number; y: number; size: number }): MapLayers {
  const r = rng(seed);
  const n = size * size;
  const terrain: Terrain[] = new Array(n).fill(OPEN);
  const trees: number[] = new Array(n).fill(0);
  const rocks: number[] = new Array(n).fill(0);
  const cx = hub.x + hub.size / 2;
  const cy = hub.y + hub.size / 2;
  const fromHub = (x: number, y: number) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy);

  /** Calls fn for tiles in a ragged disc: a solid core and a patchy rim. */
  const blob = (px: number, py: number, rad: number, density: number, fn: (i: number) => void) => {
    for (let y = Math.floor(py - rad); y <= Math.ceil(py + rad); y++) {
      for (let x = Math.floor(px - rad); x <= Math.ceil(px + rad); x++) {
        if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
        if (fromHub(x, y) < 4.5) continue;
        const k = Math.hypot(x + 0.5 - px, y + 0.5 - py);
        if (k <= rad * 0.55 || (k <= rad && r() < density)) fn(y * size + x);
      }
    }
  };
  const deposit = (t: Terrain, px: number, py: number, rad: number) =>
    blob(px, py, rad, 0.55, (i) => {
      if (terrain[i] === OPEN) terrain[i] = t;
    });
  const outcrop = (px: number, py: number, rad: number) =>
    blob(px, py, rad, 0.45, (i) => {
      if (terrain[i] === OPEN && !rocks[i]) rocks[i] = 6 + Math.floor(r() * 7);
    });
  const forest = (px: number, py: number, rad: number, density: number) =>
    blob(px, py, rad, density, (i) => {
      if (terrain[i] === OPEN && !rocks[i] && r() < 0.85) trees[i] = 100;
    });

  // The starter ring: nine features spread evenly around the hub, in shuffled order.
  type Feature = { deposit: boolean; place: (a: number) => void };
  const ringPoint = (a: number, d: number) => [cx + Math.cos(a) * d, cy + Math.sin(a) * d] as const;
  const starters: Feature[] = [
    { deposit: true, place: (a) => deposit(ICE, ...ringPoint(a, 11 + r() * 3), 2.3) },
    { deposit: true, place: (a) => deposit(LUMENITE, ...ringPoint(a, 12 + r() * 3), 2.2) },
    { deposit: true, place: (a) => deposit(FERRITE, ...ringPoint(a, 13 + r() * 3), 2.4) },
    { deposit: false, place: (a) => outcrop(...ringPoint(a, 7.5), 2.2) },
    { deposit: false, place: (a) => outcrop(...ringPoint(a, 8.5), 1.9) },
    { deposit: false, place: (a) => outcrop(...ringPoint(a, 10.5), 1.7) },
    { deposit: false, place: (a) => forest(...ringPoint(a, 9.5), 4.6, 0.75) },
    { deposit: false, place: (a) => forest(...ringPoint(a, 10), 4.2, 0.75) },
    { deposit: false, place: (a) => forest(...ringPoint(a, 9), 3.6, 0.7) },
  ];
  for (let i = starters.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [starters[i], starters[j]] = [starters[j], starters[i]];
  }
  const turn = r() * Math.PI * 2;
  const ring = starters.map((f, i) => ({ ...f, a: turn + (i / starters.length) * Math.PI * 2 + (r() - 0.5) * 0.3 }));
  // Deposits first so trees and rocks never cover them.
  for (const f of ring) if (f.deposit) f.place(f.a);
  for (const f of ring) if (!f.deposit) f.place(f.a);

  // Further out: more deposits, outcrops and forests.
  const far = (min: number, max: number) => {
    const a = r() * Math.PI * 2;
    const d = min + r() * (max - min);
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
  };
  for (const t of [ICE, LUMENITE, FERRITE, ICE, LUMENITE, FERRITE, LUMENITE, FERRITE]) {
    const p = far(20, 44);
    deposit(t, p.x, p.y, 2 + r() * 1.2);
  }
  for (let i = 0; i < 34; i++) {
    const p = far(13, 46);
    outcrop(p.x, p.y, 1.3 + r() * 1.5);
  }
  for (let i = 0; i < 42; i++) {
    const p = far(13, 47);
    forest(p.x, p.y, 2.5 + r() * 3, 0.55);
  }
  return { terrain, trees, rocks };
}
