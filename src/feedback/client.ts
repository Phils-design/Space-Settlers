/**
 * Bug reports and ideas, sent to Phil's shared feedback console
 * (https://feedbackprocess.netlify.app, contract in Phils-design/Feedback-System docs/APP-INTEGRATION.md).
 *
 * The console only knows the slugs it has registered; this game is registered as `terraformwars`.
 * No key is needed to send a report or ask how it fared. The developer key (`dk`) is Phil's alone:
 * it is typed into the game on his own device and kept in that device's storage, never in the repo.
 */

export const FEEDBACK_APP = 'terraformwars';
export const FEEDBACK_BASE = 'https://feedbackprocess.netlify.app';

export type Kind = 'bug' | 'idea';
export type Status = 'new' | 'ok' | 'no' | 'done' | 'gone';

export const TEXT_MIN = 3;
export const TEXT_MAX = 2000;
/** Reports kept on the device; the status lookup takes up to 30 keys per call. */
export const KEEP = 30;

/** What the game tells the console about where the report came from. Level and stage are ours to define. */
export interface Diag {
  /** Build version, e.g. "0.2.0 · a1b2c3d". */
  v?: string;
  /** Command Hub level. */
  level?: number;
  /** The goal the player is on (1-based; one past the last when all are done). */
  stage?: number;
  /** Seconds played in this colony. */
  playtime?: number;
}

/** A report this device sent, and what the console last said about it. */
export interface SentReport {
  key: string;
  kind: Kind;
  /** The start of the text, so the player can tell their reports apart. */
  text: string;
  /** Epoch ms when sent. */
  at: number;
  /** Sent with a developer key the console accepted, so it landed approved. */
  dev?: boolean;
  st?: Status;
  /** What shipped, written when the fix went out. */
  ship?: string;
  /** Phil's reply. */
  re?: string;
  /** Something changed since the player last looked at their reports. */
  unseen?: boolean;
}

export interface StatusItem {
  key: string;
  st: Status;
  ship?: string;
  re?: string;
}

export const STORE = {
  reports: 'terraform-wars.feedback.reports',
  devKey: 'terraform-wars.feedback.dev-key',
  name: 'terraform-wars.feedback.name',
  playtime: 'terraform-wars.playtime',
} as const;

const KEY_RE = /^fb\/\d{14}-[a-z0-9]{6}$/;

/** Why a report can't be sent yet, or null when it can. */
export function textProblem(text: string): string | null {
  const t = text.trim();
  if (t.length < TEXT_MIN) return 'Write a few words first';
  if (t.length > TEXT_MAX) return `Keep it under ${TEXT_MAX} characters`;
  return null;
}

/** The console's own name rule: 2 to 16 of letters, digits, space, _ . - (anything else is dropped). */
export function cleanName(raw: string): string | undefined {
  const n = raw
    .replace(/[^A-Za-z0-9 _.\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return n.length >= 2 ? n : undefined;
}

/** The POST /api/feedback body. */
export function reportBody(kind: Kind, text: string, opts: { diag?: Diag; name?: string; devKey?: string } = {}) {
  const body: { app: string; kind: Kind; text: string; diag?: Diag; name?: string; dk?: string } = {
    app: FEEDBACK_APP,
    kind,
    text: text.replace(/\r/g, '').trim().slice(0, TEXT_MAX),
  };
  if (opts.diag) {
    const d: Diag = {};
    if (opts.diag.v) d.v = opts.diag.v.slice(0, 20);
    for (const k of ['level', 'stage'] as const) {
      const v = opts.diag[k];
      if (Number.isInteger(v) && v! >= 0 && v! <= 9999) d[k] = v;
    }
    if (Number.isFinite(opts.diag.playtime) && opts.diag.playtime! >= 0) d.playtime = Math.round(opts.diag.playtime!);
    if (Object.keys(d).length) body.diag = d;
  }
  const name = opts.name ? cleanName(opts.name) : undefined;
  if (name) body.name = name;
  const dk = opts.devKey?.trim();
  if (dk) body.dk = dk;
  return body;
}

/** A plain-words reason for a failed send. */
export function sendError(status: number, err?: string): string {
  if (status === 429) return 'You can send one report a minute. Try again shortly';
  if (status === 413) return 'That report is too long';
  if (err === 'text too short') return 'Write a few words first';
  if (err === 'bad app') return "The feedback console doesn't know this game yet";
  if (status === 0) return "Couldn't reach the feedback service. Check your connection and try again";
  return `Couldn't send it (${err || `error ${status}`}). Try again later`;
}

export type SendResult = { ok: true; report: SentReport; devRejected: boolean } | { ok: false; reason: string };

export async function sendReport(
  kind: Kind,
  text: string,
  opts: { diag?: Diag; name?: string; devKey?: string; fetchFn?: typeof fetch; now?: number } = {},
): Promise<SendResult> {
  const problem = textProblem(text);
  if (problem) return { ok: false, reason: problem };
  const body = reportBody(kind, text, opts);
  const f = opts.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await f(`${FEEDBACK_BASE}/api/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, reason: sendError(0) };
  }
  let data: { ok?: boolean; key?: string; err?: string; dev?: boolean } = {};
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !data.ok || typeof data.key !== 'string') return { ok: false, reason: sendError(res.status, data.err) };
  const dev = !!data.dev;
  return {
    ok: true,
    devRejected: !!body.dk && !dev,
    report: { key: data.key, kind, text: body.text.slice(0, 160), at: opts.now ?? Date.now(), st: dev ? 'ok' : 'new', ...(dev ? { dev: true } : {}) },
  };
}

/** Asks the console how this device's reports fared. Null when it couldn't be reached. */
export async function fetchStatus(keys: string[], fetchFn: typeof fetch = fetch): Promise<StatusItem[] | null> {
  const valid = keys.filter((k) => KEY_RE.test(k)).slice(0, KEEP);
  if (!valid.length) return [];
  try {
    const res = await fetchFn(`${FEEDBACK_BASE}/api/fbstatus?keys=${valid.map(encodeURIComponent).join(',')}`);
    const data = (await res.json()) as { ok?: boolean; items?: StatusItem[] };
    return res.ok && data.ok && Array.isArray(data.items) ? data.items : null;
  } catch {
    return null;
  }
}

/** Folds a status answer into the stored reports, flagging the ones that changed. */
export function mergeStatus(reports: SentReport[], items: StatusItem[]): { reports: SentReport[]; changed: SentReport[] } {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const changed: SentReport[] = [];
  const out = reports.map((r) => {
    const i = byKey.get(r.key);
    if (!i) return r;
    const next: SentReport = { ...r, st: i.st };
    if (i.ship) next.ship = i.ship;
    else delete next.ship;
    if (i.re) next.re = i.re;
    else delete next.re;
    const moved = (r.st ?? 'new') !== i.st || (r.ship ?? '') !== (next.ship ?? '') || (r.re ?? '') !== (next.re ?? '');
    if (moved) {
      next.unseen = true;
      changed.push(next);
    }
    return next;
  });
  return { reports: out, changed };
}

/** Newest first, capped at KEEP. */
export function addReport(reports: SentReport[], r: SentReport): SentReport[] {
  return [r, ...reports.filter((x) => x.key !== r.key)].slice(0, KEEP);
}

export function statusLabel(r: SentReport): string {
  switch (r.st ?? 'new') {
    case 'new':
      return 'Received, waiting for review';
    case 'ok':
      return r.dev ? 'Approved (developer key)' : 'Approved for a future update';
    case 'no':
      return 'Not planned';
    case 'done':
      return 'Shipped';
    case 'gone':
      return 'No longer on the console';
  }
}

/** One line for a toast when a report moves on. */
export function changeLine(r: SentReport): string {
  const what = r.kind === 'bug' ? 'bug report' : 'idea';
  if (r.st === 'done') return `Your ${what} shipped${r.ship ? `: ${r.ship}` : ''}`;
  if (r.re) return `Phil replied to your ${what}`;
  if (r.st === 'ok') return `Your ${what} was approved`;
  if (r.st === 'no') return `Your ${what} was reviewed`;
  return `Update on your ${what}`;
}

// ---------- device storage ----------

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const store = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function loadReports(s: Storage | null = store()): SentReport[] {
  try {
    const v = JSON.parse(s?.getItem(STORE.reports) ?? '[]') as SentReport[];
    return Array.isArray(v) ? v.filter((r) => r && typeof r.key === 'string' && KEY_RE.test(r.key)).slice(0, KEEP) : [];
  } catch {
    return [];
  }
}

export function saveReports(reports: SentReport[], s: Storage | null = store()) {
  try {
    s?.setItem(STORE.reports, JSON.stringify(reports.slice(0, KEEP)));
  } catch {
    /* storage blocked */
  }
}

export function getItem(key: string, s: Storage | null = store()): string {
  try {
    return s?.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function setItem(key: string, value: string, s: Storage | null = store()) {
  try {
    if (value) s?.setItem(key, value);
    else s?.removeItem(key);
  } catch {
    /* storage blocked */
  }
}
