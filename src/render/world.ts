import {
  AbstractMesh,
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
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import { BUILDINGS, type BuildingType } from '../sim/config';
import { occupancy } from '../sim/game';
import { rng } from '../sim/map';
import { DEPOSIT, ROCK, type Building, type GameState } from '../sim/state';
import { makeMaterials, type Materials } from './materials';
import { MODELS, colonistModel } from './models';

/** World units per tile. */
export const TILE = 2;

interface BuildingView {
  node: TransformNode;
  key: string;
}

interface ColonistView {
  root: TransformNode;
  crate: Mesh;
  lx: number;
  ly: number;
  phase: number;
}

export interface PickResult {
  tile?: { x: number; y: number };
  buildingId?: number;
}

export class World {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private readonly m: Materials;
  private readonly shadows: ShadowGenerator;
  private readonly size: number;
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly mapGround: Mesh;
  private readonly roadBase: Mesh;
  private readonly roads = new Map<number, InstancedMesh>();
  private readonly buildings = new Map<number, BuildingView>();
  private readonly colonists = new Map<number, ColonistView>();
  private readonly crystals = new Map<number, Mesh[]>();
  private readonly selectRing: Mesh;
  private readonly anchor: Mesh;
  private ghost: { type: BuildingType; node: TransformNode; pad: Mesh } | null = null;
  private occupiedKey = '';
  private spinners: AbstractMesh[] = [];

  constructor(private readonly canvas: HTMLCanvasElement, state: GameState) {
    this.size = state.size;
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true }, false);
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
    const scene = (this.scene = new Scene(this.engine));
    scene.clearColor = new Color4(0.04, 0.03, 0.1, 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.006;
    scene.fogColor = Color3.FromHexString('#2a1d4a');
    this.m = makeMaterials(scene);

    const cam = (this.camera = new ArcRotateCamera('cam', -Math.PI / 2.6, 0.95, 52, Vector3.Zero(), scene));
    cam.lowerRadiusLimit = 14;
    cam.upperRadiusLimit = 95;
    cam.lowerBetaLimit = 0.3;
    cam.upperBetaLimit = 1.32;
    cam.wheelDeltaPercentage = 0.01;
    cam.pinchDeltaPercentage = 0.004;
    cam.panningSensibility = 60;
    cam.panningAxis = new Vector3(1, 0, 1);
    cam.attachControl(canvas, true);

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.6;
    hemi.diffuse = Color3.FromHexString('#b9a8ff');
    hemi.groundColor = Color3.FromHexString('#1f6f6a');
    const sun = new DirectionalLight('sun', new Vector3(-0.6, -1, 0.4), scene);
    sun.position = new Vector3(60, 90, -40);
    sun.intensity = 1.25;
    sun.diffuse = Color3.FromHexString('#ffd9b0');
    this.shadows = new ShadowGenerator(1024, sun);
    this.shadows.useBlurExponentialShadowMap = true;
    this.shadows.blurKernel = 16;
    this.shadows.darkness = 0.35;
    const glow = new GlowLayer('glow', scene);
    glow.intensity = 0.8;

    this.buildBackdrop(glow);
    this.mapGround = this.buildMapGround(state);
    this.buildTerrainProps(state);

    this.roadBase = MeshBuilder.CreateBox('road', { width: TILE * 0.98, height: 0.12, depth: TILE * 0.98 }, scene);
    this.roadBase.material = this.m.road;
    this.roadBase.receiveShadows = true;
    this.roadBase.isPickable = false;
    this.roadBase.setEnabled(false);

    this.selectRing = MeshBuilder.CreateTorus('select', { diameter: 1, thickness: 0.06, tessellation: 48 }, scene);
    this.selectRing.material = this.m.select;
    this.selectRing.isPickable = false;
    this.selectRing.setEnabled(false);

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
    const hit = this.scene.pick(px, py, (mesh) => mesh === this.mapGround || (!groundOnly && mesh.metadata?.buildingId != null));
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
    const sky = MeshBuilder.CreateSphere('sky', { diameter: 600, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
    sky.material = m.sky;
    sky.infiniteDistance = true;
    sky.isPickable = false;
    glow.addExcludedMesh(sky);

    const moon = MeshBuilder.CreateSphere('moon', { diameter: 36 }, scene);
    moon.position = new Vector3(-150, 110, 180);
    moon.material = m.moon;
    const ring = MeshBuilder.CreateTorus('moonRing', { diameter: 64, thickness: 1.2, tessellation: 64 }, scene);
    ring.position = moon.position.clone();
    ring.rotation.x = 1.2;
    ring.rotation.z = 0.3;
    ring.material = m.moon;
    const moon2 = MeshBuilder.CreateSphere('moon2', { diameter: 12 }, scene);
    moon2.position = new Vector3(170, 80, 120);
    moon2.material = m.moon2;

    const r = rng(7);
    const star = MeshBuilder.CreateSphere('star', { diameter: 0.9, segments: 2 }, scene);
    star.material = m.star;
    for (let i = 0; i < 220; i++) {
      const th = r() * Math.PI * 2;
      const ph = r() * 1.2;
      const inst = star.createInstance('s' + i);
      inst.position = new Vector3(270 * Math.cos(th) * Math.sin(ph), 270 * Math.cos(ph) + 20, 270 * Math.sin(th) * Math.sin(ph));
      inst.scaling.setAll(0.5 + r() * 1.4);
      inst.isPickable = false;
    }
    star.isVisible = false;

    // Rolling land around the build area.
    const half = (this.size * TILE) / 2;
    const flat = (x: number, z: number) => Math.min(1, Math.max(0, (Math.hypot(x, z) - half * 1.5) / 30));
    const hAt = (x: number, z: number) =>
      (Math.sin(x * 0.07) * Math.cos(z * 0.06) * 3 + Math.sin(x * 0.17 + z * 0.11) * 1.2 + Math.cos(z * 0.23 - x * 0.05) * 0.8) * flat(x, z) * 2.2 - 0.05;
    const g = MeshBuilder.CreateGround('land', { width: 340, height: 340, subdivisions: 120, updatable: true }, scene);
    const pos = g.getVerticesData(VertexBuffer.PositionKind)!;
    const cols: number[] = [];
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const z = pos[i + 2];
      const y = hAt(x, z);
      pos[i + 1] = y;
      const t = Math.min(1, Math.max(0, (y + 2) / 9));
      const k = ((Math.sin(x * 0.3) * Math.cos(z * 0.27) + 1) / 2) * 0.3;
      cols.push(0.1 * (1 - t) + 0.22 * t + 0.3 * k * (1 - t), 0.33 * (1 - t) + 0.16 * t + 0.6 * k * (1 - t), 0.32 * (1 - t) + 0.42 * t + 0.45 * k * (1 - t), 1);
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

    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2;
      const d = 125 + r() * 30;
      const h = 12 + r() * 22;
      const mt = MeshBuilder.CreateCylinder('mt', { height: h, diameterTop: r() * 6, diameterBottom: 30 + r() * 30, tessellation: 6 }, scene);
      mt.position = new Vector3(Math.cos(a) * d, h / 2 - 3, Math.sin(a) * d);
      mt.rotation.y = r() * 3;
      mt.material = m.rock;
      mt.isPickable = false;
    }

    // Glowing flora outside the build square.
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = half * 1.25 + r() * 60;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (Math.abs(x) < half + 3 && Math.abs(z) < half + 3) continue;
      const y = hAt(x, z);
      const s = 0.8 + r() * 1.3;
      if (r() < 0.6) {
        const stem = MeshBuilder.CreateCylinder('stem', { height: 6 * s, diameterTop: 0.35 * s, diameterBottom: 0.8 * s, tessellation: 8 }, scene);
        stem.position = new Vector3(x, y + 3 * s, z);
        stem.material = m.stem;
        const cap = MeshBuilder.CreateSphere('cap', { diameter: 4 * s, slice: 0.55, segments: 12 }, scene);
        cap.position = new Vector3(x, y + 6 * s, z);
        cap.scaling.y = 0.55;
        cap.material = r() < 0.55 ? m.cyan : m.mag;
        for (const mesh of [stem, cap]) {
          mesh.isPickable = false;
          this.shadows.addShadowCaster(mesh);
        }
      } else {
        for (let k = 0; k < 6; k++) {
          const f = MeshBuilder.CreateCylinder('fern', { height: 2.6 * s, diameterTop: 0, diameterBottom: 0.5 * s, tessellation: 4 }, scene);
          f.position = new Vector3(x, y + 1.1 * s, z);
          f.rotation = new Vector3(Math.cos(k) * 0.7, 0, Math.sin(k) * 0.7);
          f.material = m.leaf;
          f.isPickable = false;
        }
      }
    }
  }

  private buildMapGround(state: GameState) {
    const n = this.size;
    const px = 32;
    const tex = new DynamicTexture('mapTex', { width: n * px, height: n * px }, this.scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const r = rng(state.seed + 11);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const t = state.terrain[y * n + x];
        const cy = (n - 1 - y) * px;
        const v = r() * 10;
        ctx.fillStyle = t === DEPOSIT ? `rgb(${70 + v},${46 + v},${120 + v})` : `rgb(${24 + v},${78 + v},${76 + v})`;
        ctx.fillRect(x * px, cy, px, px);
      }
    }
    ctx.strokeStyle = 'rgba(180,255,240,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * px + 0.5, 0);
      ctx.lineTo(i * px + 0.5, n * px);
      ctx.moveTo(0, i * px + 0.5);
      ctx.lineTo(n * px, i * px + 0.5);
      ctx.stroke();
    }
    tex.update();
    const ground = MeshBuilder.CreateGround('map', { width: n * TILE, height: n * TILE }, this.scene);
    ground.position.y = 0.02;
    const mat = new StandardMaterial('mapMat', this.scene);
    mat.diffuseTexture = tex;
    mat.specularColor = new Color3(0.03, 0.03, 0.05);
    mat.emissiveColor = new Color3(0.05, 0.05, 0.08);
    ground.material = mat;
    ground.receiveShadows = true;
    return ground;
  }

  private buildTerrainProps(state: GameState) {
    const r = rng(state.seed + 5);
    const n = this.size;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const t = state.terrain[y * n + x];
        if (t === ROCK) {
          const rock = MeshBuilder.CreatePolyhedron('rock', { type: 2, size: 0.55 + r() * 0.35 }, this.scene);
          rock.position = this.toWorld(x + 0.5, y + 0.5, 0.35);
          rock.rotation = new Vector3(r() * 3, r() * 3, r() * 3);
          rock.scaling.y = 0.7;
          rock.material = this.m.rock;
          rock.isPickable = false;
          this.shadows.addShadowCaster(rock);
        } else if (t === DEPOSIT) {
          const list: Mesh[] = [];
          for (let k = 0; k < 2; k++) {
            const h = 0.8 + r() * 1.4;
            const c = MeshBuilder.CreateCylinder('crystal', { height: h, diameterTop: 0, diameterBottom: 0.35 + r() * 0.3, tessellation: 5 }, this.scene);
            c.position = this.toWorld(x + 0.2 + r() * 0.6, y + 0.2 + r() * 0.6, h / 2 - 0.05);
            c.rotation = new Vector3((r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6);
            c.material = this.m.vio;
            c.isPickable = false;
            list.push(c);
          }
          this.crystals.set(y * n + x, list);
        }
      }
    }
  }

  // ---------- per-frame sync from game state ----------

  sync(s: GameState, now: number) {
    this.syncRoads(s);
    this.syncBuildings(s, now);
    this.syncColonists(s);
  }

  private syncRoads(s: GameState) {
    for (let i = 0; i < s.roads.length; i++) {
      const has = this.roads.get(i);
      if (s.roads[i] && !has) {
        const inst = this.roadBase.createInstance('r' + i);
        inst.position = this.toWorld((i % s.size) + 0.5, Math.floor(i / s.size) + 0.5, 0.06);
        inst.isPickable = false;
        this.roads.set(i, inst);
      } else if (!s.roads[i] && has) {
        has.dispose();
        this.roads.delete(i);
      }
    }
  }

  private syncBuildings(s: GameState, now: number) {
    const seen = new Set<number>();
    for (const b of s.buildings) {
      seen.add(b.id);
      const key = `${b.type}:${b.level}:${b.pending ? b.pending.toLevel : 0}`;
      const view = this.buildings.get(b.id);
      if (!view || view.key !== key) {
        view?.node.dispose();
        this.buildings.set(b.id, { node: this.makeBuilding(b), key });
      }
      const v = this.buildings.get(b.id)!;
      const scaffold = v.node.getChildMeshes(false).find((mm) => mm.name === 'scaffold');
      if (scaffold && b.pending) {
        const p = Math.min(1, (now - b.pending.startAt) / Math.max(1, b.pending.endAt - b.pending.startAt));
        scaffold.rotation.y = p * Math.PI * 2;
      }
    }
    for (const [id, v] of this.buildings) {
      if (!seen.has(id)) {
        v.node.dispose();
        this.buildings.delete(id);
      }
    }
    const occKey = s.buildings.map((b) => b.id).join(',');
    if (occKey !== this.occupiedKey) {
      this.occupiedKey = occKey;
      const occ = occupancy(s);
      for (const [tile, meshes] of this.crystals) meshes.forEach((mm) => mm.setEnabled(!occ[tile]));
    }
    this.spinners = [];
    for (const v of this.buildings.values()) for (const mm of v.node.getChildMeshes(false)) if (mm.metadata?.spin) this.spinners.push(mm);
  }

  private makeBuilding(b: Building) {
    const def = BUILDINGS[b.type];
    const root = new TransformNode('b' + b.id, this.scene);
    root.position = this.toWorld(b.x + def.size / 2, b.y + def.size / 2);
    if (b.level > 0) MODELS[b.type](this.scene, this.m, b.level).parent = root;
    if (b.pending) {
      const w = def.size * TILE * 0.85;
      const sc = MeshBuilder.CreateBox('scaffold', { width: w, height: 3, depth: w }, this.scene);
      sc.position.y = 1.5;
      sc.material = this.m.scaffold;
      sc.parent = root;
      if (b.level === 0) {
        const slab = MeshBuilder.CreateBox('slab', { width: w, height: 0.25, depth: w }, this.scene);
        slab.position.y = 0.12;
        slab.material = this.m.dark;
        slab.parent = root;
      }
    }
    for (const mesh of root.getChildMeshes(false)) {
      mesh.metadata = { ...(mesh.metadata ?? {}), buildingId: b.id };
      mesh.receiveShadows = true;
      if (mesh.name !== 'scaffold') this.shadows.addShadowCaster(mesh);
    }
    return root;
  }

  private syncColonists(s: GameState) {
    const seen = new Set<number>();
    for (const c of s.colonists) {
      seen.add(c.id);
      let v = this.colonists.get(c.id);
      if (!v) {
        const { root, crate } = colonistModel(this.scene, this.m, c.id % 3 === 0);
        root.scaling.setAll(1.7);
        root.getChildMeshes().forEach((mm) => {
          mm.isPickable = false;
          this.shadows.addShadowCaster(mm);
        });
        v = { root, crate, lx: c.x, ly: c.y, phase: Math.random() * 6 };
        this.colonists.set(c.id, v);
      }
      // Idle colonists spread out a little so they don't stack in one spot.
      const off = c.task === 'idle' ? 0.35 : 0;
      const ox = Math.cos(c.id * 2.4) * off;
      const oy = Math.sin(c.id * 2.4) * off;
      const dx = c.x - v.lx;
      const dy = c.y - v.ly;
      const moving = Math.hypot(dx, dy) > 0.0005;
      if (moving) v.root.rotation.y = -Math.atan2(dy, dx);
      const bob = moving && !this.reduceMotion ? Math.abs(Math.sin(performance.now() / 90 + v.phase)) * 0.12 : 0;
      v.root.position = this.toWorld(c.x + ox, c.y + oy, 0.1 + bob);
      v.crate.setEnabled(c.carry > 0);
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
    if (!this.reduceMotion) for (const mm of this.spinners) mm.rotation.y += mm.metadata.spin * dt;
    // Keep the camera over the colony.
    const lim = (this.size * TILE) / 2;
    const t = this.camera.target;
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

  focus(tx: number, ty: number) {
    const p = this.toWorld(tx, ty);
    this.camera.target.x = p.x;
    this.camera.target.z = p.z;
  }

  run() {
    this.engine.runRenderLoop(() => this.scene.render());
  }
}
