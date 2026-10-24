import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  GlowLayer,
  HemisphericLight,
  InstancedMesh,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import { entries } from '../sim/bag';
import { BUILDINGS, FERRITE, GOOD_INFO, GOODS, ICE, LUMENITE, type BuildingType, type Good } from '../sim/config';
import { rng } from '../sim/map';
import { lv, occupancy } from '../sim/rules';
import { byId, type Building, type GameState } from '../sim/state';
import { territory } from '../sim/territory';
import { makeMaterials, type Materials } from './materials';
import { MODELS, colonistModel, colonistParts, type ColonistParts } from './models';

/** World units per tile. */
export const TILE = 2;
/** Ground texture pixels per tile. */
const PX = 12;

interface BuildingView {
  node: TransformNode;
  key: string;
  /** The model that grows while a new building goes up. */
  rising?: TransformNode;
  pile?: TransformNode;
  pileKey: string;
}

interface ColonistView {
  root: TransformNode;
  crate?: InstancedMesh;
  crateGood?: Good;
  lx: number;
  ly: number;
  phase: number;
}

export interface PickResult {
  tile?: { x: number; y: number };
  buildingId?: number;
}

type PropKind = 'trunk' | 'canopyA' | 'canopyB' | 'rock' | 'lumenite' | 'ferrite' | 'ice';

/** A stable pseudo-random number in 0..1 for a tile, so props don't jump around between redraws. */
const hash = (i: number, salt = 0) => (((i * 2654435761 + salt * 40503) >>> 0) % 100000) / 100000;

function part(mesh: Mesh, parent: TransformNode, mat: Mesh['material'], y: number, x = 0, z = 0) {
  mesh.parent = parent;
  mesh.material = mat;
  mesh.position = new Vector3(x, y, z);
  return mesh;
}

export class World {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private readonly m: Materials;
  private readonly shadows: ShadowGenerator;
  private readonly size: number;
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly ground: Mesh;
  private readonly groundTex: DynamicTexture;
  private readonly parts: ColonistParts;
  private readonly crates = new Map<Good, Mesh>();
  private readonly buildings = new Map<number, BuildingView>();
  private readonly colonists = new Map<number, ColonistView>();
  private readonly props: Record<PropKind | 'road', Mesh>;
  private readonly selectRing: Mesh;
  private readonly radiusRing: Mesh;
  private readonly anchor: Mesh;
  private ghost: { type: BuildingType; node: TransformNode; pad: Mesh } | null = null;
  private seen = { roads: -1, nature: -1, ground: -1 };
  private spinners: TransformNode[] = [];

  constructor(private readonly canvas: HTMLCanvasElement, state: GameState) {
    this.size = state.size;
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true }, false);
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
    const scene = (this.scene = new Scene(this.engine));
    scene.clearColor = new Color4(0.04, 0.03, 0.1, 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0032;
    scene.fogColor = Color3.FromHexString('#2a1d4a');
    this.m = makeMaterials(scene);

    const cam = (this.camera = new ArcRotateCamera('cam', -Math.PI / 2.6, 0.92, 64, Vector3.Zero(), scene));
    cam.lowerRadiusLimit = 12;
    cam.upperRadiusLimit = 150;
    cam.lowerBetaLimit = 0.3;
    cam.upperBetaLimit = 1.3;
    cam.wheelDeltaPercentage = 0.01;
    cam.pinchDeltaPercentage = 0.004;
    cam.panningAxis = new Vector3(1, 0, 1);
    cam.maxZ = 1200;
    cam.attachControl(canvas, true);

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.62;
    hemi.diffuse = Color3.FromHexString('#b9a8ff');
    hemi.groundColor = Color3.FromHexString('#1f6f6a');
    const sun = new DirectionalLight('sun', new Vector3(-0.6, -1, 0.4), scene);
    sun.position = new Vector3(120, 160, -80);
    sun.intensity = 1.2;
    sun.diffuse = Color3.FromHexString('#ffd9b0');
    this.shadows = new ShadowGenerator(2048, sun);
    this.shadows.useBlurExponentialShadowMap = true;
    this.shadows.blurKernel = 12;
    this.shadows.darkness = 0.35;
    const glow = new GlowLayer('glow', scene, { mainTextureRatio: 0.5 });
    glow.intensity = 0.6;

    this.buildBackdrop(glow);
    const g = this.buildGround();
    this.ground = g.mesh;
    this.groundTex = g.tex;
    this.props = this.buildProps();
    this.parts = colonistParts(scene, this.m);
    for (const p of Object.values(this.parts)) this.shadows.addShadowCaster(p);
    for (const good of GOODS) {
      const mat = new StandardMaterial('crate-' + good, scene);
      const col = Color3.FromHexString(GOOD_INFO[good].color);
      mat.diffuseColor = col;
      mat.emissiveColor = col.scale(0.3);
      mat.specularColor = new Color3(0.2, 0.2, 0.2);
      const crate = MeshBuilder.CreateBox('crate-' + good, { size: 0.34 }, scene);
      crate.material = mat;
      crate.isVisible = false;
      crate.isPickable = false;
      this.shadows.addShadowCaster(crate);
      this.crates.set(good, crate);
    }

    this.selectRing = MeshBuilder.CreateTorus('select', { diameter: 1, thickness: 0.06, tessellation: 48 }, scene);
    this.selectRing.material = this.m.select;
    this.selectRing.isPickable = false;
    this.selectRing.setEnabled(false);

    this.radiusRing = MeshBuilder.CreateTorus('radius', { diameter: 2, thickness: 0.03, tessellation: 96 }, scene);
    this.radiusRing.material = this.m.radius;
    this.radiusRing.isPickable = false;
    this.radiusRing.setEnabled(false);

    this.anchor = MeshBuilder.CreateBox('anchor', { width: TILE, height: 0.3, depth: TILE }, scene);
    this.anchor.material = this.m.ghostOk;
    this.anchor.isPickable = false;
    this.anchor.setEnabled(false);

    scene.onBeforeRenderObservable.add(() => this.animate());
    window.addEventListener('resize', () => this.engine.resize());
  }

  // ---------- coordinates ----------

  toWorld(tx: number, ty: number, y = 0) {
    return new Vector3((tx - this.size / 2) * TILE, y, (ty - this.size / 2) * TILE);
  }

  /** Screen position (CSS pixels) of a tile-space point, for DOM labels. */
  project(tx: number, ty: number, height: number) {
    const p = this.toWorld(tx, ty, height);
    const w = this.engine.getRenderWidth();
    const h = this.engine.getRenderHeight();
    const v = Vector3.Project(p, Matrix.Identity(), this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(w, h));
    const scale = this.canvas.clientWidth / w;
    return { x: v.x * scale, y: v.y * scale, visible: v.z > 0 && v.z < 1 };
  }

  /** With groundOnly, buildings are ignored so tiles hidden behind them can still be tapped. */
  pick(px: number, py: number, groundOnly = false): PickResult {
    const hit = this.scene.pick(px, py, (mesh) => mesh === this.ground || (!groundOnly && mesh.metadata?.buildingId != null));
    if (!hit?.hit || !hit.pickedMesh || !hit.pickedPoint) return {};
    const id = hit.pickedMesh.metadata?.buildingId as number | undefined;
    if (id != null) return { buildingId: id };
    const x = Math.floor(hit.pickedPoint.x / TILE + this.size / 2);
    const y = Math.floor(hit.pickedPoint.z / TILE + this.size / 2);
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return {};
    return { tile: { x, y } };
  }

  // ---------- scenery ----------

  private buildBackdrop(glow: GlowLayer) {
    const scene = this.scene;
    const m = this.m;
    const sky = MeshBuilder.CreateSphere('sky', { diameter: 1600, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
    sky.material = m.sky;
    sky.infiniteDistance = true;
    sky.isPickable = false;
    glow.addExcludedMesh(sky);

    const moon = MeshBuilder.CreateSphere('moon', { diameter: 70 }, scene);
    moon.position = new Vector3(-300, 220, 360);
    moon.material = m.moon;
    const ring = MeshBuilder.CreateTorus('moonRing', { diameter: 124, thickness: 2.4, tessellation: 64 }, scene);
    ring.position = moon.position.clone();
    ring.rotation.x = 1.2;
    ring.rotation.z = 0.3;
    ring.material = m.moon;
    const moon2 = MeshBuilder.CreateSphere('moon2', { diameter: 24 }, scene);
    moon2.position = new Vector3(340, 160, 240);
    moon2.material = m.moon2;
    for (const mesh of [moon, ring, moon2]) mesh.isPickable = false;

    const r = rng(7);
    const star = MeshBuilder.CreateSphere('star', { diameter: 1.6, segments: 2 }, scene);
    star.material = m.star;
    for (let i = 0; i < 260; i++) {
      const th = r() * Math.PI * 2;
      const ph = r() * 1.2;
      const inst = star.createInstance('s' + i);
      inst.position = new Vector3(560 * Math.cos(th) * Math.sin(ph), 560 * Math.cos(ph) + 40, 560 * Math.sin(th) * Math.sin(ph));
      inst.scaling.setAll(0.5 + r() * 1.4);
      inst.isPickable = false;
    }
    star.isVisible = false;

    // Rolling land around the play area.
    const half = (this.size * TILE) / 2;
    const flat = (x: number, z: number) => Math.min(1, Math.max(0, (Math.max(Math.abs(x), Math.abs(z)) - half - 6) / 40));
    const hAt = (x: number, z: number) =>
      (Math.sin(x * 0.05) * Math.cos(z * 0.045) * 4 + Math.sin(x * 0.13 + z * 0.09) * 1.6 + Math.cos(z * 0.19 - x * 0.05) * 1) * flat(x, z) * 2.4 - 0.06;
    const g = MeshBuilder.CreateGround('land', { width: 760, height: 760, subdivisions: 140, updatable: true }, scene);
    const pos = g.getVerticesData(VertexBuffer.PositionKind)!;
    const cols: number[] = [];
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const z = pos[i + 2];
      const y = hAt(x, z);
      pos[i + 1] = y;
      const t = Math.min(1, Math.max(0, (y + 2) / 12));
      const k = ((Math.sin(x * 0.2) * Math.cos(z * 0.18) + 1) / 2) * 0.3;
      cols.push(0.08 * (1 - t) + 0.22 * t + 0.3 * k * (1 - t), 0.27 * (1 - t) + 0.16 * t + 0.6 * k * (1 - t), 0.27 * (1 - t) + 0.42 * t + 0.45 * k * (1 - t), 1);
    }
    g.updateVerticesData(VertexBuffer.PositionKind, pos);
    g.setVerticesData(VertexBuffer.ColorKind, cols);
    const normals: number[] = [];
    VertexData.ComputeNormals(pos, g.getIndices()!, normals);
    g.updateVerticesData(VertexBuffer.NormalKind, normals);
    const gm = new StandardMaterial('landMat', scene);
    gm.specularColor = new Color3(0.03, 0.03, 0.05);
    g.material = gm;
    g.receiveShadows = true;
    g.isPickable = false;
    g.position.y = -0.08;

    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + r() * 0.2;
      const d = 250 + r() * 60;
      const h = 22 + r() * 40;
      const mt = MeshBuilder.CreateCylinder('mt', { height: h, diameterTop: r() * 10, diameterBottom: 50 + r() * 50, tessellation: 6 }, scene);
      mt.position = new Vector3(Math.cos(a) * d, h / 2 - 4, Math.sin(a) * d);
      mt.rotation.y = r() * 3;
      mt.material = m.rock;
      mt.isPickable = false;
    }

    // Glowing giant flora beyond the edge of the map.
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2;
      const d = half * 1.15 + r() * 120;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (Math.abs(x) < half + 6 && Math.abs(z) < half + 6) continue;
      const y = hAt(x, z);
      const s = 1.2 + r() * 1.8;
      const stem = MeshBuilder.CreateCylinder('stem', { height: 6 * s, diameterTop: 0.35 * s, diameterBottom: 0.8 * s, tessellation: 8 }, scene);
      stem.position = new Vector3(x, y + 3 * s, z);
      stem.material = m.stem;
      const cap = MeshBuilder.CreateSphere('cap', { diameter: 4 * s, slice: 0.55, segments: 12 }, scene);
      cap.position = new Vector3(x, y + 6 * s, z);
      cap.scaling.y = 0.55;
      cap.material = r() < 0.55 ? m.cyan : m.mag;
      for (const mesh of [stem, cap]) mesh.isPickable = false;
    }
  }

  private buildGround() {
    const n = this.size;
    const tex = new DynamicTexture('mapTex', { width: n * PX, height: n * PX }, this.scene, true);
    tex.anisotropicFilteringLevel = 4;
    const mesh = MeshBuilder.CreateGround('map', { width: n * TILE, height: n * TILE }, this.scene);
    mesh.position.y = 0.02;
    const mat = new StandardMaterial('mapMat', this.scene);
    mat.diffuseTexture = tex;
    mat.specularColor = new Color3(0.03, 0.03, 0.05);
    mat.emissiveColor = new Color3(0.06, 0.06, 0.09);
    mesh.material = mat;
    mesh.receiveShadows = true;
    return { mesh, tex };
  }

  /** Paints terrain, territory shading and the border onto the ground. */
  private drawGround(s: GameState) {
    const n = this.size;
    const ctx = this.groundTex.getContext() as CanvasRenderingContext2D;
    const land = territory(s);
    const base: Record<number, [number, number, number]> = {
      0: [26, 82, 78],
      [LUMENITE]: [84, 56, 138],
      [FERRITE]: [128, 62, 36],
      [ICE]: [132, 182, 204],
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const [r, g, b] = base[s.terrain[i]] ?? base[0];
        const v = hash(i, 3) * 12 - 6;
        const k = land[i] ? 1 : 0.52;
        ctx.fillStyle = `rgb(${(r + v) * k},${(g + v) * k},${(b + v) * k})`;
        ctx.fillRect(x * PX, (n - 1 - y) * PX, PX, PX);
      }
    }
    // Faint grid inside the territory, and a bright border around it.
    ctx.fillStyle = 'rgba(190,255,245,0.07)';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!land[y * n + x]) continue;
        ctx.fillRect(x * PX, (n - 1 - y) * PX, PX, 1);
        ctx.fillRect(x * PX, (n - 1 - y) * PX, 1, PX);
      }
    }
    ctx.fillStyle = 'rgba(83,240,224,0.9)';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!land[y * n + x]) continue;
        const px = x * PX;
        const py = (n - 1 - y) * PX;
        if (x === 0 || !land[y * n + x - 1]) ctx.fillRect(px, py, 2, PX);
        if (x === n - 1 || !land[y * n + x + 1]) ctx.fillRect(px + PX - 2, py, 2, PX);
        if (y === 0 || !land[(y - 1) * n + x]) ctx.fillRect(px, py + PX - 2, PX, 2);
        if (y === n - 1 || !land[(y + 1) * n + x]) ctx.fillRect(px, py, PX, 2);
      }
    }
    this.groundTex.update();
  }

  /** Meshes drawn many times over with thin instances: roads, trees, rocks and deposits. */
  private buildProps(): Record<PropKind | 'road', Mesh> {
    const scene = this.scene;
    const m = this.m;
    const base = (mesh: Mesh, mat: StandardMaterial, lift: number, shadow = true) => {
      mesh.bakeTransformIntoVertices(Matrix.Translation(0, lift, 0));
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      mesh.setEnabled(false);
      if (shadow) this.shadows.addShadowCaster(mesh);
      return mesh;
    };
    const canopy = (name: string, mat: StandardMaterial) => {
      const c = MeshBuilder.CreateSphere(name, { diameter: 1.9, segments: 6 }, scene);
      c.scaling.y = 0.72;
      c.bakeCurrentTransformIntoVertices();
      return base(c, mat, 2.45);
    };
    return {
      road: base(MeshBuilder.CreateBox('road', { width: TILE * 0.98, height: 0.12, depth: TILE * 0.98 }, scene), m.road, 0.06, false),
      trunk: base(MeshBuilder.CreateCylinder('trunk', { height: 2.3, diameterTop: 0.14, diameterBottom: 0.38, tessellation: 6 }, scene), m.stem, 1.15),
      canopyA: canopy('canopyA', m.canopyA),
      canopyB: canopy('canopyB', m.canopyB),
      rock: base(MeshBuilder.CreatePolyhedron('rock', { type: 2, size: 0.62 }, scene), m.stone, 0.3),
      lumenite: base(MeshBuilder.CreateCylinder('lum', { height: 1.6, diameterTop: 0, diameterBottom: 0.42, tessellation: 5 }, scene), m.vio, 0.75),
      ferrite: base(MeshBuilder.CreatePolyhedron('fer', { type: 1, size: 0.34 }, scene), m.rust, 0.15),
      ice: base(MeshBuilder.CreateCylinder('ice', { height: 1.1, diameterTop: 0, diameterBottom: 0.5, tessellation: 4 }, scene), m.ice, 0.5),
    };
  }

  private setInstances(mesh: Mesh, mats: number[]) {
    const count = mats.length / 16;
    mesh.setEnabled(count > 0);
    if (count > 0) mesh.thinInstanceSetBuffer('matrix', new Float32Array(mats), 16, true);
  }

  private pushMatrix(out: number[], x: number, z: number, scale: Vector3, rot: Quaternion) {
    const mat = Matrix.Compose(scale, rot, new Vector3(x, 0, z));
    for (let i = 0; i < 16; i++) out.push(mat.m[i]);
  }

  private syncRoads(s: GameState) {
    const mats: number[] = [];
    const id = Quaternion.Identity();
    const one = Vector3.One();
    for (let i = 0; i < s.roads.length; i++) {
      if (!s.roads[i]) continue;
      const p = this.toWorld((i % s.size) + 0.5, Math.floor(i / s.size) + 0.5);
      this.pushMatrix(mats, p.x, p.z, one, id);
    }
    this.setInstances(this.props.road, mats);
  }

  private syncNature(s: GameState) {
    const occ = occupancy(s);
    const out: Record<PropKind, number[]> = { trunk: [], canopyA: [], canopyB: [], rock: [], lumenite: [], ferrite: [], ice: [] };
    const n = s.size;
    for (let i = 0; i < n * n; i++) {
      const tx = (i % n) + 0.5;
      const ty = Math.floor(i / n) + 0.5;
      const tree = s.trees[i];
      if (tree > 0) {
        const grown = 0.3 + 0.7 * (tree / 100);
        const sc = (0.78 + hash(i, 1) * 0.36) * grown;
        const p = this.toWorld(tx + (hash(i, 2) - 0.5) * 0.4, ty + (hash(i, 4) - 0.5) * 0.4);
        const rot = Quaternion.RotationYawPitchRoll(hash(i, 5) * 6.28, (hash(i, 6) - 0.5) * 0.12, 0);
        const scale = new Vector3(sc, sc * (0.9 + hash(i, 7) * 0.35), sc);
        this.pushMatrix(out.trunk, p.x, p.z, scale, rot);
        this.pushMatrix(hash(i, 8) < 0.62 ? out.canopyA : out.canopyB, p.x, p.z, scale, rot);
      }
      if (s.rocks[i] > 0) {
        const sc = 0.55 + Math.min(1, s.rocks[i] / 10) * 0.65;
        const p = this.toWorld(tx, ty);
        this.pushMatrix(out.rock, p.x, p.z, new Vector3(sc * 1.1, sc * 0.75, sc), Quaternion.RotationYawPitchRoll(hash(i, 9) * 6, hash(i, 10), hash(i, 11)));
      }
      const t = s.terrain[i];
      if (t && !occ[i] && !s.roads[i]) {
        const kind: PropKind = t === LUMENITE ? 'lumenite' : t === FERRITE ? 'ferrite' : 'ice';
        const count = kind === 'ferrite' ? 3 : 2;
        for (let k = 0; k < count; k++) {
          if (hash(i, 20 + k) < 0.25) continue;
          const p = this.toWorld(tx + (hash(i, 30 + k) - 0.5) * 0.7, ty + (hash(i, 40 + k) - 0.5) * 0.7);
          const sc = 0.6 + hash(i, 50 + k) * 0.8;
          const rot = Quaternion.RotationYawPitchRoll(hash(i, 60 + k) * 6, (hash(i, 70 + k) - 0.5) * 0.6, (hash(i, 80 + k) - 0.5) * 0.6);
          this.pushMatrix(out[kind], p.x, p.z, new Vector3(sc, sc, sc), rot);
        }
      }
    }
    for (const k of Object.keys(out) as PropKind[]) this.setInstances(this.props[k], out[k]);
  }

  // ---------- per-frame sync from game state ----------

  sync(s: GameState) {
    if (this.seen.roads !== s.roadsRev) {
      this.seen.roads = s.roadsRev;
      this.syncRoads(s);
      this.seen.nature = -1;
    }
    if (this.seen.ground !== s.buildingsRev) {
      this.seen.ground = s.buildingsRev;
      this.drawGround(s);
      this.seen.nature = -1;
    }
    if (this.seen.nature !== s.natureRev) {
      this.seen.nature = s.natureRev;
      this.syncNature(s);
    }
    this.syncBuildings(s);
    this.syncColonists(s);
  }

  private syncBuildings(s: GameState) {
    const seen = new Set<number>();
    let changed = false;
    for (const b of s.buildings) {
      seen.add(b.id);
      const key = `${b.type}:${b.level}:${b.site ? b.site.toLevel : 0}`;
      let view = this.buildings.get(b.id);
      if (!view || view.key !== key) {
        view?.node.dispose();
        view = this.makeBuilding(b, key);
        this.buildings.set(b.id, view);
        changed = true;
      }
      if (b.site) {
        const p = Math.min(1, b.site.work / Math.max(1, b.site.total));
        if (view.rising) {
          view.rising.setEnabled(p > 0.01);
          view.rising.scaling.y = Math.max(0.02, p);
        }
        const pileKey = entries(b.site.have)
          .map(([g, n]) => `${g}${n}`)
          .join(',');
        if (pileKey !== view.pileKey) {
          view.pile?.dispose();
          view.pile = this.makePile(b, view.node);
          view.pileKey = pileKey;
        }
      }
    }
    for (const [id, v] of this.buildings) {
      if (!seen.has(id)) {
        v.node.dispose();
        this.buildings.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.spinners = [];
      for (const v of this.buildings.values()) for (const d of v.node.getDescendants(false)) if (d.metadata?.spin) this.spinners.push(d as TransformNode);
    }
  }

  private makeBuilding(b: Building, key: string): BuildingView {
    const def = BUILDINGS[b.type];
    const root = new TransformNode('b' + b.id, this.scene);
    root.position = this.toWorld(b.x + def.size / 2, b.y + def.size / 2);
    let rising: TransformNode | undefined;
    if (b.level > 0) MODELS[b.type](this.scene, this.m, b.level).parent = root;
    if (b.site) {
      const w = def.size * TILE * 0.9;
      if (b.level === 0) {
        part(MeshBuilder.CreateBox('slab', { width: w, height: 0.2, depth: w }, this.scene), root, this.m.dark, 0.1);
        rising = new TransformNode('rising', this.scene);
        rising.parent = root;
        MODELS[b.type](this.scene, this.m, 1).parent = rising;
        rising.setEnabled(false);
      }
      const sc = MeshBuilder.CreateBox('scaffold', { width: w, height: 3.2, depth: w }, this.scene);
      sc.position.y = 1.6;
      sc.material = this.m.scaffold;
      sc.parent = root;
      for (const [x, z] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        part(MeshBuilder.CreateCylinder('pole', { height: 3.4, diameter: 0.12, tessellation: 6 }, this.scene), root, this.m.trim, 1.7, (x * w) / 2, (z * w) / 2);
      }
    }
    for (const mesh of root.getChildMeshes(false)) {
      mesh.metadata = { ...(mesh.metadata ?? {}), buildingId: b.id };
      mesh.receiveShadows = true;
      if (mesh.name !== 'scaffold') this.shadows.addShadowCaster(mesh);
    }
    return { node: root, key, rising, pileKey: '' };
  }

  /** Crates of delivered materials stacked in a corner of a construction site. */
  private makePile(b: Building, parent: TransformNode) {
    const node = new TransformNode('pile', this.scene);
    node.parent = parent;
    const n = BUILDINGS[b.type].size;
    const corner = (n * TILE) / 2 - 0.55;
    let k = 0;
    for (const [g, count] of entries(b.site!.have)) {
      for (let i = 0; i < Math.min(count, 6) && k < 12; i++, k++) {
        const inst = this.crates.get(g)!.createInstance('pc');
        inst.parent = node;
        inst.scaling.setAll(1.3);
        inst.position = new Vector3(corner - (k % 3) * 0.48, 0.42 + Math.floor(k / 6) * 0.45, corner - (Math.floor(k / 3) % 2) * 0.48);
        inst.isPickable = false;
        inst.metadata = { buildingId: b.id };
      }
    }
    return node;
  }

  private syncColonists(s: GameState) {
    const seen = new Set<number>();
    const now = performance.now();
    for (const c of s.colonists) {
      seen.add(c.id);
      let v = this.colonists.get(c.id);
      if (!v) {
        const root = colonistModel(this.scene, this.parts, c.id % 3 === 0);
        root.scaling.setAll(1.7);
        v = { root, lx: c.x, ly: c.y, phase: (c.id * 1.7) % 6 };
        this.colonists.set(c.id, v);
      }
      v.root.setEnabled(c.inside == null);
      if (c.inside != null) {
        v.lx = c.x;
        v.ly = c.y;
        continue;
      }
      // Idle colonists spread out a little so they don't stand in one spot.
      const idle = !c.job;
      const ox = idle ? Math.cos(c.id * 2.4) * 0.3 : 0;
      const oy = idle ? Math.sin(c.id * 2.4) * 0.3 : 0;
      const dx = c.x - v.lx;
      const dy = c.y - v.ly;
      const moving = Math.hypot(dx, dy) > 0.0005;
      const job = c.job;
      const building = job?.kind === 'build' && job.stage === 'work';
      const harvesting = job?.kind === 'work' && job.stage === 'harvest';
      if (moving) v.root.rotation.y = -Math.atan2(dy, dx);
      else if (building) {
        const b = byId(s, job.site);
        if (b) {
          const n = BUILDINGS[b.type].size;
          v.root.rotation.y = -Math.atan2(b.y + n / 2 - c.y, b.x + n / 2 - c.x);
        }
      } else if (harvesting && job.node >= 0) {
        v.root.rotation.y = -Math.atan2(Math.floor(job.node / s.size) + 0.5 - c.y, (job.node % s.size) + 0.5 - c.x);
      }
      let bob = 0;
      if (!this.reduceMotion) {
        if (moving) bob = Math.abs(Math.sin(now / 90 + v.phase)) * 0.12;
        else if (building || harvesting) bob = Math.abs(Math.sin(now / 140 + v.phase)) * 0.22;
      }
      v.root.position = this.toWorld(c.x + ox, c.y + oy, 0.1 + bob);
      const good = c.carry?.good;
      if (good !== v.crateGood) {
        v.crate?.dispose();
        v.crate = undefined;
        if (good) {
          const crate = this.crates.get(good)!.createInstance('carry');
          crate.parent = v.root;
          crate.position = new Vector3(0.26, 0.62, 0);
          crate.isPickable = false;
          v.crate = crate;
        }
        v.crateGood = good;
      }
      v.lx = c.x;
      v.ly = c.y;
    }
    for (const [id, v] of this.colonists) {
      if (!seen.has(id)) {
        v.root.dispose();
        this.colonists.delete(id);
      }
    }
  }

  private animate() {
    const dt = this.engine.getDeltaTime() / 1000;
    if (!this.reduceMotion) for (const node of this.spinners) node.rotation.y += node.metadata.spin * dt;
    const cam = this.camera;
    // Panning feels the same at any zoom.
    cam.panningSensibility = Math.max(8, 2600 / cam.radius);
    // Keep the camera over the map.
    const lim = (this.size * TILE) / 2;
    const t = cam.target;
    t.x = Math.max(-lim, Math.min(lim, t.x));
    t.z = Math.max(-lim, Math.min(lim, t.z));
    t.y = 0;
  }

  // ---------- overlays ----------

  setGhost(type: BuildingType | null, x = 0, y = 0, ok = false) {
    if (!type) {
      this.ghost?.node.dispose();
      this.ghost = null;
      return;
    }
    if (!this.ghost || this.ghost.type !== type) {
      this.ghost?.node.dispose();
      const node = new TransformNode('ghost', this.scene);
      const model = MODELS[type](this.scene, this.m, 1);
      model.parent = node;
      model.getChildMeshes().forEach((mm) => {
        mm.visibility = 0.55;
        mm.isPickable = false;
      });
      const w = BUILDINGS[type].size * TILE;
      const pad = MeshBuilder.CreateBox('pad', { width: w, height: 0.08, depth: w }, this.scene);
      pad.parent = node;
      pad.isPickable = false;
      this.ghost = { type, node, pad };
    }
    const n = BUILDINGS[type].size;
    this.ghost.node.position = this.toWorld(x + n / 2, y + n / 2, 0.05);
    this.ghost.pad.material = ok ? this.m.ghostOk : this.m.ghostBad;
  }

  setAnchor(tile: { x: number; y: number } | null) {
    this.anchor.setEnabled(!!tile);
    if (tile) this.anchor.position = this.toWorld(tile.x + 0.5, tile.y + 0.5, 0.1);
  }

  setSelected(b: Building | null) {
    this.selectRing.setEnabled(!!b);
    if (!b) return;
    const n = BUILDINGS[b.type].size;
    this.selectRing.position = this.toWorld(b.x + n / 2, b.y + n / 2, 0.15);
    this.selectRing.scaling.setAll(n * TILE * 0.95);
  }

  /** Shows how far a building reaches: a gatherer's or forester's work area, or the land a beacon claims. */
  setRadius(type: BuildingType | null, x = 0, y = 0, level = 1) {
    const d = type ? BUILDINGS[type] : null;
    const table = d?.gather?.radius ?? d?.plant?.radius ?? (d?.kind === 'beacon' ? d.territory : undefined);
    const r = d ? lv(table, Math.max(1, level)) : 0;
    this.radiusRing.setEnabled(r > 0);
    if (!d || r <= 0) return;
    this.radiusRing.position = this.toWorld(x + d.size / 2, y + d.size / 2, 0.2);
    this.radiusRing.scaling.setAll(r * TILE);
  }

  focus(tx: number, ty: number) {
    const p = this.toWorld(tx, ty);
    this.camera.target.x = p.x;
    this.camera.target.z = p.z;
  }
}
