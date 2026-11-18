import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_APP,
  KEEP,
  STORE,
  addReport,
  changeLine,
  cleanName,
  fetchStatus,
  loadReports,
  mergeStatus,
  reportBody,
  saveReports,
  sendReport,
  textProblem,
  type SentReport,
} from '../src/feedback/client';

const KEY = 'fb/01790907623527-sh2lk1';
const KEY2 = 'fb/01790907623999-abc123';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) {
  return (async (url: string, init?: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

describe('feedback client', () => {
  it('uses the slug the console has registered for this game', () => {
    expect(FEEDBACK_APP).toBe('terraformwars');
  });

  it('builds the report body the console expects', () => {
    const b = reportBody('bug', '  The sawmill stopped \r\n', {
      diag: { v: '0.2.0 · a1b2c3d', level: 2, stage: 5, playtime: 123.6 },
      name: 'Phil <3',
      devKey: '  secret  ',
    });
    expect(b).toEqual({ app: 'terraformwars', kind: 'bug', text: 'The sawmill stopped', diag: { v: '0.2.0 · a1b2c3d', level: 2, stage: 5, playtime: 124 }, name: 'Phil 3', dk: 'secret' });
  });

  it('leaves out empty extras', () => {
    expect(reportBody('idea', 'More roads', { diag: {}, name: 'x', devKey: ' ' })).toEqual({ app: 'terraformwars', kind: 'idea', text: 'More roads' });
  });

  it('checks the text length and cleans names like the console', () => {
    expect(textProblem(' ab ')).toBeTruthy();
    expect(textProblem('abc')).toBeNull();
    expect(textProblem('a'.repeat(2001))).toBeTruthy();
    expect(cleanName('  Ada   Lovelace!!  ')).toBe('Ada Lovelace');
    expect(cleanName('a')).toBeUndefined();
  });

  it('sends a report and keeps its key', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const r = await sendReport('idea', 'Let me copy buildings', { fetchFn: fakeFetch(200, { ok: true, key: KEY, app: 'terraformwars' }, seen), now: 5 });
    expect(seen.url).toBe('https://feedbackprocess.netlify.app/api/feedback');
    expect(JSON.parse(String(seen.init!.body))).toMatchObject({ app: 'terraformwars', kind: 'idea' });
    expect(r).toEqual({ ok: true, devRejected: false, report: { key: KEY, kind: 'idea', text: 'Let me copy buildings', at: 5, st: 'new' } });
  });

  it('marks reports the developer key approved, and says when the key was refused', async () => {
    const ok = await sendReport('bug', 'Crash on load', { devKey: 'k', fetchFn: fakeFetch(200, { ok: true, key: KEY, dev: true }) });
    expect(ok.ok && ok.report.dev && ok.report.st).toBe('ok');
    const refused = await sendReport('bug', 'Crash on load', { devKey: 'wrong', fetchFn: fakeFetch(200, { ok: true, key: KEY }) });
    expect(refused.ok && refused.devRejected).toBe(true);
  });

  it('explains failures in plain words', async () => {
    const slow = await sendReport('bug', 'Crash on load', { fetchFn: fakeFetch(429, { ok: false, err: 'slow down' }) });
    expect(slow).toEqual({ ok: false, reason: 'You can send one report a minute. Try again shortly' });
    const offline = await sendReport('bug', 'Crash on load', { fetchFn: (async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch });
    expect(offline.ok).toBe(false);
    const short = await sendReport('bug', 'x', { fetchFn: fakeFetch(200, {}) });
    expect(short).toEqual({ ok: false, reason: 'Write a few words first' });
  });

  it('asks for the status of valid keys only', async () => {
    const seen: { url?: string } = {};
    const items = await fetchStatus([KEY, 'junk', KEY2], fakeFetch(200, { ok: true, items: [{ key: KEY, st: 'ok' }] }, seen));
    expect(seen.url).toBe(`https://feedbackprocess.netlify.app/api/fbstatus?keys=${encodeURIComponent(KEY)},${encodeURIComponent(KEY2)}`);
    expect(items).toEqual([{ key: KEY, st: 'ok' }]);
    expect(await fetchStatus(['junk'], fakeFetch(500, {}))).toEqual([]);
    expect(await fetchStatus([KEY], fakeFetch(500, { ok: false }))).toBeNull();
  });

  it('flags reports whose status, ship note or reply changed', () => {
    const reports: SentReport[] = [
      { key: KEY, kind: 'bug', text: 'a', at: 1, st: 'ok' },
      { key: KEY2, kind: 'idea', text: 'b', at: 2, st: 'new' },
    ];
    const { reports: next, changed } = mergeStatus(reports, [
      { key: KEY, st: 'done', ship: 'v0.3.0: fixed the sawmill' },
      { key: KEY2, st: 'new' },
    ]);
    expect(changed.map((r) => r.key)).toEqual([KEY]);
    expect(next[0]).toMatchObject({ st: 'done', ship: 'v0.3.0: fixed the sawmill', unseen: true });
    expect(next[1].unseen).toBeUndefined();
    expect(changeLine(next[0])).toBe('Your bug report shipped: v0.3.0: fixed the sawmill');
    const replied = mergeStatus(next, [{ key: KEY2, st: 'new', re: 'Good idea' }]).changed[0];
    expect(changeLine(replied)).toBe('Phil replied to your idea');
  });

  it('keeps the newest reports on the device, up to the limit', () => {
    const s = memStore();
    let list: SentReport[] = [];
    for (let i = 0; i < KEEP + 5; i++) list = addReport(list, { key: `fb/${String(i).padStart(14, '0')}-aaaaaa`, kind: 'bug', text: 't', at: i });
    expect(list).toHaveLength(KEEP);
    expect(list[0].at).toBe(KEEP + 4);
    saveReports(list, s);
    expect(loadReports(s)).toEqual(list);
    s.setItem(STORE.reports, 'not json');
    expect(loadReports(s)).toEqual([]);
  });
});
