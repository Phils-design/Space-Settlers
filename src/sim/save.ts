import { SAVE_VERSION, type GameState } from './state';

export const SAVE_KEY = 'terraform-wars.save.v1';

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function deserialize(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as GameState;
    if (s.version !== SAVE_VERSION || !Array.isArray(s.buildings) || !Array.isArray(s.terrain)) return null;
    return s;
  } catch {
    return null;
  }
}
