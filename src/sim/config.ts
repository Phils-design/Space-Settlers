// Balance numbers for the phase 0 prototype. Everything tunable lives here.

export type BuildingType = 'hub' | 'solar' | 'habitat' | 'extractor' | 'storage';

export interface LevelDef {
  /** Ore needed to build (level 1) or upgrade to this level. */
  cost: number;
  /** Seconds the build or upgrade takes. */
  buildSec: number;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  blurb: string;
  /** Footprint is size x size tiles. */
  size: number;
  /** levels[0] is level 1. */
  levels: LevelDef[];
  /** Max number of this building allowed at each Command Hub level (index 0 = Hub level 1). */
  maxCount: number[];
  powerGen?: number[];
  powerUse?: number[];
  population?: number[];
  storage?: number[];
  /** Ore per second at full power. */
  oreRate?: number[];
  /** Ore an extractor holds before colonists collect it. */
  buffer?: number[];
  /** Extractors must sit on crystal deposits. */
  needsDeposit?: boolean;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  hub: {
    type: 'hub',
    name: 'Command Hub',
    blurb: 'The heart of the colony. Its level caps every other building.',
    size: 3,
    levels: [
      { cost: 0, buildSec: 0 },
      { cost: 400, buildSec: 60 },
      { cost: 1200, buildSec: 300 },
    ],
    maxCount: [1, 1, 1],
    powerGen: [5, 8, 12],
    population: [2, 3, 4],
    storage: [400, 700, 1000],
  },
  solar: {
    type: 'solar',
    name: 'Solar Array',
    blurb: 'Generates power. Extractors and habitats need it.',
    size: 2,
    levels: [
      { cost: 60, buildSec: 5 },
      { cost: 150, buildSec: 30 },
      { cost: 400, buildSec: 120 },
    ],
    maxCount: [2, 4, 6],
    powerGen: [10, 22, 40],
  },
  habitat: {
    type: 'habitat',
    name: 'Habitat',
    blurb: 'Houses colonists. More colonists means more hauling.',
    size: 2,
    levels: [
      { cost: 80, buildSec: 8 },
      { cost: 200, buildSec: 45 },
      { cost: 500, buildSec: 180 },
    ],
    maxCount: [2, 3, 5],
    powerUse: [2, 3, 4],
    population: [3, 6, 10],
  },
  extractor: {
    type: 'extractor',
    name: 'Ore Extractor',
    blurb: 'Drills crystal ore. Must sit on a crystal deposit and be linked by road.',
    size: 2,
    levels: [
      { cost: 100, buildSec: 10 },
      { cost: 250, buildSec: 60 },
      { cost: 600, buildSec: 240 },
    ],
    maxCount: [2, 3, 4],
    powerUse: [4, 7, 11],
    oreRate: [0.5, 0.9, 1.4],
    buffer: [20, 30, 45],
    needsDeposit: true,
  },
  storage: {
    type: 'storage',
    name: 'Storage Depot',
    blurb: 'Raises how much ore the colony can hold. Colonists deliver here.',
    size: 2,
    levels: [
      { cost: 120, buildSec: 12 },
      { cost: 300, buildSec: 60 },
      { cost: 700, buildSec: 240 },
    ],
    maxCount: [1, 2, 3],
    storage: [600, 1500, 3000],
  },
};

export const BUILDABLE: BuildingType[] = ['solar', 'extractor', 'habitat', 'storage'];

export const CONFIG = {
  mapSize: 30,
  startOre: 250,
  startCrystals: 100,
  roadCost: 2,
  builderDrones: 2,
  colonistSpeed: 2.2, // tiles per second
  colonistSpawnSec: 3,
  carryAmount: 10,
  minPickup: 5,
  /** Speed-up price: one crystal per this many seconds left (minimum 1). */
  speedUpSecPerCrystal: 30,
  /** Longest offline gap we simulate when the game reopens. */
  maxCatchUpSec: 3600,
};
