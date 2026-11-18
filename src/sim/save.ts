import { SAVE_VERSION, type GameState } from './state';

export const SAVE_KEY = 'terraform-wars.save.v2';
/** Phase 0 saves can't be carried over; they are cleared on load. */
export const OLD_SAVE_KEYS = ['terraform-wars.save.v1'];

export function serialize(s: GameState): string {
  // Growing saplings don't need their decimals.
  return JSON.stringify({ ...s, trees: s.trees.map((t) => Math.round(t)) });
}

export function deserialize(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as GameState;
    if (s.version !== SAVE_VERSION || !Array.isArray(s.buildings) || !Array.isArray(s.terrain) || !Array.isArray(s.trees)) return null;
    return s;
  } catch {
    return null;
  }
}
