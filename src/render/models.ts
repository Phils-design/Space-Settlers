import { Mesh, MeshBuilder, Scene, TransformNode, Vector3 } from '@babylonjs/core';
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

/**
 * Hidden source meshes for colonists. Each colonist is made of instances of these,
 * so dozens of colonists cost a handful of draw calls.
 */
export function colonistParts(scene: Scene, m: Materials) {
  const hide = (mesh: Mesh) => {
    mesh.isVisible = false;
    mesh.isPickable = false;
    return mesh;
  };
  const body = hide(MeshBuilder.CreateCapsule('body', { height: 0.8, radius: 0.22 }, scene));
  body.material = m.suit;
  const body2 = hide(body.clone('body2'));
  body2.material = m.suit2;
  const helmet = hide(MeshBuilder.CreateSphere('helmet', { diameter: 0.48, segments: 10 }, scene));
  helmet.material = m.metal;
  const visor = hide(MeshBuilder.CreateSphere('visor', { diameter: 0.34, segments: 8 }, scene));
  visor.material = m.visor;
  const pack = hide(MeshBuilder.CreateBox('pack', { width: 0.2, height: 0.4, depth: 0.3 }, scene));
  pack.material = m.dark;
  return { body, body2, helmet, visor, pack };
}

export type ColonistParts = ReturnType<typeof colonistParts>;

/** One colonist built from instances, about 1.2 units tall. */
export function colonistModel(scene: Scene, parts: ColonistParts, alt: boolean) {
  const root = new TransformNode('colonist', scene);
  const add = (src: Mesh, pos: Vector3, scale?: Vector3) => {
    const inst = src.createInstance('c');
    inst.parent = root;
    inst.position = pos;
    if (scale) inst.scaling = scale;
    inst.isPickable = false;
    return inst;
  };
  add(alt ? parts.body2 : parts.body, V(0, 0.45, 0));
  add(parts.helmet, V(0, 1.0, 0));
  add(parts.visor, V(0.11, 1.0, 0), V(0.6, 0.75, 1));
  add(parts.pack, V(-0.22, 0.6, 0));
  return root;
}
