import type { BuildingType, Good } from '../sim/config';

// Small inline SVG icons for the HUD.
const svg = (body: string, box = '0 0 24 24') => `<svg viewBox="${box}" aria-hidden="true">${body}</svg>`;

export const ICON = {
  power: svg('<path d="M13 2L5 13h6l-1 9 8-11h-6z" fill="#ffb547"/>'),
  people: svg('<circle cx="12" cy="7" r="4" fill="#dfe5f0"/><path d="M4 21c0-5 3.6-8 8-8s8 3 8 8z" fill="#f08a3c"/>'),
  crystal: svg('<path d="M12 2l7 7-7 13L5 9z" fill="#4fd1c5"/><path d="M12 2l7 7H5z" fill="#b8fff6"/>'),
  box: svg('<path d="M3 8l9-5 9 5v9l-9 5-9-5z" fill="#c9d1e2"/><path d="M3 8l9 5 9-5M12 13v9" stroke="#4a5268" stroke-width="1.6" fill="none"/>'),
  build: svg('<path d="M3 21l9-9 3 3-9 9z" fill="#dfe5f0"/><path d="M13 4a6 6 0 0 0 6 8l-3 3-6-6 3-3z" fill="#ffb547"/>'),
  road: svg('<path d="M8 2h3l-1 20H4zM13 2h3l4 20h-6z" fill="#dfe5f0"/><path d="M11.4 4h1.2v3h-1.2zM11.4 10h1.2v4h-1.2zM11.2 17h1.6v4h-1.6z" fill="#ffb547"/>'),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16" stroke="#dfe5f0" stroke-width="2.2" stroke-linecap="round"/>'),
  target: svg('<circle cx="12" cy="12" r="7" fill="none" stroke="#dfe5f0" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="#ffb547"/>'),
  hammer: svg('<path d="M4 20l8-8 2 2-8 8z" fill="#dfe5f0"/><path d="M11 5l4-2 6 6-2 4-3-3-2 2-3-3 2-2z" fill="#ffb547"/>'),
  pause: svg('<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor"/>'),
  play: svg('<path d="M8 5l11 7-11 7z" fill="currentColor"/>'),
  trash: svg('<path d="M5 7h14l-1 14H6zM9 4h6v2H9z" fill="currentColor"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>'),
  up: svg('<path d="M12 4l7 8h-4v8H9v-8H5z" fill="currentColor"/>'),
  lock: svg('<rect x="5" y="10" width="14" height="11" rx="2" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2.2" fill="none"/>'),
  wait: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>'),
};

/** One icon per good, drawn in that good's colour. */
export const GOOD_ICON: Record<Good, string> = {
  timber: svg('<rect x="3" y="9" width="18" height="7" rx="3.5" fill="#a8743f"/><circle cx="18" cy="12.5" r="2.4" fill="#e3b27a"/><path d="M5 11h9" stroke="#7a4f27" stroke-width="1.2"/>'),
  planks: svg('<rect x="3" y="5" width="18" height="4" rx="1" fill="#e8c17e"/><rect x="3" y="10" width="18" height="4" rx="1" fill="#d4a862"/><rect x="3" y="15" width="18" height="4" rx="1" fill="#e8c17e"/>'),
  stone: svg('<path d="M4 15l3-7 7-2 6 5-2 7-9 1z" fill="#a3acc0"/><path d="M7 8l7-2 6 5-8 1z" fill="#c9d0de"/>'),
  water: svg('<path d="M12 3c4 5 6 8.5 6 11a6 6 0 0 1-12 0c0-2.5 2-6 6-11z" fill="#6fc8ff"/><path d="M9 14a3 3 0 0 0 3 3" stroke="#d6f1ff" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  food: svg('<path d="M12 21c-5-3-7-7-6-12 3 0 5 1 6 3 1-4 4-7 7-7 1 7-2 13-7 16z" fill="#6fdc8c"/><path d="M12 21V11" stroke="#2c7a46" stroke-width="1.4"/>'),
  ore: svg('<path d="M4 16l4-8 6-1 5 6-3 6H8z" fill="#d0703f"/><circle cx="10" cy="12" r="1.6" fill="#ffb07a"/><circle cx="15" cy="14" r="1.2" fill="#ffb07a"/>'),
  steel: svg('<path d="M3 15l4-6h14l-4 6z" fill="#c3d2e8"/><path d="M3 15h14v3H3zM17 15l4-6v3l-4 6z" fill="#8c9bb3"/>'),
  lumenite: svg('<path d="M12 2l5 7-5 13-5-13z" fill="#b18cff"/><path d="M12 2l5 7H7z" fill="#e2d4ff"/>'),
  circuits: svg('<rect x="5" y="5" width="14" height="14" rx="2" fill="#16443e"/><rect x="8" y="8" width="8" height="8" rx="1" fill="#3fe0c5"/><path d="M2 9h3M2 15h3M19 9h3M19 15h3M9 2v3M15 2v3M9 19v3M15 19v3" stroke="#3fe0c5" stroke-width="1.6"/>'),
};

const art = (body: string) => svg(body, '0 0 60 40');

/** Tiny pictures for the build menu cards. */
export const CARD_ART: Record<BuildingType, string> = {
  hub: art('<rect x="16" y="18" width="28" height="20" rx="3" fill="#c9d1e2"/><path d="M18 18a12 11 0 0 1 24 0z" fill="#8ee8ff" opacity=".8"/><path d="M30 2v10" stroke="#c9d1e2" stroke-width="2"/>'),
  habitat: art('<rect x="14" y="20" width="32" height="18" rx="2" fill="#c9d1e2"/><path d="M18 20a12 11 0 0 1 24 0z" fill="#8ee8ff" opacity=".8"/><rect x="18" y="26" width="4" height="4" fill="#53f0e0"/><rect x="28" y="26" width="4" height="4" fill="#53f0e0"/><rect x="38" y="26" width="4" height="4" fill="#53f0e0"/>'),
  depot: art('<rect x="14" y="12" width="13" height="26" rx="5" fill="#c9d1e2"/><rect x="31" y="8" width="13" height="30" rx="5" fill="#c9d1e2"/><path d="M14 18a6.5 5 0 0 1 13 0zM31 14a6.5 5 0 0 1 13 0z" fill="#ffb547"/><rect x="14" y="26" width="13" height="2" fill="#53f0e0"/><rect x="31" y="24" width="13" height="2" fill="#53f0e0"/>'),
  solar: art('<path d="M6 22l8-14h40l-8 14z" fill="#203d7a" stroke="#9cc0ff" stroke-width="1"/><path d="M10 15h40M30 8l-4 14" stroke="#9cc0ff" stroke-width=".7"/><path d="M28 22v14" stroke="#4a5268" stroke-width="2.5"/>'),
  lumber: art('<rect x="8" y="18" width="22" height="18" fill="#9a6a43"/><path d="M5 19l14-11 14 11z" fill="#4f3d73"/><rect x="34" y="30" width="20" height="5" rx="2.5" fill="#6b4329"/><rect x="34" y="24" width="20" height="5" rx="2.5" fill="#8a5a35"/><rect x="16" y="26" width="5" height="10" fill="#1d2233"/>'),
  quarry: art('<rect x="6" y="20" width="16" height="16" fill="#4a5268"/><path d="M40 36V6M40 7l-18 8" stroke="#ffb547" stroke-width="2"/><rect x="26" y="28" width="8" height="8" fill="#a3acc0"/><rect x="36" y="28" width="8" height="8" fill="#8f93a8"/><rect x="31" y="20" width="8" height="8" fill="#c0c6d4"/>'),
  sawmill: art('<rect x="6" y="14" width="30" height="20" fill="#9a6a43"/><rect x="4" y="11" width="34" height="4" fill="#4f3d73"/><circle cx="44" cy="26" r="9" fill="#c9d1e2"/><circle cx="44" cy="26" r="2" fill="#4a5268"/><rect x="6" y="35" width="48" height="3" fill="#e8c17e"/>'),
  forester: art('<path d="M8 36a12 12 0 0 1 24 0z" fill="#8ee8ff" opacity=".7"/><circle cx="20" cy="30" r="5" fill="#3fe6cf"/><path d="M42 36V22" stroke="#6b4329" stroke-width="2"/><circle cx="42" cy="18" r="7" fill="#ff7ad9"/><circle cx="52" cy="28" r="4" fill="#3fe6cf"/><path d="M52 36v-5" stroke="#6b4329" stroke-width="2"/>'),
  icedrill: art('<rect x="10" y="34" width="40" height="4" fill="#4a5268"/><rect x="16" y="6" width="8" height="28" fill="#c9d1e2"/><path d="M16 34l4 6 4-6z" fill="#ffb547"/><rect x="32" y="16" width="14" height="18" rx="3" fill="#cdefff"/><rect x="32" y="22" width="14" height="2" fill="#6fc8ff"/>'),
  farm: art('<path d="M6 36a24 18 0 0 1 48 0z" fill="#8ee8ff" opacity=".6"/><path d="M12 32h36M14 27h32M18 22h24" stroke="#5fe08c" stroke-width="3" stroke-linecap="round"/>'),
  mine: art('<path d="M14 36L22 6l8 30M18 22h8" stroke="#c9d1e2" stroke-width="2" fill="none"/><circle cx="22" cy="7" r="4" fill="none" stroke="#ffb547" stroke-width="2"/><rect x="36" y="26" width="14" height="8" fill="#b5582c"/><circle cx="39" cy="36" r="2" fill="#4a5268"/><circle cx="47" cy="36" r="2" fill="#4a5268"/>'),
  extractor: art('<path d="M18 38L30 4l12 34" fill="none" stroke="#c9d1e2" stroke-width="2"/><path d="M22 26h16M25 16h10" stroke="#c9d1e2" stroke-width="1.4"/><path d="M27 30l3 8 3-8z" fill="#ffb547"/><circle cx="30" cy="4" r="2.6" fill="#ff6bd6"/><path d="M42 38l4-10 4 4 3-6 3 12z" fill="#a77bff"/>'),
  beacon: art('<path d="M30 38V8" stroke="#c9d1e2" stroke-width="2.5"/><path d="M22 38l8-10 8 10" stroke="#c9d1e2" stroke-width="2" fill="none"/><path d="M30 12a10 10 0 0 1 12-8" stroke="#e9eef7" stroke-width="3" fill="none"/><circle cx="30" cy="6" r="3" fill="#53f0e0"/><path d="M12 24a20 20 0 0 1 8-14M48 24a20 20 0 0 0-8-14" stroke="#53f0e0" stroke-width="1.4" fill="none"/>'),
  smelter: art('<path d="M10 38l4-22h20l4 22z" fill="#4a5268"/><rect x="20" y="28" width="10" height="6" fill="#ff8a3c"/><rect x="38" y="4" width="7" height="34" fill="#c9d1e2"/><rect x="38" y="2" width="7" height="3" fill="#ff8a3c"/>'),
  fabricator: art('<rect x="8" y="14" width="36" height="22" rx="2" fill="#e9eef7"/><path d="M8 22h36M8 30h36" stroke="#3fe0c5" stroke-width="1.6"/><rect x="12" y="18" width="12" height="8" fill="#203d7a"/><path d="M48 14V6" stroke="#c9d1e2" stroke-width="2"/><path d="M42 8a8 6 0 0 1 12 0z" fill="#e9eef7"/>'),
};
