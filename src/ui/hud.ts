import { entries, get, total } from '../sim/bag';
import { BUILDABLE, BUILDINGS, CONFIG, GOOD_INFO, GOODS, type Bag, type BuildingType, type Good } from '../sim/config';
import {
  buildBlocker,
  buildingStatus,
  canPlace,
  canUpgrade,
  countOf,
  depositName,
  hubLevel,
  lv,
  maxCountOf,
  siteState,
  speedUpBlocker,
  speedUpCost,
  stats,
} from '../sim/game';
import { treesNear } from '../sim/jobs';
import { connected } from '../sim/path';
import { byId, colonistById, type Building, type GameState } from '../sim/state';
import { CARD_ART, GOOD_ICON, ICON } from './icons';

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
  confirmDemolish: boolean;
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
const goodName = (g: Good) => GOOD_INFO[g].name.toLowerCase();

/** A row of goods with icons, e.g. a cost. `have` greys out what isn't in storage yet. */
function goodsRow(bag: Bag, have?: Bag) {
  return entries(bag)
    .map(([g, v]) => `<span class="g${have && get(have, g) < v ? ' short' : ''}" title="${GOOD_INFO[g].name}">${GOOD_ICON[g]}${v}</span>`)
    .join('');
}

/**
 * Updates `el` to match `html`, reusing the elements already there. Swapping in fresh elements
 * on every refresh would jump scrolled lists back to the top and drop taps that land mid-refresh.
 * Elements with a different `data-key` are swapped, not reused.
 */
function morph(el: Node, html: string) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  patchChildren(el, tpl.content);
}

function patchChildren(to: Node, from: Node) {
  const want = Array.from(from.childNodes);
  want.forEach((next, i) => {
    const cur = to.childNodes[i];
    if (!cur) to.appendChild(next);
    else if (!sameKind(cur, next)) to.replaceChild(next, cur);
    else if (cur instanceof Element) {
      patchAttributes(cur, next as Element);
      patchChildren(cur, next);
    } else if (cur.nodeValue !== next.nodeValue) cur.nodeValue = next.nodeValue;
  });
  while (to.childNodes.length > want.length) to.lastChild!.remove();
}

function sameKind(a: Node, b: Node) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
  return !(a instanceof Element) || a.getAttribute('data-key') === (b as Element).getAttribute('data-key');
}

function patchAttributes(to: Element, from: Element) {
  for (const { name } of Array.from(to.attributes)) if (!from.hasAttribute(name)) to.removeAttribute(name);
  for (const { name, value } of Array.from(from.attributes)) if (to.getAttribute(name) !== value) to.setAttribute(name, value);
}

interface LabelInfo {
  id: number;
  tx: number;
  ty: number;
  h: number;
  html: string;
}

export class Hud {
  private readonly top = document.createElement('div');
  private readonly goodsEl = document.createElement('div');
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
    this.goodsEl.className = 'goods';
    this.goals.className = 'goals';
    this.bottom.className = 'bottom';
    this.labelLayer.className = 'labels';
    this.menu.className = 'menu';
    this.toastEl.className = 'toast';
    this.toastEl.style.opacity = '0';
    this.toastEl.setAttribute('role', 'status');
    root.append(this.labelLayer, this.top, this.goodsEl, this.goals, this.bottom, this.menu, this.toastEl);
    root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!btn || (btn as HTMLButtonElement).disabled) return;
      onAction(btn.dataset.action!, btn.dataset.arg);
    });
  }

  private set(el: HTMLElement, html: string) {
    if (this.cache.get(el) === html) return;
    this.cache.set(el, html);
    morph(el, html);
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.style.opacity = '0'), 2400);
  }

  render(s: GameState, ui: UiState) {
    const st = stats(s);
    const lowPower = st.powerUse > st.powerGen;
    this.set(
      this.top,
      `<div class="res">
        <span class="chip" title="Free colonists / all colonists">${ICON.people}${st.free}<small>/${st.colonists}</small></span>
        <span class="chip${lowPower ? ' warn' : ''}" title="Power made / used">${ICON.power}${st.powerGen}<small>/${st.powerUse}</small></span>
        <span class="chip" title="Storage holds this much of each good">${ICON.box}${n(st.storageCap)}</span>
        <span class="chip" title="Quantum Crystals">${ICON.crystal}${s.crystals}</span>
      </div>
      <button class="iconbtn" data-action="recentre" aria-label="Recentre camera">${ICON.target}</button>
      <button class="iconbtn" data-action="settings" aria-label="Menu">${ICON.menu}</button>`,
    );
    this.set(this.goodsEl, this.goodsStrip(s, st.storageCap));
    this.goodsEl.style.top = `${this.top.getBoundingClientRect().bottom + 5}px`;
    this.renderGoals(s, ui);
    this.goals.style.top = `${this.goodsEl.getBoundingClientRect().bottom + 6}px`;
    this.renderBottom(s, ui);
    this.menu.hidden = !ui.settings;
    this.set(
      this.menu,
      ui.confirmReset
        ? `<h2>Start a new colony?</h2><p>Your current colony will be deleted. This can't be undone.</p>
           <div class="actions"><button class="btn ghost" data-action="reset-cancel">Keep playing</button><button class="btn danger" data-action="reset-confirm">Delete and restart</button></div>`
        : `<h2>Terraform Wars</h2><p>Prototype build. Your colony saves on this device automatically.</p>
           <p>Drag to turn the camera, pinch or scroll to zoom, and drag with two fingers (or right-click) to move.</p>
           <div class="actions"><button class="btn ghost" data-action="settings">Close</button><button class="btn ghost" data-action="reset">New colony</button></div>`,
    );
    this.collectLabels(s);
  }

  /** Goods in storage. Only goods the colony can use yet are shown, so the strip grows with the colony. */
  private goodsStrip(s: GameState, cap: number) {
    const known = new Set<Good>();
    const lvl = hubLevel(s);
    for (const d of Object.values(BUILDINGS)) {
      if (d.unlock > lvl) continue;
      for (const bag of [d.recipe?.in, d.recipe?.out, d.levels[0].cost]) for (const [g] of entries(bag ?? {})) known.add(g);
      if (d.gather) known.add(d.gather.good);
    }
    for (const [g] of entries(s.stock)) known.add(g);
    return GOODS.filter((g) => known.has(g))
      .map((g) => {
        const v = get(s.stock, g);
        return `<span class="good${v >= cap ? ' full' : ''}${v < 1 ? ' none' : ''}" title="${GOOD_INFO[g].name}">${GOOD_ICON[g]}${n(v)}</span>`;
      })
      .join('');
  }

  private renderGoals(s: GameState, ui: UiState) {
    const has = (t: BuildingType, level = 1) => s.buildings.some((b) => b.type === t && b.level >= level);
    const lvl = hubLevel(s);
    const goals: [string, boolean][] = [
      ['Place a Lumber Camp near the glowing trees', s.buildings.some((b) => b.type === 'lumber')],
      ['Link it to the Command Hub with a road', s.buildings.some((b) => b.type === 'lumber' && connected(s, b))],
      ['Build a Quarry next to the grey rocks', has('quarry')],
      ['Build a Sawmill and make 10 planks', (s.made.planks ?? 0) >= 10],
      ['Build a Habitat so more colonists arrive', has('habitat')],
      ['Upgrade the Command Hub to level 2', lvl >= 2],
      ['Build a Solar Array for more power', has('solar')],
      ['Build an Ice Drill and a Hydroponics Farm', has('icedrill') && has('farm')],
      ['Build an Ore Mine on the rust-red ground', has('mine')],
      ['Build a Lumenite Extractor on the violet crystals', has('extractor')],
      ['Upgrade the Command Hub to level 3', lvl >= 3],
      ['Smelt steel and make your first circuit', (s.made.circuits ?? 0) >= 1],
    ];
    const first = goals.findIndex(([, d]) => !d);
    const all = first === -1;
    // Older finished goals fold into one line so the current one stays in view.
    const from = all ? goals.length : Math.max(0, first - 1);
    this.goals.classList.toggle('min', ui.goalsMin);
    this.set(
      this.goals,
      `<header><h2>${all ? 'Colony thriving' : `Goal ${first + 1} of ${goals.length}`}</h2><button data-action="goals">${ui.goalsMin ? 'All goals' : 'Hide'}</button></header>
       ${all ? '' : `<p class="current">${goals[first][0]}</p>`}
       ${!all && from ? `<p class="earlier">${from} earlier goal${from === 1 ? '' : 's'} done</p>` : ''}
       <ol>${goals
         .slice(from)
         .map(([t, d], k) => `<li class="${d ? 'done' : from + k === first ? 'now' : ''}">${t}</li>`)
         .join('')}</ol>
       ${all ? '<p class="hint" style="margin-top:6px">All goals done. Keep growing, or start a new colony from the menu.</p>' : ''}`,
    );
  }

  private renderBottom(s: GameState, ui: UiState) {
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
      html = b ? this.panel(s, b, ui) + toolbar : toolbar;
    }
    this.set(this.bottom, html);
  }

  private buildSheet(s: GameState) {
    const st = stats(s);
    const cards = BUILDABLE.map((t) => {
      const d = BUILDINGS[t];
      const blocked = buildBlocker(s, t);
      const locked = d.unlock > hubLevel(s);
      const count = countOf(s, t);
      const max = maxCountOf(s, t);
      return `<button class="card${locked ? ' locked' : ''}" data-action="choose" data-arg="${t}" ${blocked ? 'disabled' : ''}>
        <span class="art">${CARD_ART[t]}</span><b>${d.name}</b>
        <small>${locked ? `${ICON.lock} Command Hub ${d.unlock}` : blocked ? blocked : d.blurb}</small>
        <span class="cost">${goodsRow(d.levels[0].cost, s.stock)}<span class="count">${locked ? '' : `${count}/${max}`}</span></span></button>`;
    }).join('');
    return `<div class="sheet" data-key="sheet"><header><h2>Build</h2><span>${st.free} of ${st.colonists} colonists free</span></header>
      <p class="hint">Colonists carry the materials and build it. Nothing is spent until they do.</p>
      <div class="cards">${cards}</div></div>`;
  }

  private placeBar(s: GameState, m: Extract<Mode, { kind: 'place' }>) {
    const d = BUILDINGS[m.type];
    const check = canPlace(s, m.type, m.x, m.y);
    const hint =
      d.deposit != null
        ? `Place it on ${depositName(d.deposit)}.`
        : d.gather
          ? `Place it near ${d.gather.node === 'tree' ? 'glowing trees' : 'grey rocks'}. The ring shows how far the worker walks.`
          : d.plant
            ? 'Place it near your Lumber Camps. The ring shows where it plants.'
            : 'Tap the ground to move it.';
    return `<div class="bar"><p><b>${d.name}</b> <span class="cost inline">${goodsRow(d.levels[0].cost, s.stock)}</span> · ${fmtTime(d.levels[0].work)} of building<br>${
      check.ok ? hint : `<span class="bad">${check.reason}.</span> ${hint}`
    }</p>
      <button class="btn ghost" data-action="cancel">Cancel</button><button class="btn" data-action="place" ${check.ok ? '' : 'disabled'}>Place</button></div>`;
  }

  private roadBar(m: Extract<Mode, { kind: 'road' }>) {
    const text = m.remove
      ? 'Tap a road tile to remove it.'
      : m.anchor
        ? 'Now tap where it should end. It finds its own way around trees and rocks.'
        : 'Tap where the road starts. Tap a building to start right next to it.';
    return `<div class="bar"><p><b>Roads</b> · free<br>${text}</p>
      <button class="btn ghost" data-action="road-remove">${m.remove ? 'Lay roads' : 'Remove roads'}</button><button class="btn" data-action="cancel">Done</button></div>`;
  }

  /** What a building's worker is up to, in a few words. */
  private workerLine(s: GameState, b: Building) {
    const d = BUILDINGS[b.type];
    if (b.paused) return 'Paused. The worker has gone to help elsewhere.';
    if (b.worker == null) return 'No worker yet. Some colonists are always kept free to build and carry, about one for every two workers. Build a Habitat for more.';
    const c = colonistById(s, b.worker);
    const job = c?.job;
    if (!job || job.kind !== 'work') return 'Worker on the way';
    const tree = d.gather?.node === 'tree';
    switch (job.stage) {
      case 'go':
        return 'Worker on the way';
      case 'inside':
        return d.gather || d.plant ? 'Worker resting inside' : b.progress > 0 ? 'Worker at work' : 'Worker inside';
      case 'out':
        return d.plant ? 'Walking out to plant a sapling' : tree ? 'Walking out to a tree' : 'Walking out to the rocks';
      case 'harvest':
        return d.plant ? 'Planting a sapling' : tree ? 'Felling a tree' : 'Cutting stone';
      case 'back':
        return c?.carry ? `Carrying ${goodName(c.carry.good)} back` : 'Walking back';
    }
  }

  private panel(s: GameState, b: Building, ui: UiState) {
    const d = BUILDINGS[b.type];
    const st = stats(s);
    const L = Math.max(1, b.level);
    const head = `<header><h2>${d.name}<span>${b.level ? `Lv ${b.level}` : 'Under construction'}</span></h2><button data-action="deselect" aria-label="Close">×</button></header>`;
    const warnList = buildingStatus(s, b);
    const warns = warnList.length ? `<div class="warns">${warnList.map((w) => `<div>${w}</div>`).join('')}</div>` : '';
    const needsRoad = b.type !== 'hub' && !connected(s, b);
    const roadBtn = needsRoad ? `<button class="btn teal" data-action="connect" data-arg="${b.id}">${ICON.link} Build road to Hub</button>` : '';

    if (ui.confirmDemolish) {
      return `<div class="panel" data-key="panel-${b.id}">${head}<p class="blurb">${
        b.site ? 'Cancel this build? Materials already delivered go back to storage.' : `Demolish this ${d.name}? Nothing is refunded, but goods waiting inside go back to storage.`
      }</p><div class="actions"><button class="btn ghost" data-action="demolish-cancel">Keep it</button><button class="btn danger" data-action="demolish-confirm" data-arg="${b.id}">${
        b.site ? 'Cancel build' : 'Demolish'
      }</button></div></div>`;
    }

    if (b.site) {
      const site = b.site;
      const p = Math.min(100, (site.work / Math.max(1, site.total)) * 100);
      const state = siteState(s, b);
      const label = {
        building: 'Builder at work',
        waiting: 'Builder waiting for materials',
        'needs-road': 'Needs a road',
        materials: 'Waiting for materials',
        delivering: 'Materials on the way',
        'no-colonist': 'Waiting for a free colonist',
      }[state];
      const mats = entries(site.need)
        .map(([g, need]) => {
          const have = get(site.have, g);
          const coming = get(site.incoming, g);
          return `<span class="mat${have >= need ? ' ok' : ''}">${GOOD_ICON[g]}${have}/${need}${coming ? `<small> +${coming} coming</small>` : ''}</span>`;
        })
        .join('');
      const blocked = speedUpBlocker(s, b);
      return `<div class="panel" data-key="panel-${b.id}">${head}
        <div class="timer"><div class="row"><span>${b.level ? `Upgrading to level ${site.toLevel}` : 'Building'} · ${label}</span><b>${fmtTime(site.total - site.work)}</b></div><div class="progress"><i style="width:${p.toFixed(1)}%"></i></div></div>
        ${mats ? `<div class="mats">${mats}</div>` : ''}
        ${warns}
        <div class="actions">${roadBtn}<button class="btn violet" data-action="speedup" data-arg="${b.id}" ${blocked ? 'disabled' : ''}>${ICON.crystal} Finish now · ${speedUpCost(b)}</button>
        <button class="btn ghost" data-action="demolish" data-arg="${b.id}">Cancel build</button></div>
        ${blocked && blocked !== 'Nothing to finish' ? `<p class="hint">${blocked}.</p>` : ''}</div>`;
    }

    const facts: string[] = [];
    if (d.population) facts.push(`<span>Colonists <b>+${lv(d.population, L)}</b></span>`);
    if (d.storage) facts.push(`<span>Holds <b>${n(lv(d.storage, L))}</b> of each good</span>`);
    if (d.powerGen) facts.push(`<span>Power <b>+${lv(d.powerGen, L)}</b></span>`);
    if (d.powerUse) facts.push(`<span>Power use <b>${lv(d.powerUse, L)}</b></span>`);
    if (d.territory) facts.push(`<span>Claims land <b>${lv(d.territory, L)} tiles</b> out</span>`);
    let work = '';
    if (d.workers) {
      const lines: string[] = [`<div class="worker">${ICON.people}<span>${this.workerLine(s, b)}</span></div>`];
      if (d.recipe) {
        const sec = lv(d.recipe.sec, L) / (d.powerUse ? Math.max(0.01, st.powerRatio) : 1);
        const ins = entries(d.recipe.in).length ? goodsRow(d.recipe.in) : '<span class="g">nothing</span>';
        lines.push(`<div class="recipe">${ins}<span class="arrow">→</span>${goodsRow(d.recipe.out)}<small>every ${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s</small></div>`);
        lines.push(`<div class="progress thin"><i style="width:${(b.progress * 100).toFixed(0)}%"></i></div>`);
        const inv = entries(d.recipe.in).length ? `<span>In stock ${goodsRow(Object.fromEntries(entries(d.recipe.in).map(([g]) => [g, get(b.inv, g)])))}</span>` : '';
        lines.push(`<div class="facts">${inv}<span>Ready ${total(b.out) ? goodsRow(b.out) : '<b>0</b>'}</span></div>`);
      }
      if (d.gather) {
        const left = (() => {
          const r = lv(d.gather.radius, L);
          let count = 0;
          const cx = b.x + d.size / 2;
          const cy = b.y + d.size / 2;
          for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
            for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
              if (x < 0 || y < 0 || x >= s.size || y >= s.size || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
              const i = y * s.size + x;
              count += d.gather.node === 'tree' ? (s.trees[i] >= 100 ? 1 : 0) : s.rocks[i];
            }
          }
          return count;
        })();
        lines.push(
          `<div class="facts"><span>${d.gather.node === 'tree' ? 'Grown trees' : 'Stone'} in reach <b>${left}</b></span><span>Ready ${total(b.out) ? goodsRow(b.out) : '<b>0</b>'}</span></div>`,
        );
      }
      if (d.plant) lines.push(`<div class="facts"><span>Trees nearby <b>${treesNear(s, b, lv(d.plant.radius, L))}/${d.plant.maxTrees}</b></span></div>`);
      work = lines.join('');
    }
    let action = '';
    const btns: string[] = [];
    if (roadBtn) btns.push(roadBtn);
    if (b.level < d.levels.length) {
      const u = canUpgrade(s, b);
      btns.push(
        `<button class="btn" data-action="upgrade" data-arg="${b.id}" ${u.ok ? '' : 'disabled'}>${ICON.up} Level ${b.level + 1} <span class="cost inline">${goodsRow(d.levels[b.level].cost, s.stock)}</span></button>`,
      );
      if (!u.ok) action += `<p class="hint">${u.reason}.</p>`;
    }
    if (d.workers) btns.push(`<button class="btn ghost" data-action="pause" data-arg="${b.id}">${b.paused ? `${ICON.play} Resume` : `${ICON.pause} Pause`}</button>`);
    if (b.type !== 'hub') btns.push(`<button class="btn ghost icon" data-action="demolish" data-arg="${b.id}" aria-label="Demolish">${ICON.trash}</button>`);
    if (b.type === 'hub') action += `<p class="hint">Each level unlocks new buildings, lets you have more of them, and pushes your border out.</p>`;
    if (b.level >= d.levels.length) action += `<p class="hint">Max level for this prototype.</p>`;
    return `<div class="panel" data-key="panel-${b.id}">${head}
      <p class="blurb">${d.blurb}</p>
      ${facts.length ? `<div class="facts">${facts.join('')}</div>` : ''}
      ${work}
      ${warns}
      <div class="actions">${btns.join('')}</div>${action}</div>`;
  }

  // ---------- labels over buildings ----------

  private collectLabels(s: GameState) {
    const out: LabelInfo[] = [];
    for (const b of s.buildings) {
      const d = BUILDINGS[b.type];
      const c = { tx: b.x + d.size / 2, ty: b.y + d.size / 2, h: 3.4 + d.size };
      if (b.site) {
        const p = Math.min(100, (b.site.work / Math.max(1, b.site.total)) * 100);
        const st = siteState(s, b);
        const warn = st === 'needs-road' ? 'Needs road' : st === 'materials' ? 'No materials' : '';
        out.push({
          id: b.id,
          ...c,
          html: warn
            ? `<span class="pill warn">${warn}</span>`
            : `<span class="pill">${st === 'building' ? ICON.hammer : ICON.wait}${p.toFixed(0)}%</span><span class="mini"><i style="width:${p.toFixed(0)}%"></i></span>`,
        });
        continue;
      }
      if (b.type === 'hub') continue;
      let issue = '';
      if (!connected(s, b)) issue = 'Needs road';
      else if (d.workers && b.paused) issue = 'Paused';
      else if (d.workers && b.worker == null) issue = 'No worker';
      else if (d.workers && total(b.out) >= CONFIG.outCap) issue = 'Needs carriers';
      else if (d.recipe && b.worker != null && b.progress <= 0 && entries(d.recipe.in).some(([g, v]) => get(b.inv, g) < v)) {
        const g = entries(d.recipe.in).find(([g2, v]) => get(b.inv, g2) < v)![0];
        issue = `Needs ${goodName(g)}`;
      }
      if (issue) out.push({ id: b.id, ...c, html: `<span class="pill warn">${issue}</span>` });
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
