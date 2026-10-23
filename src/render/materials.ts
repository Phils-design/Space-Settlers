import { Color3, Scene, StandardMaterial } from '@babylonjs/core';

const hex = (h: string) => Color3.FromHexString(h);

export function makeMaterials(scene: Scene) {
  const mat = (name: string, col: string, o: { em?: string; spec?: string; alpha?: number; noFog?: boolean; back?: boolean } = {}) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = hex(col);
    m.specularColor = o.spec ? hex(o.spec) : new Color3(0.15, 0.15, 0.18);
    if (o.em) m.emissiveColor = hex(o.em);
    if (o.alpha != null) m.alpha = o.alpha;
    if (o.noFog) m.fogEnabled = false;
    if (o.back) m.backFaceCulling = false;
    return m;
  };
  return {
    metal: mat('metal', '#c9d1e2', { spec: '#ffffff' }),
    dark: mat('dark', '#4a5268'),
    trim: mat('trim', '#ffb547', { em: '#4a2a00' }),
    gold: mat('gold', '#ffd27a', { em: '#5a3f00', spec: '#ffffff' }),
    glass: mat('glass', '#8ee8ff', { alpha: 0.32, spec: '#ffffff', em: '#0b3b4a', back: true }),
    panel: mat('panel', '#203d7a', { spec: '#9cc0ff' }),
    suit: mat('suit', '#f08a3c'),
    suit2: mat('suit2', '#f2c94c'),
    visor: mat('visor', '#0d2230', { em: '#4fd1c5' }),
    crate: mat('crate', '#8a5cff', { em: '#3a1d8a' }),
    cyan: mat('cyan', '#53f0e0', { em: '#2bd9c8' }),
    mag: mat('mag', '#ff6bd6', { em: '#d93fb3' }),
    vio: mat('vio', '#a77bff', { em: '#7b4dff' }),
    stem: mat('stem', '#2e5f68'),
    rock: mat('rock', '#3b3266'),
    leaf: mat('leaf', '#2fbf8a', { em: '#0d3a2a' }),
    road: mat('road', '#7b84a3', { spec: '#222633', em: '#1c2236' }),
    roadEdge: mat('roadEdge', '#53f0e0', { em: '#1e9c90' }),
    scaffold: (() => {
      const m = mat('scaffold', '#53f0e0', { em: '#53f0e0' });
      m.wireframe = true;
      return m;
    })(),
    ghostOk: mat('ghostOk', '#4fd18a', { em: '#2f8f5a', alpha: 0.45 }),
    ghostBad: mat('ghostBad', '#ff6b5e', { em: '#8f2f2a', alpha: 0.45 }),
    select: mat('select', '#ffb547', { em: '#ffb547' }),
    moon: mat('moon', '#e9d6ff', { em: '#9d86c9', noFog: true }),
    moon2: mat('moon2', '#ffc79a', { em: '#c48356', noFog: true }),
    sky: (() => {
      const m = mat('sky', '#000000', { em: '#24184a', noFog: true });
      m.disableLighting = true;
      m.backFaceCulling = false;
      return m;
    })(),
    star: (() => {
      const m = mat('star', '#ffffff', { em: '#ffffff', noFog: true });
      m.disableLighting = true;
      return m;
    })(),
  };
}

export type Materials = ReturnType<typeof makeMaterials>;
