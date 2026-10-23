import type { Terrain } from './state';

export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Lays out crystal deposits and rocks around a clear centre where the hub sits. */
export function generateTerrain(seed: number, size: number, hub: { x: number; y: number; size: number }): Terrain[] {
  const r = rng(seed);
  const t: Terrain[] = new Array(size * size).fill(0);
  const cx = hub.x + hub.size / 2;
  const cy = hub.y + hub.size / 2;
  const clear = (x: number, y: number, margin: number) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < margin;

  // Four deposits, one per quadrant, 6 to 10 tiles out.
  const deposits = 4;
  for (let i = 0; i < deposits; i++) {
    const a = (i / deposits) * Math.PI * 2 + Math.PI / 4 + (r() - 0.5) * 0.6;
    const d = 6 + r() * 4;
    const px = Math.round(cx + Math.cos(a) * d);
    const py = Math.round(cy + Math.sin(a) * d);
    for (let y = py - 2; y <= py + 2; y++) {
      for (let x = px - 2; x <= px + 2; x++) {
        if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
        const k = Math.hypot(x - px, y - py);
        if (k <= 1.2 || (k <= 2.3 && r() < 0.45)) t[y * size + x] = 1;
      }
    }
  }

  // Scattered rocks, never near the hub.
  for (let i = 0; i < size * 0.9; i++) {
    const x = Math.floor(r() * size);
    const y = Math.floor(r() * size);
    if (clear(x, y, 5) || t[y * size + x] !== 0) continue;
    t[y * size + x] = 2;
  }
  return t;
}
