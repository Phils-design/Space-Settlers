import { ArcRotateCamera, Matrix, Plane, Ray, Scene, Vector3 } from '@babylonjs/core';

/**
 * Map-style camera controls:
 * - one finger (or left mouse) drags the map, and the ground stays under the finger
 * - two fingers twist to turn, slide up and down together to tilt, and pinch to zoom
 * - right or middle mouse drag turns and tilts, and the mouse wheel zooms (Babylon's wheel input)
 *
 * Babylon's own pointer input is removed because it spins on one finger.
 */
export class CameraControls {
  private readonly pts = new Map<number, { x: number; y: number }>();
  private readonly ground = new Plane(0, 1, 0, 0);
  /** Mouse button held for turning, or -1. */
  private turnButton = -1;
  /** Pan speed left over after the finger lifts, in world units per second. */
  private vel = { x: 0, z: 0 };
  private lastMove = 0;

  constructor(
    private readonly scene: Scene,
    private readonly cam: ArcRotateCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly reduceMotion: boolean,
  ) {
    cam.inputs.removeByType('ArcRotateCameraPointersInput');
    cam.inertia = reduceMotion ? 0 : 0.6;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    scene.onBeforeRenderObservable.add(() => this.glide());
  }

  private local(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Where a screen point meets the ground plane, or null near the horizon. */
  private groundAt(x: number, y: number): Vector3 | null {
    const ray: Ray = this.scene.createPickingRay(x, y, Matrix.Identity(), this.cam);
    const d = ray.intersectsPlane(this.ground);
    if (d == null || d < 0 || d > this.cam.maxZ) return null;
    return ray.origin.add(ray.direction.scale(d));
  }

  private readonly down = (e: PointerEvent) => {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.vel = { x: 0, z: 0 };
    if (e.pointerType === 'mouse' && e.button !== 0) {
      this.turnButton = e.button;
      this.pts.set(e.pointerId, this.local(e));
      return;
    }
    this.pts.set(e.pointerId, this.local(e));
  };

  private readonly move = (e: PointerEvent) => {
    const prev = this.pts.get(e.pointerId);
    if (!prev) return;
    const cur = this.local(e);
    if (this.turnButton >= 0 && e.pointerType === 'mouse') {
      this.turn((cur.x - prev.x) * 0.008, (cur.y - prev.y) * 0.006);
      this.pts.set(e.pointerId, cur);
      return;
    }
    if (this.pts.size === 1) {
      this.pan(prev, cur);
      this.pts.set(e.pointerId, cur);
      return;
    }
    if (this.pts.size === 2) {
      const [ida, idb] = [...this.pts.keys()];
      const other = this.pts.get(ida === e.pointerId ? idb : ida)!;
      // Twist: change in the angle of the line between the fingers.
      const a0 = Math.atan2(other.y - prev.y, other.x - prev.x);
      const a1 = Math.atan2(other.y - cur.y, other.x - cur.x);
      let da = a1 - a0;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      // Pinch: change in the distance between the fingers.
      const d0 = Math.hypot(other.x - prev.x, other.y - prev.y);
      const d1 = Math.hypot(other.x - cur.x, other.y - cur.y);
      // Tilt: both fingers sliding up or down. Each finger's move counts half.
      const dy = (cur.y - prev.y) / 2;
      this.turn(da, dy * 0.006);
      if (d0 > 20 && d1 > 20) this.zoom(d0 / d1);
      this.pts.set(e.pointerId, cur);
    }
  };

  private readonly up = (e: PointerEvent) => {
    this.pts.delete(e.pointerId);
    if (e.pointerType === 'mouse') this.turnButton = -1;
    // Only keep gliding if the finger was still moving when it lifted.
    if (performance.now() - this.lastMove > 80 || this.pts.size > 0 || this.reduceMotion) this.vel = { x: 0, z: 0 };
  };

  private pan(from: { x: number; y: number }, to: { x: number; y: number }) {
    const a = this.groundAt(from.x, from.y);
    const b = this.groundAt(to.x, to.y);
    if (!a || !b) return;
    let dx = a.x - b.x;
    let dz = a.z - b.z;
    // Near the horizon a tiny finger move covers a huge distance, so cap it.
    const max = this.cam.radius * 0.25;
    const len = Math.hypot(dx, dz);
    if (len > max) {
      dx *= max / len;
      dz *= max / len;
    }
    this.cam.target.x += dx;
    this.cam.target.z += dz;
    const now = performance.now();
    const dt = Math.max(0.008, (now - this.lastMove) / 1000);
    this.lastMove = now;
    const k = 0.6;
    this.vel = { x: this.vel.x * (1 - k) + (dx / dt) * k, z: this.vel.z * (1 - k) + (dz / dt) * k };
  }

  private turn(dAlpha: number, dBeta: number) {
    const c = this.cam;
    c.alpha += dAlpha;
    c.beta = Math.min(c.upperBetaLimit ?? 1.5, Math.max(c.lowerBetaLimit ?? 0.1, c.beta - dBeta));
  }

  private zoom(factor: number) {
    const c = this.cam;
    c.radius = Math.min(c.upperRadiusLimit ?? 500, Math.max(c.lowerRadiusLimit ?? 1, c.radius * factor));
  }

  /** Lets the map coast to a stop after a flick. */
  private glide() {
    if (this.pts.size > 0) return;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp < 0.5) return;
    const dt = Math.min(0.05, this.scene.getEngine().getDeltaTime() / 1000);
    this.cam.target.x += this.vel.x * dt;
    this.cam.target.z += this.vel.z * dt;
    const decay = Math.exp(-5 * dt);
    this.vel.x *= decay;
    this.vel.z *= decay;
  }
}
