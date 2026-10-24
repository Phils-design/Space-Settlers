// Balance numbers and building definitions. Everything tunable lives here.

export type Good = 'timber' | 'planks' | 'stone' | 'water' | 'food' | 'ore' | 'steel' | 'lumenite' | 'circuits';

export const GOODS: Good[] = ['planks', 'stone', 'timber', 'water', 'food', 'ore', 'lumenite', 'steel', 'circuits'];

export const GOOD_INFO: Record<Good, { name: string; color: string }> = {
  timber: { name: 'Timber', color: '#a8743f' },
  planks: { name: 'Planks', color: '#e8c17e' },
  stone: { name: 'Stone', color: '#a3acc0' },
  water: { name: 'Water', color: '#6fc8ff' },
  food: { name: 'Food', color: '#6fdc8c' },
  ore: { name: 'Ferrite ore', color: '#d0703f' },
  steel: { name: 'Steel', color: '#c3d2e8' },
  lumenite: { name: 'Lumenite', color: '#b18cff' },
  circuits: { name: 'Circuits', color: '#3fe0c5' },
};

/** A bundle of goods, e.g. a cost or a buffer. */
export type Bag = Partial<Record<Good, number>>;

/** Map tile types. Deposits are endless; trees and rocks live in their own layers. */
export type Terrain = 0 | 1 | 2 | 3;
export const OPEN: Terrain = 0;
export const LUMENITE: Terrain = 1;
export const FERRITE: Terrain = 2;
export const ICE: Terrain = 3;

export type BuildingType =
  | 'hub'
  | 'habitat'
  | 'depot'
  | 'solar'
  | 'lumber'
  | 'quarry'
  | 'sawmill'
  | 'forester'
  | 'icedrill'
  | 'farm'
  | 'mine'
  | 'extractor'
  | 'beacon'
  | 'smelter'
  | 'fabricator';

export type Kind = 'hub' | 'storage' | 'housing' | 'power' | 'gatherer' | 'forester' | 'producer' | 'beacon';

export interface LevelDef {
  /** Materials carriers must bring to the site for this level. */
  cost: Bag;
  /** Seconds of builder work once the materials are there. */
  work: number;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  blurb: string;
  kind: Kind;
  /** Footprint is size x size tiles. */
  size: number;
  /** Command Hub level that unlocks it. */
  unlock: number;
  /** How many you may have, indexed by Command Hub level - 1. */
  maxCount: number[];
  /** levels[0] is level 1. */
  levels: LevelDef[];
  /** Colonists needed to run it. */
  workers?: number;
  /** Producers: goods in and out per cycle, and seconds per cycle at each level. */
  recipe?: { in: Bag; out: Bag; sec: number[] };
  /** Gatherers: walk out to trees or rocks within the radius and bring back n goods a trip. */
  gather?: { node: 'tree' | 'rock'; good: Good; n: number; radius: number[]; sec: number[] };
  /** Foresters: plant saplings within the radius. */
  plant?: { radius: number[]; sec: number[]; maxTrees: number };
  /** Must sit on this deposit (at least two footprint tiles). */
  deposit?: Terrain;
  powerGen?: number[];
  powerUse?: number[];
  population?: number[];
  storage?: number[];
  /** Radius of territory this building claims. */
  territory?: number[];
}

const MAX_LEVEL = 3;

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  hub: {
    type: 'hub',
    name: 'Command Hub',
    blurb: 'Heart of the colony. Stores goods, houses the first colonists and sets your territory.',
    kind: 'hub',
    size: 3,
    unlock: 1,
    maxCount: [1, 1, 1],
    levels: [
      { cost: {}, work: 0 },
      { cost: { planks: 16, stone: 16 }, work: 45 },
      { cost: { planks: 30, stone: 30, ore: 10, lumenite: 6 }, work: 120 },
    ],
    powerGen: [4, 6, 8],
    population: [6, 8, 10],
    storage: [120, 200, 300],
    territory: [18, 25, 34],
  },
  habitat: {
    type: 'habitat',
    name: 'Habitat',
    blurb: 'Houses more colonists. More colonists means more builders, workers and carriers.',
    kind: 'housing',
    size: 2,
    unlock: 1,
    maxCount: [2, 4, 6],
    levels: [
      { cost: { planks: 3, stone: 2 }, work: 15 },
      { cost: { planks: 5, stone: 4 }, work: 30 },
      { cost: { planks: 6, stone: 6, steel: 2 }, work: 60 },
    ],
    population: [4, 7, 10],
  },
  depot: {
    type: 'depot',
    name: 'Storage Depot',
    blurb: 'Raises how many goods the colony can hold, and gives carriers a closer drop-off point.',
    kind: 'storage',
    size: 2,
    unlock: 1,
    maxCount: [1, 2, 3],
    levels: [
      { cost: { planks: 4, stone: 4 }, work: 15 },
      { cost: { planks: 6, stone: 6 }, work: 30 },
      { cost: { planks: 6, stone: 6, steel: 3 }, work: 60 },
    ],
    storage: [150, 250, 400],
  },
  solar: {
    type: 'solar',
    name: 'Solar Array',
    blurb: 'Generates power. Sawmills, drills and smelters slow down without enough.',
    kind: 'power',
    size: 2,
    unlock: 1,
    maxCount: [2, 4, 6],
    levels: [
      { cost: { planks: 2, stone: 2 }, work: 8 },
      { cost: { planks: 3, stone: 3, lumenite: 2 }, work: 20 },
      { cost: { lumenite: 4, steel: 2 }, work: 45 },
    ],
    powerGen: [8, 16, 28],
  },
  lumber: {
    type: 'lumber',
    name: 'Lumber Camp',
    blurb: 'A woodcutter walks out to the glowing trees, fells them and brings back timber.',
    kind: 'gatherer',
    size: 2,
    unlock: 1,
    maxCount: [2, 3, 4],
    levels: [
      { cost: { planks: 2 }, work: 10 },
      { cost: { planks: 4, stone: 2 }, work: 20 },
      { cost: { planks: 6, steel: 1 }, work: 40 },
    ],
    workers: 1,
    gather: { node: 'tree', good: 'timber', n: 2, radius: [7, 8, 9], sec: [5, 4, 3] },
  },
  quarry: {
    type: 'quarry',
    name: 'Quarry',
    blurb: 'A stone cutter breaks up nearby rock outcrops and carries the stone back.',
    kind: 'gatherer',
    size: 2,
    unlock: 1,
    maxCount: [1, 2, 3],
    levels: [
      { cost: { planks: 2 }, work: 10 },
      { cost: { planks: 4, stone: 2 }, work: 20 },
      { cost: { planks: 6, steel: 1 }, work: 40 },
    ],
    workers: 1,
    gather: { node: 'rock', good: 'stone', n: 1, radius: [7, 8, 9], sec: [5, 4, 3] },
  },
  sawmill: {
    type: 'sawmill',
    name: 'Sawmill',
    blurb: 'Saws timber into planks, the main building material.',
    kind: 'producer',
    size: 2,
    unlock: 1,
    maxCount: [1, 2, 2],
    levels: [
      { cost: { planks: 3, stone: 2 }, work: 15 },
      { cost: { planks: 5, stone: 4 }, work: 30 },
      { cost: { planks: 6, stone: 4, steel: 2 }, work: 60 },
    ],
    workers: 1,
    recipe: { in: { timber: 1 }, out: { planks: 1 }, sec: [6, 4.5, 3.5] },
    powerUse: [2, 3, 4],
  },
  forester: {
    type: 'forester',
    name: 'Grove Keeper',
    blurb: 'Plants lantern-tree saplings nearby so your woodcutters never run out.',
    kind: 'forester',
    size: 2,
    unlock: 1,
    maxCount: [1, 2, 3],
    levels: [
      { cost: { planks: 3, stone: 1 }, work: 12 },
      { cost: { planks: 4, stone: 2 }, work: 25 },
      { cost: { planks: 5, stone: 3, steel: 1 }, work: 45 },
    ],
    workers: 1,
    plant: { radius: [6, 7, 8], sec: [4, 3, 2.5], maxTrees: 40 },
  },
  icedrill: {
    type: 'icedrill',
    name: 'Ice Drill',
    blurb: 'Drills pale-blue ice deposits and melts them into water.',
    kind: 'producer',
    size: 2,
    unlock: 2,
    maxCount: [0, 2, 3],
    levels: [
      { cost: { planks: 3, stone: 3 }, work: 15 },
      { cost: { planks: 5, stone: 4 }, work: 30 },
      { cost: { planks: 5, stone: 4, steel: 2 }, work: 60 },
    ],
    workers: 1,
    deposit: ICE,
    recipe: { in: {}, out: { water: 1 }, sec: [5, 4, 3] },
    powerUse: [3, 4, 6],
  },
  farm: {
    type: 'farm',
    name: 'Hydroponics Farm',
    blurb: 'Grows food from water under glass. Miners need food to work.',
    kind: 'producer',
    size: 2,
    unlock: 2,
    maxCount: [0, 2, 3],
    levels: [
      { cost: { planks: 4, stone: 2 }, work: 18 },
      { cost: { planks: 5, stone: 4 }, work: 35 },
      { cost: { planks: 6, stone: 4, steel: 2 }, work: 60 },
    ],
    workers: 1,
    recipe: { in: { water: 1 }, out: { food: 2 }, sec: [8, 6, 4.5] },
    powerUse: [2, 3, 4],
  },
  mine: {
    type: 'mine',
    name: 'Ore Mine',
    blurb: 'Digs ferrite ore from rust-red deposits. The miner eats food while working.',
    kind: 'producer',
    size: 2,
    unlock: 2,
    maxCount: [0, 2, 3],
    levels: [
      { cost: { planks: 4, stone: 4 }, work: 20 },
      { cost: { planks: 6, stone: 5 }, work: 40 },
      { cost: { planks: 6, stone: 6, steel: 2 }, work: 70 },
    ],
    workers: 1,
    deposit: FERRITE,
    recipe: { in: { food: 1 }, out: { ore: 2 }, sec: [8, 6, 4.5] },
    powerUse: [3, 5, 7],
  },
  extractor: {
    type: 'extractor',
    name: 'Lumenite Extractor',
    blurb: 'Harvests glowing lumenite crystal from violet deposits.',
    kind: 'producer',
    size: 2,
    unlock: 2,
    maxCount: [0, 1, 2],
    levels: [
      { cost: { planks: 3, stone: 4 }, work: 18 },
      { cost: { planks: 5, stone: 5 }, work: 35 },
      { cost: { planks: 5, stone: 5, steel: 2 }, work: 60 },
    ],
    workers: 1,
    deposit: LUMENITE,
    recipe: { in: {}, out: { lumenite: 1 }, sec: [7, 5.5, 4.5] },
    powerUse: [4, 6, 8],
  },
  beacon: {
    type: 'beacon',
    name: 'Survey Beacon',
    blurb: 'Claims the land around it, pushing your territory outwards.',
    kind: 'beacon',
    size: 1,
    unlock: 2,
    maxCount: [0, 2, 4],
    levels: [
      { cost: { planks: 3, stone: 5 }, work: 20 },
      { cost: { planks: 4, stone: 6 }, work: 35 },
      { cost: { planks: 4, stone: 6, steel: 2 }, work: 60 },
    ],
    territory: [8, 10, 12],
  },
  smelter: {
    type: 'smelter',
    name: 'Smelter',
    blurb: 'Smelts ferrite ore into steel. Hungry for power.',
    kind: 'producer',
    size: 2,
    unlock: 3,
    maxCount: [0, 0, 2],
    levels: [
      { cost: { planks: 4, stone: 8 }, work: 30 },
      { cost: { planks: 6, stone: 8, steel: 2 }, work: 50 },
      { cost: { planks: 6, stone: 8, steel: 4 }, work: 80 },
    ],
    workers: 1,
    recipe: { in: { ore: 2 }, out: { steel: 1 }, sec: [8, 6.5, 5] },
    powerUse: [6, 9, 12],
  },
  fabricator: {
    type: 'fabricator',
    name: 'Circuit Fab',
    blurb: 'Combines steel and lumenite into circuits for advanced buildings and ships.',
    kind: 'producer',
    size: 2,
    unlock: 3,
    maxCount: [0, 0, 1],
    levels: [
      { cost: { planks: 4, stone: 4, steel: 4 }, work: 40 },
      { cost: { planks: 4, stone: 4, steel: 6 }, work: 60 },
      { cost: { planks: 4, stone: 4, steel: 8, circuits: 2 }, work: 90 },
    ],
    workers: 1,
    recipe: { in: { steel: 1, lumenite: 2 }, out: { circuits: 1 }, sec: [12, 9, 7] },
    powerUse: [5, 8, 11],
  },
};

/** Order buildings appear in the build menu. */
export const BUILDABLE: BuildingType[] = [
  'lumber',
  'quarry',
  'sawmill',
  'forester',
  'habitat',
  'solar',
  'depot',
  'icedrill',
  'farm',
  'mine',
  'extractor',
  'beacon',
  'smelter',
  'fabricator',
];

export const CONFIG = {
  mapSize: 96,
  maxHubLevel: MAX_LEVEL,
  startStock: { planks: 24, stone: 14, food: 8 } as Bag,
  startColonists: 4,
  startCrystals: 50,
  colonistSpawnSec: 4,
  /** Tiles per second on roads, and off-road for gatherers. */
  roadSpeed: 2.4,
  offRoadSpeed: 1.7,
  /** Goods a colonist carries per trip. */
  carryMax: 3,
  /** Output a workplace holds before it stops and waits for carriers. */
  outCap: 6,
  /** Input a producer keeps on hand, in cycles' worth. */
  inCycles: 3,
  /** Seconds for a sapling to grow into a tree that can be felled. */
  treeGrowSec: 90,
  /** Builders give up on a site after this long with nothing to work with. */
  builderPatienceSec: 6,
  /** Idle colonists walk back to storage after this long. */
  idleReturnSec: 5,
  /** Workplaces won't take the last few colonists, so someone is always left to build and carry... */
  reserveFree: 2,
  /** ...and as the colony grows, it keeps about this many carriers per worker. */
  carriersPerWorker: 0.5,
  /** Gatherers rest this long inside between trips. */
  gatherRestSec: 1,
  /** How often idle colonists are handed new jobs, in seconds. */
  jobTickSec: 0.5,
  /** Crystal price: one crystal per this many seconds of builder work left (minimum 1). */
  speedUpSecPerCrystal: 20,
  /** Longest offline gap we simulate when the game reopens. */
  maxCatchUpSec: 600,
  /** Longest road the road tool will plan in one go. */
  maxRoadTiles: 80,
};
