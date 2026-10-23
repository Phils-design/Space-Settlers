// Small inline SVG icons for the HUD.
const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

export const ICON = {
  ore: svg('<path d="M12 2l8 5v10l-8 5-8-5V7z" fill="#a77bff"/><path d="M12 2l8 5-8 4-8-4z" fill="#d9c9ff"/>'),
  power: svg('<path d="M13 2L5 13h6l-1 9 8-11h-6z" fill="#ffb547"/>'),
  people: svg('<circle cx="12" cy="7" r="4" fill="#dfe5f0"/><path d="M4 21c0-5 3.6-8 8-8s8 3 8 8z" fill="#f08a3c"/>'),
  crystal: svg('<path d="M12 2l7 7-7 13L5 9z" fill="#4fd1c5"/><path d="M12 2l7 7H5z" fill="#b8fff6"/>'),
  build: svg('<path d="M3 21l9-9 3 3-9 9z" fill="#dfe5f0"/><path d="M13 4a6 6 0 0 0 6 8l-3 3-6-6 3-3z" fill="#ffb547"/>'),
  road: svg('<path d="M8 2h3l-1 20H4zM13 2h3l4 20h-6z" fill="#dfe5f0"/><path d="M11.4 4h1.2v3h-1.2zM11.4 10h1.2v4h-1.2zM11.2 17h1.6v4h-1.6z" fill="#ffb547"/>'),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16" stroke="#dfe5f0" stroke-width="2.2" stroke-linecap="round"/>'),
  target: svg('<circle cx="12" cy="12" r="7" fill="none" stroke="#dfe5f0" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="#ffb547"/>'),
  clock: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>'),
};

/** Tiny pictures for the build menu cards. */
export const CARD_ART: Record<string, string> = {
  solar: `<svg viewBox="0 0 60 40"><path d="M6 22l8-14h40l-8 14z" fill="#203d7a" stroke="#9cc0ff" stroke-width="1"/><path d="M10 15h40M30 8l-4 14" stroke="#9cc0ff" stroke-width=".7"/><path d="M28 22v14" stroke="#4a5268" stroke-width="2.5"/></svg>`,
  extractor: `<svg viewBox="0 0 60 40"><path d="M18 38L30 4l12 34" fill="none" stroke="#c9d1e2" stroke-width="2"/><path d="M22 26h16M25 16h10" stroke="#c9d1e2" stroke-width="1.4"/><path d="M27 30l3 8 3-8z" fill="#ffb547"/><circle cx="30" cy="4" r="2.6" fill="#ff6bd6"/><path d="M42 38l4-10 4 4 3-6 3 12z" fill="#a77bff"/></svg>`,
  habitat: `<svg viewBox="0 0 60 40"><rect x="14" y="20" width="32" height="18" rx="2" fill="#c9d1e2"/><path d="M18 20a12 11 0 0 1 24 0z" fill="#8ee8ff" opacity=".8"/><rect x="18" y="26" width="4" height="4" fill="#53f0e0"/><rect x="28" y="26" width="4" height="4" fill="#53f0e0"/><rect x="38" y="26" width="4" height="4" fill="#53f0e0"/></svg>`,
  storage: `<svg viewBox="0 0 60 40"><rect x="14" y="12" width="13" height="26" rx="5" fill="#c9d1e2"/><rect x="31" y="8" width="13" height="30" rx="5" fill="#c9d1e2"/><path d="M14 18a6.5 5 0 0 1 13 0zM31 14a6.5 5 0 0 1 13 0z" fill="#ffb547"/><rect x="14" y="26" width="13" height="2" fill="#53f0e0"/><rect x="31" y="24" width="13" height="2" fill="#53f0e0"/></svg>`,
};
