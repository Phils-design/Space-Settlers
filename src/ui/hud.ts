import { BUILDABLE, BUILDINGS, CONFIG, type BuildingType } from '../sim/config';
import { buildingStatus, canPlace, canUpgrade, countOf, lv, maxCountOf, speedUpCost, stats } from '../sim/game';
import { connectedToHub, isConnected } from '../sim/path';
import { byId, hub, type Building, type GameState } from '../sim/state';
import { CARD_ART, ICON } from './icons';

export type Mode =
  | { kind: 'view' }
  | { kind: 'menu' }
  | { kind: 'place'; type: BuildingType; x: number; y: number }
  | { kind: 'road'; anchor: { x: number; y: number } | null; remove: boolean };

export interface UiState {
  mode: Mode;
  selected: number | null;
  goalsMin: boolean;
  settings: boolean;
  confirmReset: boolean;
}

export interface Projector {
  project(tx: number, ty: number, height: number): { x: number; y: number; visible: boolean };
}

export function fmtTime(sec: number) {
  sec = Math.max(0, Math.ceil(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${String(sec % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const n = (v: number) => Math.floor(v).toLocaleString('en-US');

interface LabelInfo {
  id: number;
  tx: number;
  ty: number;
  h: number;
  html: string;
}

export class Hud {
  private readonly top = document.createElement('div');
  private readonly goals = document.createElement('section');
  private readonly bottom = document.createElement('div');
  private readonly labelLayer = document.createElement('div');
  private readonly menu = document.createElement('section');
  private readonly toastEl = document.createElement('div');
  private readonly cache = new WeakMap<HTMLElement, string>();
  private readonly labelEls = new Map<number, HTMLDivElement>();
  private labelInfo: LabelInfo[] = [];
  private toastTimer = 0;

  constructor(root: HTMLElement, onAction: (action: string, arg?: string) => void) {
    this.top.className = 'top';
    this.goals.className = 'goals';
    this.bottom.className = 'bottom';
    this.labelLayer.className = 'labels';
    this.menu.className = 'menu';
    this.toastEl.className = 'toast';
    this.toastEl.style.opacity = '0';
    this.toastEl.setAttribute('role', 'status');
    root.append(this.labelLayer, this.top, this.goals, this.bottom, this.menu, this.toastEl);
    root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!btn || (btn as HTMLButtonElement).disabled) return;
      onAction(btn.dataset.action!, btn.dataset.arg);
    });
  }

  private set(el: HTMLElement, html: string) {
    if (this.cache.get(el) === html) return;
    this.cache.set(el, html);
    el.innerHTML = html;
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.style.opacity = '0'), 2200);
  }

  render(s: GameState, ui: UiState, now: number) {
    const st = stats(s);
    const lowPower = st.powerUse > st.powerGen;
    this.set(
      this.top,
      `<div class="res">
        <span class="chip" title="Ore">${ICON.ore}${n(s.ore)}<small>/${n(st.oreCap)}</small></span>
        <span class="chip${lowPower ? ' warn' : ''}" title="Power made / used">${ICON.power}${st.powerGen}<small>/${st.powerUse}</small></span>
        <span class="chip" title="Colonists">${ICON.people}${s.colonists.length}<small>/${st.popCap}</small></span>
        <span class="chip" title="Quantum Crystals">${ICON.crystal}${s.crystals}</span>
      </div>
      <button class="iconbtn" data-action="recentre" aria-label="Recentre camera">${ICON.target}</button>
      <button class="iconbtn" data-action="settings" aria-label="Menu">${ICON.menu}</button>`,
    );
    this.renderGoals(s, ui);
    this.goals.style.top = `${this.top.getBoundingClientRect().bottom + 6}px`;
    this.renderBottom(s, ui, now);
    this.menu.hidden = !ui.settings;
    this.set(
      this.menu,
      ui.confirmReset
        ? `<h2>Start a new colony?</h2><p>Your current colony will be deleted. This can't be undone.</p>
           <div class="actions"><button class="btn ghost" data-action="reset-cancel">Keep playing</button><button class="btn" style="background:var(--red)" data-action="reset-confirm">Delete and restart</button></div>`
        : `<h2>Terraform Wars</h2><p>Prototype build. Your colony saves on this device automatically.</p>
           <div class="actions"><button class="btn ghost" data-action="settings">Close</button><button class="btn ghost" data-action="reset">New colony</button></div>`,
    );
    this.collectLabels(s, now);
  }

  private renderGoals(s: GameState, ui: UiState) {
    const done = (t: BuildingType) => s.buildings.some((b) => b.type === t && b.level > 0);
    const net = connectedToHub(s);
    const goals: [string, boolean][] = [
      ['Build a Solar Array for power', done('solar')],
      ['Build an Ore Extractor on the purple crystals', done('extractor')],
      ['Lay a road from the Command Hub to the extractor', s.buildings.some((b) => b.type === 'extractor' && b.level > 0 && isConnected(s, b, net))],
      ['Let colonists haul 100 ore home', s.delivered >= 100],
      ['Build a Habitat for more colonists', done('habitat')],
      ['Build a Storage Depot', done('storage')],
      ['Upgrade the Command Hub to level 2', hub(s).level >= 2],
    ];
    const first = goals.findIndex(([, d]) => !d);
    const all = first === -1;
    this.goals.classList.toggle('min', ui.goalsMin);
    this.set(
      this.goals,
      `<header><h2>${all ? 'Colony founded' : `Goal ${first + 1} of ${goals.length}`}</h2><button data-action="goals">${ui.goalsMin ? 'All goals' : 'Hide'}</button></header>
       ${all ? '' : `<p class="current">${goals[first][0]}</p>`}
       <ol>${goals.map(([t, d], i) => `<li class="${d ? 'done' : i === first ? 'now' : ''}">${t}</li>`).join('')}</ol>
       ${all ? '<p class="hint" style="margin-top:6px">That\'s phase 0 done. Keep upgrading, or start a new colony from the menu.</p>' : ''}`,
    );
  }

  private renderBottom(s: GameState, ui: UiState, now: number) {
    const m = ui.mode;
    const toolbar = `<div class="toolbar">
      <button class="tool${m.kind === 'menu' ? ' on' : ''}" data-action="build">${ICON.build}Build</button>
      <button class="tool${m.kind === 'road' ? ' on' : ''}" data-action="road">${ICON.road}Roads</button>
    </div>`;
    let html = '';
    if (m.kind === 'menu') html = this.buildSheet(s) + toolbar;
    else if (m.kind === 'place') html = this.placeBar(s, m);
    else if (m.kind === 'road') html = this.roadBar(m);
    else {
      const b = ui.selected != null ? byId(s, ui.selected) : undefined;
      html = b ? this.panel(s, b, now) + toolbar : toolbar;
    }
    this.set(this.bottom, html);
  }

  private buildSheet(s: GameState) {
    const st = stats(s);
    const busy = st.buildersBusy >= CONFIG.builderDrones;
    const cards = BUILDABLE.map((t) => {
      const d = BUILDINGS[t];
      const count = countOf(s, t);
      const max = maxCountOf(s, t);
      const l1 = d.levels[0];
      const reason = count >= max ? 'Upgrade Hub for more' : s.ore < l1.cost ? 'Not enough ore' : busy ? 'Drones busy' : '';
      return `<button class="card" data-action="choose" data-arg="${t}" ${reason ? 'disabled' : ''}>
        <span class="art">${CARD_ART[t]}</span><b>${d.name}</b><small>${reason || d.blurb}</small>
        <span class="cost"><span>${l1.cost} ore</span><span>${count}/${max}</span></span></button>`;
    }).join('');
    return `<div class="sheet"><header><h2>Build</h2><span>Builder drones ${CONFIG.builderDrones - st.buildersBusy}/${CONFIG.builderDrones} free</span></header><div class="cards">${cards}</div></div>`;
  }

  private placeBar(s: GameState, m: Extract<Mode, { kind: 'place' }>) {
    const d = BUILDINGS[m.type];
    const check = canPlace(s, m.type, m.x, m.y);
    const hint = d.needsDeposit ? 'Place it on the purple crystals.' : 'Tap the ground to move it.';
    return `<div class="bar"><p><b>${d.name}</b> · ${d.levels[0].cost} ore · ${fmtTime(d.levels[0].buildSec)}<br>${check.ok ? hint : `<span class="bad">${check.reason}.</span> ${hint}`}</p>
      <button class="btn ghost" data-action="cancel">Cancel</button><button class="btn" data-action="place" ${check.ok ? '' : 'disabled'}>Place</button></div>`;
  }

  private roadBar(m: Extract<Mode, { kind: 'road' }>) {
    const text = m.remove
      ? 'Tap a road tile to remove it.'
      : m.anchor
        ? 'Now tap where the road should end. It bends once if needed.'
        : 'Tap where the road starts, next to a building.';
    return `<div class="bar"><p><b>Roads</b> · ${CONFIG.roadCost} ore per tile<br>${text}</p>
      <button class="btn ghost" data-action="road-remove">${m.remove ? 'Lay roads' : 'Remove roads'}</button><button class="btn" data-action="cancel">Done</button></div>`;
  }

  private panel(s: GameState, b: Building, now: number) {
    const d = BUILDINGS[b.type];
    const st = stats(s);
    const L = Math.max(1, b.level);
    const facts: string[] = [];
    if (d.powerGen) facts.push(`<span>Power <b>+${lv(d.powerGen, L)}</b></span>`);
    if (d.powerUse) facts.push(`<span>Power use <b>${lv(d.powerUse, L)}</b></span>`);
    if (d.population) facts.push(`<span>Colonists <b>+${lv(d.population, L)}</b></span>`);
    if (d.storage) facts.push(`<span>Holds <b>${n(lv(d.storage, L))} ore</b></span>`);
    if (d.oreRate) {
      facts.push(`<span>Output <b>${Math.round(lv(d.oreRate, L) * st.powerRatio * 60)}/min</b></span>`);
      facts.push(`<span>Waiting <b>${Math.floor(b.buffer)}/${lv(d.buffer, L)}</b></span>`);
    }
    const warns = buildingStatus(s, b);
    let action = '';
    if (b.pending) {
      const total = b.pending.endAt - b.pending.startAt;
      const left = (b.pending.endAt - now) / 1000;
      const p = Math.min(100, Math.max(0, ((now - b.pending.startAt) / Math.max(1, total)) * 100));
      const cost = speedUpCost(b, now);
      action = `<div class="timer"><div class="row"><span>${b.level === 0 ? 'Building' : `Upgrading to level ${b.pending.toLevel}`}</span><b>${fmtTime(left)}</b></div><div class="progress"><i style="width:${p.toFixed(1)}%"></i></div></div>
        <div class="actions"><button class="btn violet" data-action="speedup" data-arg="${b.id}" ${s.crystals < cost ? 'disabled' : ''}>${ICON.crystal} Finish now · ${cost}</button></div>`;
    } else if (b.level >= d.levels.length) {
      action = `<p class="hint">Max level for this prototype.</p>`;
    } else {
      const u = canUpgrade(s, b);
      action = `<div class="actions"><button class="btn" data-action="upgrade" data-arg="${b.id}" ${u.ok ? '' : 'disabled'}>Upgrade to level ${b.level + 1} · ${u.cost} ore · ${fmtTime(u.buildSec ?? 0)}</button></div>
        ${u.ok ? '' : `<p class="hint">${u.reason}.</p>`}`;
      if (b.type === 'hub') action += `<p class="hint">Raises the level cap and the number of buildings you can have.</p>`;
    }
    return `<div class="panel"><header><h2>${d.name}<span>${b.level ? `Lv ${b.level}` : 'Under construction'}</span></h2><button data-action="deselect" aria-label="Close">×</button></header>
      <p class="blurb">${d.blurb}</p>
      ${b.level ? `<div class="facts">${facts.join('')}</div>` : ''}
      ${warns.length ? `<div class="warns">${warns.map((w) => `<div>${w}</div>`).join('')}</div>` : ''}
      ${action}</div>`;
  }

  // ---------- labels over buildings ----------

  private collectLabels(s: GameState, now: number) {
    const net = connectedToHub(s);
    const out: LabelInfo[] = [];
    for (const b of s.buildings) {
      const d = BUILDINGS[b.type];
      const c = { tx: b.x + d.size / 2, ty: b.y + d.size / 2, h: 3.6 + d.size };
      if (b.pending) {
        const total = b.pending.endAt - b.pending.startAt;
        const p = Math.min(100, Math.max(0, ((now - b.pending.startAt) / Math.max(1, total)) * 100));
        out.push({ id: b.id, ...c, html: `<span class="pill">${fmtTime((b.pending.endAt - now) / 1000)}</span><span class="mini"><i style="width:${p.toFixed(0)}%"></i></span>` });
      } else if (b.type !== 'hub' && b.type !== 'solar' && b.level > 0 && !isConnected(s, b, net)) {
        out.push({ id: b.id, ...c, html: `<span class="pill warn">Needs road</span>` });
      }
    }
    this.labelInfo = out;
  }

  /** Called every frame so labels follow the camera smoothly. */
  placeLabels(world: Projector) {
    const seen = new Set<number>();
    for (const l of this.labelInfo) {
      seen.add(l.id);
      let el = this.labelEls.get(l.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'label';
        this.labelLayer.append(el);
        this.labelEls.set(l.id, el);
      }
      this.set(el, l.html);
      const p = world.project(l.tx, l.ty, l.h);
      el.hidden = !p.visible;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    }
    for (const [id, el] of this.labelEls) {
      if (!seen.has(id)) {
        el.remove();
        this.labelEls.delete(id);
      }
    }
  }
}
