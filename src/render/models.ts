import { Color3, Color4, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import type { BuildingType } from '../sim/config';
import type { Materials } from './materials';

/**
 * Stand-in building models made from primitives. Each returns a node centred on the
 * footprint, sitting on y = 0. Real Blender models (.glb) will replace these later.
 * One tile is 2 world units, so a 2x2 building has a 4 x 4 footprint.
 */
export type ModelFn = (scene: Scene, m: Materials, level: number) => TransformNode;

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

function part(mesh: Mesh, parent: TransformNode, mat: Mesh['material'], pos?: Vector3) {
  mesh.parent = parent;
  mesh.material = mat;
  if (pos) mesh.position = pos;
  return mesh;
}

const box = (scene: Scene, w: number, h: number, d: number) => MeshBuilder.CreateBox('box', { width: w, height: h, depth: d }, scene);
const cyl = (scene: Scene, h: number, d: number, t = 16, top?: number) =>
  MeshBuilder.CreateCylinder('cyl', { height: h, diameter: top == null ? d : undefined, diameterTop: top, diameterBottom: top == null ? undefined : d, tessellation: t }, scene);

function dome(scene: Scene, m: Materials, root: TransformNode, r: number, y: number, x = 0, z = 0) {
  part(cyl(scene, 0.5, r * 2 + 0.3, 32), root, m.dark, V(x, y + 0.25, z));
  part(MeshBuilder.CreateSphere('dome', { diameter: r * 2, slice: 0.5, segments: 20 }, scene), root, m.glass, V(x, y + 0.5, z));
  for (const rot of [0, Math.PI / 2]) {
    const rib = part(MeshBuilder.CreateTorus('rib', { diameter: r * 2, thickness: 0.12, tessellation: 32 }, scene), root, m.metal, V(x, y + 0.5, z));
    rib.rotation.x = Math.PI / 2;
    rib.rotation.y = rot;
  }
}

/** A gable roof made of two tilted slabs. */
function gable(scene: Scene, m: Materials, root: TransformNode, w: number, d: number, y: number, x = 0, z = 0) {
  for (const s of [-1, 1]) {
    const slab = part(box(scene, w, 0.12, d * 0.62), root, m.roof, V(x, y, z + s * d * 0.24));
    slab.rotation.x = s * 0.62;
  }
}

/** A disc standing upright that spins on its own axis (saw blades, wheels). */
function wheel(scene: Scene, root: TransformNode, mat: Mesh['material'], d: number, pos: Vector3, speed: number, faceX = false) {
  const pivot = new TransformNode('pivot', scene);
  pivot.parent = root;
  pivot.position = pos;
  if (faceX) pivot.rotation.z = Math.PI / 2;
  else pivot.rotation.x = Math.PI / 2;
  const disc = part(cyl(scene, 0.08, d, 24), pivot, mat);
  disc.metadata = { spin: speed };
  return disc;
}

/** Small glowing level lights along the front edge, so levels read at a glance. */
function levelLights(scene: Scene, m: Materials, root: TransformNode, level: number, z: number, y = 0.25) {
  for (let i = 0; i < level; i++) part(MeshBuilder.CreateSphere('lvl', { diameter: 0.22, segments: 6 }, scene), root, m.cyan, V(-0.4 + i * 0.4, y, z));
}

const hub: ModelFn = (scene, m, level) => {
  const root = new TransformNode('hub', scene);
  const h = 1.6 + level * 0.6;
  part(cyl(scene, h, 5.2, 8), root, m.metal, V(0, h / 2, 0));
  part(cyl(scene, 0.25, 5.3, 8), root, level >= 3 ? m.gold : m.trim, V(0, h - 0.4, 0));
  dome(scene, m, root, 2.1, h);
  part(cyl(scene, 2.4, 0.8), root, m.cyan, V(0, h + 1.2, 0));
  if (level >= 2) {
    const sh = 4 + level * 1.5;
    part(cyl(scene, sh, 0.6, 8, 0.12), root, m.metal, V(0, h + 1.6 + sh / 2, 0));
    part(MeshBuilder.CreateSphere('tip', { diameter: 0.5 }, scene), root, level >= 3 ? m.cyan : m.trim, V(0, h + 1.7 + sh, 0));
    for (const s of [-1, 1]) part(box(scene, 1.6, h * 0.7, 1.6), root, m.metal, V(s * 2.4, (h * 0.7) / 2, 1.2));
  }
  if (level >= 3) {
    const ring = part(MeshBuilder.CreateTorus('ring', { diameter: 6, thickness: 0.15, tessellation: 48 }, scene), root, m.cyan, V(0, h + 0.2, 0));
    ring.metadata = { spin: 0.4 };
    for (const [x, z] of [
      [-2.4, -2.4],
      [2.4, -2.4],
    ]) {
      part(cyl(scene, 5, 0.6, 8), root, m.metal, V(x, 2.5, z));
      part(cyl(scene, 0.9, 0.8, 8, 0), root, m.gold, V(x, 5.45, z));
    }
  }
  return root;
};

const solar: ModelFn = (scene, m, level) => {
  const root = new TransformNode('solar', scene);
  const spots =
    level === 1
      ? [[0, 0]]
      : level === 2
        ? [
            [-0.95, 0],
            [0.95, 0],
          ]
        : [
            [-0.95, -0.9],
            [0.95, -0.9],
            [-0.95, 0.9],
            [0.95, 0.9],
          ];
  const w = level === 1 ? 2.8 : 1.7;
  for (const [x, z] of spots) {
    part(cyl(scene, 1.2, 0.12), root, m.dark, V(x, 0.6, z));
    const p = part(box(scene, w, 0.08, level === 3 ? 1.4 : 2.2), root, m.panel, V(x, 1.25, z));
    p.rotation.x = -0.45;
  }
  part(box(scene, 0.6, 0.5 + level * 0.15, 0.6), root, m.metal, V(1.6, 0.35, 1.5));
  part(box(scene, 0.62, 0.1, 0.62), root, m.cyan, V(1.6, 0.65 + level * 0.15, 1.5));
  return root;
};

const habitat: ModelFn = (scene, m, level) => {
  const root = new TransformNode('habitat', scene);
  if (level === 1) {
    dome(scene, m, root, 1.5, 0);
    part(box(scene, 1.4, 0.7, 1), root, m.metal, V(0, 0.85, 0));
  } else {
    const h = level === 2 ? 1.4 : 2.6;
    part(box(scene, 2.8, h, 2.4), root, m.metal, V(-0.2, h / 2, 0));
    part(box(scene, 2.85, 0.15, 2.45), root, m.trim, V(-0.2, h - 0.3, 0));
    for (let i = 0; i < (level === 2 ? 3 : 6); i++) {
      const row = level === 3 && i >= 3 ? 1 : 0;
      part(box(scene, 0.35, 0.3, 0.05), root, m.cyan, V(-1 + (i % 3) * 0.8, 0.6 + row * 1.1, 1.22));
    }
    dome(scene, m, root, 1, h, -0.2, 0);
    if (level === 3) {
      dome(scene, m, root, 0.7, 0, 1.45, 1.3);
      part(MeshBuilder.CreateSphere('plant', { diameter: 0.6 }, scene), root, m.leaf, V(1.45, 0.6, 1.3));
    }
  }
  return root;
};

const depot: ModelFn = (scene, m, level) => {
  const root = new TransformNode('depot', scene);
  const spots =
    level === 1
      ? [[0, 0]]
      : level === 2
        ? [
            [-0.9, 0],
            [0.9, 0],
          ]
        : [
            [-1, -0.6],
            [1, -0.6],
            [0, 1],
          ];
  spots.forEach(([x, z], i) => {
    const h = 2 + level * 0.6 + (i === 1 ? 0.5 : 0);
    part(cyl(scene, h, 1.5, 18), root, m.metal, V(x, h / 2, z));
    part(MeshBuilder.CreateSphere('cap', { diameter: 1.5, slice: 0.5, segments: 12 }, scene), root, m.trim, V(x, h, z));
    part(cyl(scene, 0.15, 1.55, 18), root, m.cyan, V(x, h * 0.6, z));
  });
  for (let i = 0; i < 3; i++) part(box(scene, 0.5, 0.5, 0.5), root, m.crate, V(-1.4 + i * 0.55, 0.25, 1.5));
  return root;
};

const lumber: ModelFn = (scene, m, level) => {
  const root = new TransformNode('lumber', scene);
  const w = 2 + level * 0.2;
  part(box(scene, w, 1.3, 1.7), root, m.wood, V(-0.5, 0.65, -0.5));
  gable(scene, m, root, w + 0.3, 2.1, 1.6, -0.5, -0.5);
  part(box(scene, 0.45, 0.8, 0.05), root, m.dark, V(-0.5, 0.4, 0.37));
  part(MeshBuilder.CreateSphere('lamp', { diameter: 0.22, segments: 6 }, scene), root, m.cyan, V(0.0, 1.05, 0.38));
  // Log pile grows with level.
  const logs = 2 + level;
  for (let i = 0; i < logs; i++) {
    const log = part(cyl(scene, 1.5, 0.34, 8), root, m.bark, V(1.0, 0.18 + Math.floor(i / 3) * 0.3, 0.6 + (i % 3) * 0.36));
    log.rotation.z = Math.PI / 2;
  }
  part(cyl(scene, 0.4, 0.55, 10), root, m.bark, V(-1.2, 0.2, 1.2));
  const axe = part(box(scene, 0.06, 0.7, 0.06), root, m.wood, V(-1.2, 0.65, 1.2));
  axe.rotation.z = 0.4;
  if (level >= 3) part(box(scene, 1.1, 0.9, 1.1), root, m.wood, V(1.1, 0.45, -1.2));
  return root;
};

const quarry: ModelFn = (scene, m, level) => {
  const root = new TransformNode('quarry', scene);
  part(box(scene, 1.6, 1.2, 1.4), root, m.dark, V(-0.9, 0.6, -0.9));
  part(box(scene, 1.65, 0.12, 1.45), root, m.trim, V(-0.9, 1.25, -0.9));
  // Crane.
  const mast = 2.6 + level * 0.4;
  part(cyl(scene, mast, 0.22, 8), root, m.metal, V(0.8, mast / 2, -0.8));
  const arm = part(box(scene, 2.4, 0.14, 0.14), root, m.trim, V(0.3, mast, -0.8));
  arm.rotation.y = 0.5;
  part(cyl(scene, 1, 0.04, 4), root, m.dark, V(-0.4, mast - 0.5, -0.2));
  // Stone blocks.
  const blocks = 3 + level * 2;
  for (let i = 0; i < blocks; i++) {
    const b = part(box(scene, 0.5, 0.42, 0.5), root, m.stone, V(-1.2 + (i % 4) * 0.6, 0.21 + Math.floor(i / 4) * 0.42, 0.9 + (i % 2) * 0.2));
    b.rotation.y = i * 0.3;
  }
  return root;
};

const sawmill: ModelFn = (scene, m, level) => {
  const root = new TransformNode('sawmill', scene);
  part(box(scene, 2.8, 1.5, 2), root, m.wood, V(-0.3, 0.75, -0.6));
  part(box(scene, 3, 0.14, 2.2), root, m.roof, V(-0.3, 1.57, -0.6));
  part(box(scene, 1.6, 0.6, 0.8), root, m.dark, V(0.2, 0.3, 1.1));
  wheel(scene, root, m.metal, 1.1, V(0.2, 0.75, 1.1), 6);
  for (let i = 0; i < 2 + level; i++) part(box(scene, 1.8, 0.1, 0.4), root, m.wood, V(-1.0, 0.06 + i * 0.12, 1.5));
  if (level >= 2) part(cyl(scene, 1.8, 0.35, 10), root, m.metal, V(1.2, 2, -1.2));
  levelLights(scene, m, root, level, 0.42, 1.2);
  return root;
};

const forester: ModelFn = (scene, m, level) => {
  const root = new TransformNode('forester', scene);
  dome(scene, m, root, 1.1, 0, -0.7, -0.6);
  part(MeshBuilder.CreateSphere('sprout', { diameter: 0.9, segments: 8 }, scene), root, m.canopyA, V(-0.7, 0.8, -0.6));
  part(box(scene, 1.2, 1, 1.1), root, m.wood, V(1.0, 0.5, -1.0));
  gable(scene, m, root, 1.4, 1.4, 1.25, 1.0, -1.0);
  for (let i = 0; i < 2 + level; i++) {
    const x = -1.3 + i * 0.7;
    part(cyl(scene, 0.3, 0.35, 8), root, m.dark, V(x, 0.15, 1.3));
    part(cyl(scene, 0.6, 0.3, 6, 0), root, m.leaf, V(x, 0.6, 1.3));
    part(MeshBuilder.CreateSphere('bud', { diameter: 0.16, segments: 4 }, scene), root, m.cyan, V(x, 0.95, 1.3));
  }
  part(cyl(scene, 0.8, 0.6, 12), root, m.ice, V(1.4, 0.4, 0.5));
  return root;
};

const icedrill: ModelFn = (scene, m, level) => {
  const root = new TransformNode('icedrill', scene);
  part(box(scene, 3.4, 0.3, 3.4), root, m.dark, V(0, 0.15, 0));
  const h = 3 + level * 0.6;
  part(cyl(scene, h, 0.9, 10), root, m.metal, V(-0.6, h / 2, -0.6));
  part(cyl(scene, 0.4, 1.1, 10), root, m.trim, V(-0.6, h, -0.6));
  const bit = part(cyl(scene, 1.2, 0.6, 8, 0), root, m.trim, V(-0.6, 0.2, -0.6));
  bit.rotation.x = Math.PI;
  bit.metadata = { spin: 4 };
  part(cyl(scene, 1.6, 1.3, 16), root, m.ice, V(0.9, 1.1, 0.8));
  part(cyl(scene, 0.12, 1.36, 16), root, m.metal, V(0.9, 1.9, 0.8));
  const pipe = part(cyl(scene, 1.8, 0.16, 8), root, m.metal, V(0.15, 1.6, 0.1));
  pipe.rotation.z = Math.PI / 2;
  pipe.rotation.y = -0.8;
  levelLights(scene, m, root, level, 1.71, 0.35);
  return root;
};

const farm: ModelFn = (scene, m, level) => {
  const root = new TransformNode('farm', scene);
  part(box(scene, 3.4, 0.25, 2.6), root, m.dark, V(0, 0.12, -0.2));
  for (let i = 0; i < 3; i++) part(box(scene, 3, 0.18, 0.3), root, m.crop, V(0, 0.34, -1 + i * 0.75));
  const tunnel = part(MeshBuilder.CreateSphere('tunnel', { diameter: 2, slice: 0.5, segments: 20 }, scene), root, m.glass, V(0, 0.25, -0.2));
  tunnel.scaling = V(1.75, 0.95, 1.35);
  for (const x of [-1.2, 0, 1.2]) {
    const rib = part(MeshBuilder.CreateTorus('rib', { diameter: 2, thickness: 0.08, tessellation: 24 }, scene), root, m.metal, V(x, 0.25, -0.2));
    rib.rotation.z = Math.PI / 2;
    rib.scaling = V(0.95, 1, 1.35);
  }
  part(cyl(scene, 0.9, 0.6, 12), root, m.ice, V(1.4, 0.45, 1.5));
  if (level >= 2) part(cyl(scene, 0.9, 0.6, 12), root, m.ice, V(0.7, 0.45, 1.5));
  levelLights(scene, m, root, level, 1.5, 0.3);
  return root;
};

const mine: ModelFn = (scene, m, level) => {
  const root = new TransformNode('mine', scene);
  part(box(scene, 1.6, 0.4, 1.6), root, m.dark, V(-0.4, 0.2, -0.4));
  const h = 3 + level * 0.4;
  for (const [x, z] of [
    [-1, -1],
    [0.2, -1],
    [-1, 0.2],
    [0.2, 0.2],
  ]) {
    const leg = part(cyl(scene, h, 0.14, 6), root, m.metal, V(x * 0.8 - 0.1, h / 2, z * 0.8 - 0.1));
    leg.rotation.x = z < 0 ? 0.12 : -0.12;
    leg.rotation.z = x < 0 ? -0.12 : 0.12;
  }
  wheel(scene, root, m.trim, 1.1, V(-0.4, h, -0.4), 2, true);
  part(box(scene, 0.8, 0.5, 0.6), root, m.rust, V(1.1, 0.4, 1.0));
  part(box(scene, 2.6, 0.06, 0.12), root, m.dark, V(0.3, 0.05, 1.0));
  for (let i = 0; i < 3 + level; i++) {
    const r = part(MeshBuilder.CreatePolyhedron('ore', { type: 2, size: 0.28 }, scene), root, m.rust, V(1.3 - (i % 3) * 0.35, 0.2 + Math.floor(i / 3) * 0.25, -1.1 + (i % 2) * 0.3));
    r.rotation.y = i;
  }
  return root;
};

const extractor: ModelFn = (scene, m, level) => {
  const root = new TransformNode('extractor', scene);
  const h = 3 + level * 1.4;
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [0, 1.2],
  ]) {
    const leg = part(cyl(scene, h, 0.14), root, m.metal, V(a * 0.5, h / 2, b * 0.5));
    leg.rotation = V(b * 0.12, 0, -a * 0.12);
  }
  const drill = part(cyl(scene, 1.6, 0, 8, 0.5), root, m.trim, V(0, 0.8, 0));
  drill.metadata = { spin: 3 };
  part(MeshBuilder.CreateBox('head', { size: 0.6 }, scene), root, m.dark, V(0, h, 0));
  part(MeshBuilder.CreateSphere('beacon', { diameter: 0.35 }, scene), root, m.mag, V(0, h + 0.45, 0));
  part(box(scene, 1, 0.8, 1), root, m.dark, V(1.3, 0.4, 1.3));
  part(MeshBuilder.CreatePolyhedron('gem', { type: 1, size: 0.3 }, scene), root, m.vio, V(1.3, 1.0, 1.3));
  if (level >= 2) {
    const arm = part(box(scene, 2.4, 0.12, 0.4), root, m.metal, V(0.5, 1.2, 1.3));
    arm.rotation.z = 0.5;
  }
  if (level >= 3) part(cyl(scene, 2, 0.9, 16), root, m.metal, V(-1.3, 1, 1.3));
  return root;
};

const beacon: ModelFn = (scene, m, level) => {
  const root = new TransformNode('beacon', scene);
  const h = 3.6 + level * 0.8;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = part(cyl(scene, 1.4, 0.1, 6), root, m.metal, V(Math.cos(a) * 0.45, 0.6, Math.sin(a) * 0.45));
    leg.rotation.z = Math.cos(a) * 0.5;
    leg.rotation.x = -Math.sin(a) * 0.5;
  }
  part(cyl(scene, h, 0.22, 8), root, m.metal, V(0, h / 2, 0));
  const spinner = new TransformNode('spinner', scene);
  spinner.parent = root;
  spinner.position.y = h - 0.4;
  spinner.metadata = { spin: 1.2 };
  const dish = part(MeshBuilder.CreateSphere('dish', { diameter: 1.2, slice: 0.5, segments: 12 }, scene), spinner, m.white, V(0.35, 0, 0));
  dish.rotation.z = Math.PI / 2 + 0.4;
  dish.scaling.y = 0.4;
  part(MeshBuilder.CreateSphere('tip', { diameter: 0.4, segments: 8 }, scene), root, m.cyan, V(0, h + 0.2, 0));
  return root;
};

const smelter: ModelFn = (scene, m, level) => {
  const root = new TransformNode('smelter', scene);
  part(cyl(scene, 2, 2.4, 10, 1.6), root, m.dark, V(-0.3, 1, -0.3));
  part(cyl(scene, 0.2, 2.5, 10), root, m.trim, V(-0.3, 0.6, -0.3));
  part(box(scene, 0.8, 0.6, 0.3), root, m.furnace, V(-0.3, 0.6, 0.85));
  const ch = 3 + level * 0.5;
  part(cyl(scene, ch, 0.6, 10, 0.45), root, m.metal, V(-1.1, ch / 2 + 0.5, -1.1));
  part(cyl(scene, 0.2, 0.7, 10), root, m.furnace, V(-1.1, ch + 0.55, -1.1));
  for (let i = 0; i < 2 + level; i++) part(box(scene, 0.55, 0.18, 0.28), root, m.metal, V(1.2, 0.09 + Math.floor(i / 2) * 0.18, 1.0 + (i % 2) * 0.32));
  levelLights(scene, m, root, level, 1.6, 0.25);
  return root;
};

const fabricator: ModelFn = (scene, m, level) => {
  const root = new TransformNode('fabricator', scene);
  part(box(scene, 3, 1.6, 2.4), root, m.white, V(0, 0.8, -0.4));
  for (const y of [0.5, 1.1]) part(box(scene, 3.02, 0.07, 2.42), root, m.cyan, V(0, y, -0.4));
  part(box(scene, 1.2, 0.8, 0.05), root, m.panel, V(-0.6, 0.8, 0.82));
  part(cyl(scene, 1.2, 0.12, 6), root, m.metal, V(1, 2.2, -1));
  const dish = part(MeshBuilder.CreateSphere('dish', { diameter: 1.1, slice: 0.5, segments: 12 }, scene), root, m.white, V(1, 2.8, -1));
  dish.rotation.x = Math.PI + 0.5;
  dish.scaling.y = 0.4;
  if (level >= 2) part(box(scene, 1, 0.8, 1), root, m.white, V(1.2, 0.4, 1.2));
  levelLights(scene, m, root, level, 0.85, 1.4);
  return root;
};

export const MODELS: Record<BuildingType, ModelFn> = {
  hub,
  habitat,
  depot,
  solar,
  lumber,
  quarry,
  sawmill,
  forester,
  icedrill,
  farm,
  mine,
  extractor,
  beacon,
  smelter,
  fabricator,
};

/** Suit accent colours, one per crew member (cycled). */
const ACCENTS = ['#f08a3c', '#f2c94c', '#3fe6cf', '#ff6b5e', '#b18cff', '#7be06a', '#5aa9ff', '#ff7ad9'];
/** Base suit colours: mostly white, with a few grey and sand suits. */
const SUITS = ['#eef1f6', '#eef1f6', '#d9dee8', '#e9dcc5', '#c8d3e6'];

/** How one colonist looks. Picked from their id, so it stays the same between visits. */
export interface ColonistLook {
  accent: Color4;
  suit: Color4;
  /** Which visor tint: gold, teal, violet, rose or deep blue. */
  visor: number;
  /** Helmet gear: 0 antenna, 1 head lamp, 2 twin antennas, 3 headset mic. */
  gear: number;
  /** Life support: 0 twin tanks, 1 one big tank, 2 slim pack with a dish. */
  pack: number;
  /** Stripe down the chest, or shoulder pads only. */
  stripe: boolean;
  height: number;
}

const pick = (seed: number, salt: number) => ((((seed + 1) * 2654435761) ^ (salt * 40503 * 2246822519)) >>> 0) / 4294967296;
const c4 = (hex: string) => {
  const c = Color3.FromHexString(hex);
  return new Color4(c.r, c.g, c.b, 1);
};

export function colonistLook(id: number): ColonistLook {
  return {
    accent: c4(ACCENTS[id % ACCENTS.length]),
    suit: c4(SUITS[Math.floor(pick(id, 1) * SUITS.length)]),
    visor: Math.floor(pick(id, 2) * VISOR_TINTS.length),
    gear: Math.floor(pick(id, 3) * 4),
    pack: Math.floor(pick(id, 4) * 3),
    stripe: pick(id, 5) < 0.5,
    height: 0.94 + pick(id, 6) * 0.12,
  };
}

/** Visor glass tints: the diffuse colour and the glow inside the helmet. */
const VISOR_TINTS: [string, string][] = [
  ['#2a1a06', '#d89a2b'],
  ['#062a2a', '#2bd9c8'],
  ['#1a0a2e', '#9d6bff'],
  ['#2a0a1e', '#ff6bd6'],
  ['#06122a', '#4f8dff'],
];

/**
 * Hidden source meshes for colonists. Each colonist is made of instances of these,
 * so dozens of colonists cost a handful of draw calls. "Tinted" parts take their colour
 * from each instance, which is how every colonist gets their own suit and accent colours.
 */
export function colonistParts(scene: Scene, m: Materials) {
  const hide = (mesh: Mesh, mat: Mesh['material']) => {
    mesh.material = mat;
    mesh.isVisible = false;
    mesh.isPickable = false;
    return mesh;
  };
  // A white material that each instance colours in.
  const tintMat = new StandardMaterial('tint', scene);
  tintMat.diffuseColor = new Color3(1, 1, 1);
  tintMat.specularColor = new Color3(0.25, 0.25, 0.3);
  tintMat.emissiveColor = new Color3(0.1, 0.1, 0.13);
  const tinted = (mesh: Mesh) => {
    hide(mesh, tintMat);
    mesh.registerInstancedBuffer(VertexBuffer.ColorKind, 4);
    mesh.instancedBuffers.color = new Color4(1, 1, 1, 1);
    return mesh;
  };
  const visors = VISOR_TINTS.map(([col, glow], i) => {
    const mat = new StandardMaterial('visor' + i, scene);
    mat.diffuseColor = Color3.FromHexString(col);
    mat.emissiveColor = Color3.FromHexString(glow).scale(0.75);
    mat.specularColor = new Color3(1, 1, 1);
    mat.specularPower = 96;
    return hide(MeshBuilder.CreateSphere('visor' + i, { diameter: 0.36, segments: 12 }, scene), mat);
  });
  return {
    // Suit colour
    torso: tinted(MeshBuilder.CreateCapsule('torso', { height: 0.52, radius: 0.19, tessellation: 12 }, scene)),
    leg: tinted(MeshBuilder.CreateCapsule('leg', { height: 0.36, radius: 0.08, tessellation: 8 }, scene)),
    arm: tinted(MeshBuilder.CreateCapsule('arm', { height: 0.32, radius: 0.06, tessellation: 8 }, scene)),
    helmet: tinted(MeshBuilder.CreateSphere('helmet', { diameter: 0.46, segments: 14 }, scene)),
    // Accent colour
    pad: tinted(MeshBuilder.CreateSphere('pad', { diameter: 0.17, segments: 6 }, scene)),
    stripe: tinted(MeshBuilder.CreateBox('stripe', { width: 0.05, height: 0.36, depth: 0.08 }, scene)),
    cuff: tinted(MeshBuilder.CreateCylinder('cuff', { height: 0.05, diameter: 0.14, tessellation: 10 }, scene)),
    knee: tinted(MeshBuilder.CreateSphere('knee', { diameter: 0.12, segments: 6 }, scene)),
    rim: tinted(MeshBuilder.CreateTorus('rim', { diameter: 0.3, thickness: 0.035, tessellation: 20 }, scene)),
    earCap: tinted(MeshBuilder.CreateCylinder('earCap', { height: 0.04, diameter: 0.12, tessellation: 12 }, scene)),
    // Fixed colours
    visors,
    glint: hide(MeshBuilder.CreateSphere('glint', { diameter: 0.07, segments: 6 }, scene), m.white),
    ear: hide(MeshBuilder.CreateCylinder('ear', { height: 0.06, diameter: 0.15, tessellation: 12 }, scene), m.metal),
    belt: hide(MeshBuilder.CreateCylinder('belt', { height: 0.07, diameter: 0.4, tessellation: 12 }, scene), m.dark),
    buckle: hide(MeshBuilder.CreateBox('buckle', { width: 0.04, height: 0.06, depth: 0.09 }, scene), m.metal),
    panel: hide(MeshBuilder.CreateBox('panel', { width: 0.04, height: 0.13, depth: 0.15 }, scene), m.dark),
    lightC: hide(MeshBuilder.CreateBox('lightC', { width: 0.02, height: 0.025, depth: 0.025 }, scene), m.cyan),
    lightM: hide(MeshBuilder.CreateBox('lightM', { width: 0.02, height: 0.025, depth: 0.025 }, scene), m.mag),
    lightA: hide(MeshBuilder.CreateBox('lightA', { width: 0.02, height: 0.025, depth: 0.025 }, scene), m.trim),
    boot: hide(MeshBuilder.CreateBox('boot', { width: 0.2, height: 0.09, depth: 0.13 }, scene), m.dark),
    sole: hide(MeshBuilder.CreateBox('sole', { width: 0.21, height: 0.025, depth: 0.14 }, scene), m.metal),
    glove: hide(MeshBuilder.CreateSphere('glove', { diameter: 0.12, segments: 6 }, scene), m.dark),
    collar: hide(MeshBuilder.CreateCylinder('collar', { height: 0.07, diameter: 0.3, tessellation: 12 }, scene), m.metal),
    pack: hide(MeshBuilder.CreateBox('pack', { width: 0.16, height: 0.4, depth: 0.32 }, scene), m.dark),
    vent: hide(MeshBuilder.CreateBox('vent', { width: 0.02, height: 0.025, depth: 0.2 }, scene), m.metal),
    tank: hide(MeshBuilder.CreateCapsule('tank', { height: 0.36, radius: 0.06, tessellation: 8 }, scene), m.metal),
    bigTank: hide(MeshBuilder.CreateCapsule('bigTank', { height: 0.42, radius: 0.1, tessellation: 10 }, scene), m.metal),
    dish: hide(MeshBuilder.CreateCylinder('dish', { height: 0.02, diameterTop: 0.16, diameterBottom: 0.05, tessellation: 12 }, scene), m.white),
    antenna: hide(MeshBuilder.CreateCylinder('antenna', { height: 0.26, diameter: 0.018, tessellation: 4 }, scene), m.metal),
    tip: hide(MeshBuilder.CreateSphere('tip', { diameter: 0.05, segments: 4 }, scene), m.trim),
    lamp: hide(MeshBuilder.CreateCylinder('lamp', { height: 0.08, diameter: 0.08, tessellation: 10 }, scene), m.metal),
    lampLens: hide(MeshBuilder.CreateCylinder('lampLens', { height: 0.012, diameter: 0.065, tessellation: 10 }, scene), m.gold),
    mic: hide(MeshBuilder.CreateCapsule('mic', { height: 0.2, radius: 0.012, tessellation: 4 }, scene), m.dark),
    // Hand tools. Handles run along -y from the grip; heads sit at the far end.
    handle: hide(MeshBuilder.CreateCylinder('handle', { height: 1, diameter: 0.045, tessellation: 6 }, scene), m.bark),
    blade: hide(MeshBuilder.CreateBox('blade', { width: 1, height: 1, depth: 1 }, scene), m.metal),
    toolGrip: hide(MeshBuilder.CreateBox('toolGrip', { width: 1, height: 1, depth: 1 }, scene), m.trim),
    hammerHead: hide(MeshBuilder.CreateBox('hammerHead', { width: 1, height: 1, depth: 1 }, scene), m.dark),
  };
}

export type ColonistParts = ReturnType<typeof colonistParts>;

export interface ColonistRig {
  root: TransformNode;
  /** Hip and shoulder pivots, swung when walking. Index 0 is the left side. */
  legs: TransformNode[];
  arms: TransformNode[];
}

/**
 * One astronaut built from instances, about 1.25 units tall. Faces +x: a big tinted visor and
 * chest panel at the front, life support on the back. Colours and gear come from `look`.
 */
export function colonistModel(scene: Scene, parts: ColonistParts, look: ColonistLook): ColonistRig {
  const root = new TransformNode('colonist', scene);
  const body = new TransformNode('body', scene);
  body.parent = root;
  body.scaling.y = look.height;
  const add = (src: Mesh, parent: TransformNode, pos: Vector3, scale?: Vector3, rot?: Vector3, color?: Color4) => {
    const inst = src.createInstance('c');
    inst.parent = parent;
    inst.position = pos;
    if (scale) inst.scaling = scale;
    if (rot) inst.rotation = rot;
    if (color) inst.instancedBuffers.color = color;
    inst.isPickable = false;
    return inst;
  };
  const suit = (src: Mesh, parent: TransformNode, pos: Vector3, scale?: Vector3, rot?: Vector3) => add(src, parent, pos, scale, rot, look.suit);
  const accent = (src: Mesh, parent: TransformNode, pos: Vector3, scale?: Vector3, rot?: Vector3) => add(src, parent, pos, scale, rot, look.accent);
  const pivot = (pos: Vector3) => {
    const n = new TransformNode('pivot', scene);
    n.parent = body;
    n.position = pos;
    return n;
  };

  // Torso, belt and chest panel.
  suit(parts.torso, body, V(0, 0.66, 0));
  add(parts.belt, body, V(0, 0.46, 0));
  add(parts.buckle, body, V(0.2, 0.46, 0));
  if (look.stripe) accent(parts.stripe, body, V(0.17, 0.66, -0.07));
  add(parts.panel, body, V(0.18, 0.66, 0.05));
  add(parts.lightC, body, V(0.2, 0.69, 0.01));
  add(parts.lightM, body, V(0.2, 0.69, 0.05));
  add(parts.lightA, body, V(0.2, 0.69, 0.09));
  add(parts.collar, body, V(0, 0.9, 0));

  // Helmet: a big tinted visor with a coloured rim, a glint, ear pieces and some gear on top.
  suit(parts.helmet, body, V(0, 1.07, 0));
  add(parts.visors[look.visor], body, V(0.135, 1.06, 0), V(0.62, 0.7, 0.92));
  accent(parts.rim, body, V(0.18, 1.06, 0), V(1, 0.82, 1.05), V(0, 0, Math.PI / 2));
  add(parts.glint, body, V(0.245, 1.11, 0.07), V(0.4, 0.7, 0.45));
  for (const side of [-1, 1]) {
    add(parts.ear, body, V(0, 1.07, side * 0.22), undefined, V(Math.PI / 2, 0, 0));
    accent(parts.earCap, body, V(0, 1.07, side * 0.25), undefined, V(Math.PI / 2, 0, 0));
  }
  switch (look.gear) {
    case 0:
      add(parts.antenna, body, V(-0.24, 1.02, -0.1));
      add(parts.tip, body, V(-0.24, 1.15, -0.1));
      break;
    case 1:
      add(parts.lamp, body, V(0.1, 1.3, 0), V(1, 1.4, 1), V(0, 0, -1.1));
      add(parts.lampLens, body, V(0.16, 1.325, 0), undefined, V(0, 0, -1.1));
      break;
    case 2:
      for (const side of [-1, 1]) {
        add(parts.antenna, body, V(-0.05, 1.32, side * 0.12), V(1, 0.6, 1), V(side * 0.3, 0, 0));
        add(parts.tip, body, V(-0.05, 1.4, side * 0.145));
      }
      break;
    case 3:
      add(parts.mic, body, V(0.13, 1.0, 0.2), undefined, V(0, 0, Math.PI / 2 - 0.3));
      break;
  }

  // Life support on the back.
  add(parts.pack, body, V(-0.21, 0.7, 0));
  add(parts.vent, body, V(-0.29, 0.82, 0));
  add(parts.vent, body, V(-0.29, 0.77, 0));
  if (look.pack === 0) {
    add(parts.tank, body, V(-0.3, 0.72, 0.08));
    add(parts.tank, body, V(-0.3, 0.72, -0.08));
  } else if (look.pack === 1) {
    add(parts.bigTank, body, V(-0.33, 0.7, 0));
  } else {
    add(parts.dish, body, V(-0.31, 0.62, 0), undefined, V(0, 0, Math.PI / 2));
  }

  const legs = [-1, 1].map((side) => {
    const hip = pivot(V(0, 0.44, side * 0.1));
    suit(parts.leg, hip, V(0, -0.18, 0));
    accent(parts.knee, hip, V(0.06, -0.2, 0));
    add(parts.boot, hip, V(0.03, -0.4, 0));
    add(parts.sole, hip, V(0.03, -0.45, 0));
    return hip;
  });
  const arms = [-1, 1].map((side) => {
    const shoulder = pivot(V(0, 0.82, side * 0.24));
    accent(parts.pad, shoulder, V(0, 0.01, 0));
    suit(parts.arm, shoulder, V(0, -0.15, side * 0.02));
    accent(parts.cuff, shoulder, V(0, -0.26, side * 0.02));
    add(parts.glove, shoulder, V(0, -0.32, side * 0.02));
    return shoulder;
  });
  return { root, legs, arms };
}

export type ToolKind = 'axe' | 'pick' | 'spade' | 'hammer';

/** How far each tool tilts forward from the forearm in the hand: swung tools reach ahead, a spade points at the ground. */
export const TOOL_GRIP: Record<ToolKind, number> = { axe: 0.6, pick: 0.6, spade: -0.7, hammer: 0.4 };

/**
 * A hand tool for a colonist, held in the right glove. The node's -y axis runs down the handle,
 * and the working edge faces -x, the way the tool moves on a downward swing.
 */
export function toolModel(scene: Scene, parts: ColonistParts, kind: ToolKind): TransformNode {
  const root = new TransformNode('tool-' + kind, scene);
  const add = (src: Mesh, pos: Vector3, scale: Vector3, rotZ = 0) => {
    const inst = src.createInstance('t');
    inst.parent = root;
    inst.position = pos;
    inst.scaling = scale;
    inst.rotation.z = rotZ;
    inst.isPickable = false;
  };
  const len = kind === 'hammer' ? 0.3 : kind === 'spade' ? 0.62 : 0.5;
  add(parts.handle, V(0, -len / 2 + 0.06, 0), V(1, len, 1));
  add(parts.toolGrip, V(0, 0.02, 0), V(0.06, 0.08, 0.06));
  const end = -len + 0.06;
  switch (kind) {
    case 'axe':
      // A broad wedge on the leading side, a short poll behind.
      add(parts.blade, V(-0.08, end + 0.03, 0), V(0.16, 0.13, 0.03));
      add(parts.blade, V(-0.17, end + 0.03, 0), V(0.04, 0.2, 0.025));
      add(parts.blade, V(0.04, end + 0.03, 0), V(0.07, 0.07, 0.05));
      break;
    case 'pick':
      // A long head swept down at both ends, crossing the handle.
      add(parts.blade, V(-0.1, end + 0.01, 0), V(0.2, 0.045, 0.04), 0.25);
      add(parts.blade, V(0.1, end + 0.01, 0), V(0.2, 0.045, 0.04), -0.25);
      add(parts.hammerHead, V(0, end + 0.03, 0), V(0.07, 0.08, 0.07));
      break;
    case 'spade':
      // A flat blade carrying on from the handle, with a T-grip at the top.
      add(parts.blade, V(0, end - 0.08, 0), V(0.02, 0.2, 0.16));
      add(parts.toolGrip, V(0, 0.06, 0), V(0.04, 0.04, 0.14));
      break;
    case 'hammer':
      add(parts.hammerHead, V(-0.02, end + 0.02, 0), V(0.14, 0.08, 0.08));
      break;
  }
  return root;
}
