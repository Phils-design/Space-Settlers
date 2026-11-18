import type { Bag, Good } from './config';

// Small helpers for bundles of goods. Empty entries are deleted so saves stay small.

export const get = (b: Bag, g: Good) => b[g] ?? 0;

export function add(b: Bag, g: Good, n: number) {
  const v = (b[g] ?? 0) + n;
  if (Math.abs(v) < 1e-9) delete b[g];
  else b[g] = v;
}

export const total = (b: Bag) => Object.values(b).reduce<number>((a, v) => a + (v ?? 0), 0);

/** Goods with a positive amount, in a stable order. */
export const entries = (b: Bag) => (Object.entries(b) as [Good, number][]).filter(([, v]) => v > 0);

export const goodsOf = (b: Bag) => entries(b).map(([g]) => g);
