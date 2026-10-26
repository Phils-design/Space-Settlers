import { BUILDINGS, CONFIG, type Bag, type BuildingType, type Good, type Terrain } from './config';
import { generateMap } from './map';

export const SAVE_VERSION = 2;

export interface Point {
  x: number;
  y: number;
}

/** A point on a walk. Road tiles carry their index so we know where the colonist is on the network. */
export interface Waypoint extends Point {
  tile?: number;
}

/** A building, or a building level, under construction. */
export interface Site {
  toLevel: number;
  /** Materials the site needs in total. */
  need: Bag;
  /** Materials carriers have dropped off. */
  have: Bag;
  /** Materials on their way. */
  incoming: Bag;
  /** Seconds of builder work done, and needed. */
  work: number;
  total: number;
  builder?: number;
}

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  /** Finished level. 0 while the first build is underway. */
  level: number;
  site?: Site;
  /** The colonist assigned to work here. */
  worker?: number;
  paused?: boolean;
  /** Producers: input goods on hand, and on their way. */
  inv: Bag;
  incoming: Bag;
  /** Goods made here, waiting for carriers. */
  out: Bag;
  /** Output already promised to a carrier. */
  outReserved: Bag;
  /** Producers: progress through the current cycle, 0..1. Above 0 means the inputs are used up. */
  progress: number;
}

export type HaulDest = 'site' | 'input' | 'store';

export type Job =
  | { kind: 'build'; site: number; stage: 'go' | 'work'; wait: number }
  | {
      kind: 'haul';
      from: number;
      to: number;
      good: Good;
      n: number;
      stage: 'pickup' | 'deliver';
      /** Picking up from the shared stock in a storage building, rather than a building's output. */
      fromStore: boolean;
      dest: HaulDest;
      /** For site deliveries: the level being built, so a finished site can't be filled twice. */
      siteLevel: number;
    }
  | { kind: 'work'; at: number; stage: 'go' | 'inside' | 'out' | 'harvest' | 'back'; node: number; timer: number }
  | { kind: 'home'; to: number };

export interface Colonist {
  id: number;
  /** Position in tile units (tile centres are at n + 0.5). */
  x: number;
  y: number;
  /** Road tile the colonist is on, or -1. */
  tile: number;
  /** Building the colonist is inside (and hidden in). */
  inside?: number;
  path: Waypoint[];
  offRoad: boolean;
  job?: Job;
  carry?: { good: Good; n: number };
  /** Seconds spent standing around outside. */
  idle: number;
}

export interface GameState {
  version: number;
  seed: number;
  size: number;
  /** Epoch ms of the last simulated moment. */
  time: number;
  /** Shared stock in storage buildings, and the part promised to carriers. */
  stock: Bag;
  reserved: Bag;
  /** Goods on their way to storage. */
  toStore: Bag;
  crystals: number;
  terrain: Terrain[];
  /** 0 = no tree, 1..99 = sapling growing, 100 = grown. */
  trees: number[];
  /** Stone left in a rock outcrop, 0 = none. */
  rocks: number[];
  roads: number[];
  buildings: Building[];
  colonists: Colonist[];
  nextId: number;
  spawnTimer: number;
  jobTimer: number;
  natureTimer: number;
  /** Bumped whenever roads, buildings or trees and rocks change, so caches and the renderer know. */
  roadsRev: number;
  buildingsRev: number;
  natureRev: number;
  /** Total goods made, for goals. */
  made: Bag;
}

export function createGame(seed: number, now: number): GameState {
  const size = CONFIG.mapSize;
  const hx = Math.floor(size / 2) - 1;
  const hy = Math.floor(size / 2) - 1;
  const map = generateMap(seed, size, { x: hx, y: hy, size: BUILDINGS.hub.size });
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    size,
    time: now,
    stock: { ...CONFIG.startStock },
    reserved: {},
    toStore: {},
    crystals: CONFIG.startCrystals,
    terrain: map.terrain,
    trees: map.trees,
    rocks: map.rocks,
    roads: new Array(size * size).fill(0),
    buildings: [],
    colonists: [],
    nextId: 1,
    spawnTimer: 0,
    jobTimer: 0,
    natureTimer: 0,
    roadsRev: 0,
    buildingsRev: 0,
    natureRev: 0,
    made: {},
  };
  const h = newBuilding(s, 'hub', hx, hy);
  h.level = 1;
  for (let i = 0; i < CONFIG.startColonists; i++) addColonist(s, h);
  return s;
}

export function newBuilding(s: GameState, type: BuildingType, x: number, y: number): Building {
  const b: Building = { id: s.nextId++, type, x, y, level: 0, inv: {}, incoming: {}, out: {}, outReserved: {}, progress: 0 };
  s.buildings.push(b);
  s.buildingsRev++;
  return b;
}

/** A new colonist, waiting inside a building. */
export function addColonist(s: GameState, at: Building): Colonist {
  const n = BUILDINGS[at.type].size;
  const c: Colonist = { id: s.nextId++, x: at.x + n / 2, y: at.y + n / 2, tile: -1, inside: at.id, path: [], offRoad: false, idle: 0 };
  s.colonists.push(c);
  return c;
}

export const idx = (s: GameState, x: number, y: number) => y * s.size + x;
export const inBounds = (s: GameState, x: number, y: number) => x >= 0 && y >= 0 && x < s.size && y < s.size;
export const hub = (s: GameState) => s.buildings.find((b) => b.type === 'hub')!;
export const byId = (s: GameState, id: number | undefined) => (id == null ? undefined : s.buildings.find((b) => b.id === id));
export const colonistById = (s: GameState, id: number | undefined) => (id == null ? undefined : s.colonists.find((c) => c.id === id));
