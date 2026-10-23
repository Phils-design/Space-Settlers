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

function dome(scene: Scene, m: Materials, root: TransformNode, r: number, y: number, x = 0, z = 0) {
  part(MeshBuilder.CreateCylinder('db', { height: 0.5, diameter: r * 2 + 0.3, tessellation: 32 }, scene), root, m.dark, V(x, y + 0.25, z));
  part(MeshBuilder.CreateSphere('dome', { diameter: r * 2, slice: 0.5, segments: 20 }, scene), root, m.glass, V(x, y + 0.5, z));
  for (const rot of [0, Math.PI / 2]) {
    const rib = part(MeshBuilder.CreateTorus('rib', { diameter: r * 2, thickness: 0.12, tessellation: 32 }, scene), root, m.metal, V(x, y + 0.5, z));
    rib.rotation.x = Math.PI / 2;
    rib.rotation.y = rot;
  }
}

const hub: ModelFn = (scene, m, level) => {
  const root = new TransformNode('hub', scene);
  const h = 1.6 + level * 0.6;
  part(MeshBuilder.CreateCylinder('base', { height: h, diameter: 5.2, tessellation: 8 }, scene), root, m.metal, V(0, h / 2, 0));
  part(MeshBuilder.CreateCylinder('trim', { height: 0.25, diameter: 5.3, tessellation: 8 }, scene), root, level >= 3 ? m.gold : m.trim, V(0, h - 0.4, 0));
  dome(scene, m, root, 2.1, h);
  part(MeshBuilder.CreateCylinder('core', { height: 2.4, diameter: 0.8 }, scene), root, m.cyan, V(0, h + 1.2, 0));
  if (level >= 2) {
    const sh = 4 + level * 1.5;
    part(MeshBuilder.CreateCylinder('spire', { height: sh, diameterTop: 0.12, diameterBottom: 0.6, tessellation: 8 }, scene), root, m.metal, V(0, h + 1.6 + sh / 2, 0));
    part(MeshBuilder.CreateSphere('tip', { diameter: 0.5 }, scene), root, level >= 3 ? m.cyan : m.trim, V(0, h + 1.7 + sh, 0));
    for (const s of [-1, 1]) {
      part(MeshBuilder.CreateBox('wing', { width: 1.6, height: h * 0.7, depth: 1.6 }, scene), root, m.metal, V(s * 2.4, (h * 0.7) / 2, 1.2));
    }
  }
  if (level >= 3) {
    const ring = part(MeshBuilder.CreateTorus('ring', { diameter: 6, thickness: 0.15, tessellation: 48 }, scene), root, m.cyan, V(0, h + 0.2, 0));
    ring.metadata = { spin: 0.4 };
    for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4]]) {
      part(MeshBuilder.CreateCylinder('tower', { height: 5, diameter: 0.6, tessellation: 8 }, scene), root, m.metal, V(x, 2.5, z));
      part(MeshBuilder.CreateCylinder('cap', { height: 0.9, diameterTop: 0, diameterBottom: 0.8, tessellation: 8 }, scene), root, m.gold, V(x, 5.45, z));
    }
  }
  return root;
};

const solar: ModelFn = (scene, m, level) => {
  const root = new TransformNode('solar', scene);
  const spots = level === 1 ? [[0, 0]] : level === 2 ? [[-0.95, 0], [0.95, 0]] : [[-0.95, -0.9], [0.95, -0.9], [-0.95, 0.9], [0.95, 0.9]];
  const w = level === 1 ? 2.8 : 1.7;
  for (const [x, z] of spots) {
    part(MeshBuilder.CreateCylinder('leg', { height: 1.2, diameter: 0.12 }, scene), root, m.dark, V(x, 0.6, z));
    const p = part(MeshBuilder.CreateBox('panel', { width: w, height: 0.08, depth: level === 3 ? 1.4 : 2.2 }, scene), root, m.panel, V(x, 1.25, z));
    p.rotation.x = -0.45;
  }
  part(MeshBuilder.CreateBox('battery', { width: 0.6, height: 0.5 + level * 0.15, depth: 0.6 }, scene), root, m.metal, V(1.6, 0.35, 1.5));
  part(MeshBuilder.CreateBox('light', { width: 0.62, height: 0.1, depth: 0.62 }, scene), root, m.cyan, V(1.6, 0.65 + level * 0.15, 1.5));
  return root;
};

const habitat: ModelFn = (scene, m, level) => {
  const root = new TransformNode('habitat', scene);
  if (level === 1) {
    dome(scene, m, root, 1.5, 0);
    part(MeshBuilder.CreateBox('bunk', { width: 1.4, height: 0.7, depth: 1 }, scene), root, m.metal, V(0, 0.85, 0));
  } else {
    const h = level === 2 ? 1.4 : 2.6;
    part(MeshBuilder.CreateBox('module', { width: 2.8, height: h, depth: 2.4 }, scene), root, m.metal, V(-0.2, h / 2, 0));
    part(MeshBuilder.CreateBox('stripe', { width: 2.85, height: 0.15, depth: 2.45 }, scene), root, m.trim, V(-0.2, h - 0.3, 0));
    for (let i = 0; i < (level === 2 ? 3 : 6); i++) {
      const row = level === 3 && i >= 3 ? 1 : 0;
      part(MeshBuilder.CreateBox('win', { width: 0.35, height: 0.3, depth: 0.05 }, scene), root, m.cyan, V(-1 + (i % 3) * 0.8, 0.6 + row * 1.1, 1.22));
    }
    dome(scene, m, root, 1, h, -0.2, 0);
    if (level === 3) {
      dome(scene, m, root, 0.7, 0, 1.45, 1.3);
      part(MeshBuilder.CreateSphere('plant', { diameter: 0.6 }, scene), root, m.leaf, V(1.45, 0.6, 1.3));
    }
  }
  return root;
};

const extractor: ModelFn = (scene, m, level) => {
  const root = new TransformNode('extractor', scene);
  const h = 3 + level * 1.4;
  for (const [a, b] of [[-1, -1], [1, -1], [0, 1.2]]) {
    const leg = part(MeshBuilder.CreateCylinder('rig', { height: h, diameter: 0.14 }, scene), root, m.metal, V(a * 0.5, h / 2, b * 0.5));
    leg.rotation = V(b * 0.12, 0, -a * 0.12);
  }
  const drill = part(MeshBuilder.CreateCylinder('drill', { height: 1.6, diameterTop: 0.5, diameterBottom: 0, tessellation: 8 }, scene), root, m.trim, V(0, 0.8, 0));
  drill.metadata = { spin: 3 };
  part(MeshBuilder.CreateBox('head', { size: 0.6 }, scene), root, m.dark, V(0, h, 0));
  part(MeshBuilder.CreateSphere('beacon', { diameter: 0.35 }, scene), root, m.mag, V(0, h + 0.45, 0));
  part(MeshBuilder.CreateBox('hopper', { width: 1, height: 0.8, depth: 1 }, scene), root, m.dark, V(1.3, 0.4, 1.3));
  if (level >= 2) {
    const arm = part(MeshBuilder.CreateBox('conveyor', { width: 2.4, height: 0.12, depth: 0.4 }, scene), root, m.metal, V(0.5, 1.2, 1.3));
    arm.rotation.z = 0.5;
  }
  if (level >= 3) part(MeshBuilder.CreateCylinder('tank', { height: 2, diameter: 0.9, tessellation: 16 }, scene), root, m.metal, V(-1.3, 1, 1.3));
  return root;
};

const storage: ModelFn = (scene, m, level) => {
  const root = new TransformNode('storage', scene);
  const spots = level === 1 ? [[0, 0]] : level === 2 ? [[-0.9, 0], [0.9, 0]] : [[-1, -0.6], [1, -0.6], [0, 1]];
  spots.forEach(([x, z], i) => {
    const h = 2 + level * 0.6 + (i === 1 ? 0.5 : 0);
    part(MeshBuilder.CreateCylinder('silo', { height: h, diameter: 1.5, tessellation: 18 }, scene), root, m.metal, V(x, h / 2, z));
    part(MeshBuilder.CreateSphere('cap', { diameter: 1.5, slice: 0.5, segments: 12 }, scene), root, m.trim, V(x, h, z));
    part(MeshBuilder.CreateCylinder('band', { height: 0.15, diameter: 1.55, tessellation: 18 }, scene), root, m.cyan, V(x, h * 0.6, z));
  });
  return root;
};

export const MODELS: Record<BuildingType, ModelFn> = { hub, solar, habitat, extractor, storage };

/** A suited colonist, about 1.2 units tall. The crate is the last child so it can be toggled. */
export function colonistModel(scene: Scene, m: Materials, alt: boolean) {
  const root = new TransformNode('colonist', scene);
  part(MeshBuilder.CreateCapsule('body', { height: 0.8, radius: 0.22 }, scene), root, alt ? m.suit2 : m.suit, V(0, 0.45, 0));
  part(MeshBuilder.CreateSphere('helmet', { diameter: 0.48, segments: 10 }, scene), root, m.metal, V(0, 1.0, 0));
  const visor = part(MeshBuilder.CreateSphere('visor', { diameter: 0.34, segments: 8 }, scene), root, m.visor, V(0.11, 1.0, 0));
  visor.scaling = V(0.6, 0.75, 1);
  part(MeshBuilder.CreateBox('pack', { width: 0.2, height: 0.4, depth: 0.3 }, scene), root, m.dark, V(-0.22, 0.6, 0));
  const crate = part(MeshBuilder.CreateBox('crate', { size: 0.34 }, scene), root, m.crate, V(0.26, 0.62, 0));
  return { root, crate };
}
