import { BUILDINGS, CONFIG, type BuildingType } from './config';
import { generateTerrain } from './map';

export const SAVE_VERSION = 1;

/** 0 = open ground, 1 = crystal deposit, 2 = rock (blocked). */
export type Terrain = 0 | 1 | 2;
export const OPEN: Terrain = 0;
export const DEPOSIT: Terrain = 1;
export const ROCK: Terrain = 2;

export interface Pending {
  toLevel: number;
  /** Epoch milliseconds. Absolute times so a server can own them later. */
  startAt: number;
  endAt: number;
}

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  /** Finished level. 0 while the first build is still running. */
  level: number;
  pending?: Pending;
  /** Extractors: ore waiting to be collected. */
  buffer: number;
  /** Extractors: ore already promised to a colonist on the way. */
  reserved: number;
}

export type ColonistTask = 'idle' | 'toPickup' | 'toDeliver';

export interface Point {
  x: number;
  y: number;
}

export interface Colonist {
  id: number;
  /** Position in tile units (tile centres are at n + 0.5). */
  x: number;
  y: number;
  task: ColonistTask;
  path: Point[];
  carry: number;
  /** Building the colonist is standing at when idle. */
  at: number;
  pickupFrom?: number;
  pickupAmount?: number;
  deliverTo?: number;
}

export interface GameState {
  version: number;
  seed: number;
  size: number;
  /** Epoch ms of the last simulated moment. */
  time: number;
  ore: number;
  crystals: number;
  terrain: Terrain[];
  roads: number[];
  buildings: Building[];
  colonists: Colonist[];
  nextId: number;
  spawnTimer: number;
  /** Total ore colonists have delivered, for goals. */
  delivered: number;
}

export function createGame(seed: number, now: number): GameState {
  const size = CONFIG.mapSize;
  const hubX = Math.floor(size / 2) - 1;
  const hubY = Math.floor(size / 2) - 1;
  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    size,
    time: now,
    ore: CONFIG.startOre,
    crystals: CONFIG.startCrystals,
    terrain: generateTerrain(seed, size, { x: hubX, y: hubY, size: BUILDINGS.hub.size }),
    roads: new Array(size * size).fill(0),
    buildings: [],
    colonists: [],
    nextId: 1,
    spawnTimer: 0,
    delivered: 0,
  };
  state.buildings.push({ id: state.nextId++, type: 'hub', x: hubX, y: hubY, level: 1, buffer: 0, reserved: 0 });
  return state;
}

export const idx = (s: GameState, x: number, y: number) => y * s.size + x;
export const inBounds = (s: GameState, x: number, y: number) => x >= 0 && y >= 0 && x < s.size && y < s.size;
export const hub = (s: GameState) => s.buildings.find((b) => b.type === 'hub')!;
export const byId = (s: GameState, id: number | undefined) => s.buildings.find((b) => b.id === id);
