import {
  KEEP,
  STORE,
  TEXT_MAX,
  addReport,
  changeLine,
  fetchStatus,
  getItem,
  loadReports,
  mergeStatus,
  saveReports,
  sendReport,
  setItem,
  statusLabel,
  textProblem,
  type Diag,
  type Kind,
  type SentReport,
} from '../feedback/client';

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const PROMPT: Record<Kind, { label: string; placeholder: string; send: string }> = {
  bug: {
    label: 'What went wrong?',
    placeholder: 'What you did, what happened, and what you expected. For example: the Sawmill stopped making planks after I upgraded it.',
    send: 'Send bug report',
  },
  idea: {
    label: 'What would make the game better?',
    placeholder: 'For example: let me copy a building so I can place several in a row.',
    send: 'Send idea',
  },
};

const ago = (ms: number) => {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};

/**
 * The "Bugs and ideas" panel: send a report, see how earlier ones fared, and (for Phil only)
 * keep a developer key on this device so his own reports land approved.
 * It owns its DOM, built once, so typing is never disturbed by the HUD's refreshes.
 */
export class FeedbackPanel {
  readonly el = document.createElement('section');
  private kind: Kind = 'bug';
  private reports: SentReport[] = loadReports();
  private sending = false;
  private lastCheck = 0;
  private readonly q = <T extends HTMLElement = HTMLElement>(sel: string) => this.el.querySelector<T>(sel)!;

  constructor(
    private readonly hooks: {
      diag: () => Diag;
      toast: (msg: string) => void;
      close: () => void;
      /** Called when the count of unread updates changes. */
      changed: () => void;
    },
  ) {
    this.el.className = 'menu fb';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Bugs and ideas');
    this.el.innerHTML = `
      <header><h2>Bugs and ideas</h2><button class="x" data-fb="close" aria-label="Close">×</button></header>
      <div class="seg" role="tablist">
        <button role="tab" data-fb="kind" data-kind="bug">Bug</button>
        <button role="tab" data-fb="kind" data-kind="idea">Idea</button>
      </div>
      <label class="field"><span class="fb-label"></span><textarea rows="5" maxlength="${TEXT_MAX}"></textarea></label>
      <label class="field"><span>Your name <small>(optional)</small></span><input class="fb-name" maxlength="16" autocomplete="nickname" /></label>
      <label class="check"><input type="checkbox" class="fb-diag" checked /><span>Include game details: version, Hub level, current goal and play time</span></label>
      <p class="fb-dev-on" hidden>Developer key on: your reports land approved.</p>
      <p class="fb-msg" role="status"></p>
      <div class="actions"><button class="btn fb-send" data-fb="send"></button></div>
      <div class="fb-head"><h3>Your reports</h3><button class="link" data-fb="refresh">Refresh</button></div>
      <ol class="fb-list"></ol>
      <details class="fb-dev">
        <summary>Developer key</summary>
        <p>For the game's developer only. With the key set, your bugs and ideas skip review and go straight to the approved list. The key stays on this device and is sent only with your reports.</p>
        <div class="fb-dev-row"><input type="password" class="fb-dev-key" autocomplete="off" spellcheck="false" placeholder="Paste the admin key" />
        <button class="btn ghost" data-fb="dev-save">Save</button></div>
        <button class="link fb-dev-clear" data-fb="dev-clear">Remove the key from this device</button>
      </details>`;
    this.q<HTMLInputElement>('.fb-name').value = getItem(STORE.name);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-fb]');
      if (b) this.onAction(b.dataset.fb!, b);
    });
    this.q('textarea').addEventListener('input', () => this.updateSend());
    this.setKind('bug');
    this.renderDev();
    this.renderList();
  }

  get open() {
    return !this.el.hidden;
  }

  /** Reports with news the player hasn't looked at yet. */
  get unseen() {
    return this.reports.filter((r) => r.unseen).length;
  }

  show() {
    this.el.hidden = false;
    this.renderList();
    void this.refresh(false);
  }

  hide() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.markSeen();
  }

  /** Asks the console how this device's reports fared. Toasts news when `announce` is set. */
  async refresh(force: boolean, announce = false) {
    if (!this.reports.length) return;
    if (!force && Date.now() - this.lastCheck < 20_000) return;
    this.lastCheck = Date.now();
    const items = await fetchStatus(this.reports.map((r) => r.key));
    if (!items) {
      if (force) this.say("Couldn't reach the feedback service just now", true);
      return;
    }
    const { reports, changed } = mergeStatus(this.reports, items);
    this.reports = reports;
    saveReports(reports);
    this.renderList();
    this.hooks.changed();
    if (announce && changed.length) this.hooks.toast(changed.length === 1 ? changeLine(changed[0]) : `${changed.length} of your reports have news. See Bugs and ideas in the menu`);
    if (force && this.open) this.say(changed.length ? '' : 'Up to date');
  }

  /** News stays highlighted while the panel is open, and counts as read once it closes. */
  private markSeen() {
    if (!this.unseen) return;
    this.reports = this.reports.map(({ unseen: _unseen, ...r }) => r);
    saveReports(this.reports);
    this.renderList();
    this.hooks.changed();
  }

  private onAction(a: string, b: HTMLElement) {
    switch (a) {
      case 'close':
        this.hooks.close();
        break;
      case 'kind':
        this.setKind(b.dataset.kind as Kind);
        break;
      case 'send':
        void this.send();
        break;
      case 'refresh':
        void this.refresh(true);
        break;
      case 'dev-save': {
        const input = this.q<HTMLInputElement>('.fb-dev-key');
        const v = input.value.trim();
        if (!v) return this.say('Paste the key first', true);
        setItem(STORE.devKey, v);
        input.value = '';
        this.renderDev();
        this.say('Developer key saved on this device. It is checked when you send your next report');
        break;
      }
      case 'dev-clear':
        setItem(STORE.devKey, '');
        this.renderDev();
        this.say('Developer key removed from this device');
        break;
    }
  }

  private setKind(k: Kind) {
    this.kind = k;
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-kind]')) {
      b.classList.toggle('on', b.dataset.kind === k);
      b.setAttribute('aria-selected', String(b.dataset.kind === k));
    }
    this.q('.fb-label').textContent = PROMPT[k].label;
    this.q<HTMLTextAreaElement>('textarea').placeholder = PROMPT[k].placeholder;
    this.updateSend();
  }

  private updateSend() {
    const btn = this.q<HTMLButtonElement>('.fb-send');
    btn.textContent = this.sending ? 'Sending…' : PROMPT[this.kind].send;
    btn.disabled = this.sending || !!textProblem(this.q<HTMLTextAreaElement>('textarea').value);
  }

  private say(msg: string, bad = false) {
    const p = this.q('.fb-msg');
    p.textContent = msg;
    p.classList.toggle('bad', bad);
  }

  private renderDev() {
    const on = !!getItem(STORE.devKey);
    this.q('.fb-dev-on').hidden = !on;
    this.q('.fb-dev-clear').hidden = !on;
    this.q<HTMLInputElement>('.fb-dev-key').placeholder = on ? 'A key is saved. Paste a new one to replace it' : 'Paste the admin key';
  }

  private async send() {
    const ta = this.q<HTMLTextAreaElement>('textarea');
    const problem = textProblem(ta.value);
    if (problem || this.sending) return this.say(problem ?? '', true);
    const name = this.q<HTMLInputElement>('.fb-name').value;
    setItem(STORE.name, name.trim());
    this.sending = true;
    this.say('');
    this.updateSend();
    const kind = this.kind;
    const r = await sendReport(kind, ta.value, {
      diag: this.q<HTMLInputElement>('.fb-diag').checked ? this.hooks.diag() : undefined,
      name,
      devKey: getItem(STORE.devKey) || undefined,
    });
    this.sending = false;
    if (r.ok) {
      ta.value = '';
      this.reports = addReport(this.reports, r.report);
      saveReports(this.reports);
      this.renderList();
      const what = kind === 'bug' ? 'Bug report' : 'Idea';
      this.say(
        r.report.dev
          ? `${what} sent and approved.`
          : r.devRejected
            ? `${what} sent, but the developer key wasn't accepted, so it waits for review. Check the key below.`
            : `${what} sent. Thank you! You'll see here how it fares.`,
        r.devRejected,
      );
    } else this.say(r.reason, true);
    this.updateSend();
  }

  private renderList() {
    const list = this.q('.fb-list');
    this.q('.fb-head').hidden = !this.reports.length;
    list.innerHTML = this.reports
      .map((r) => {
        const st = r.st ?? 'new';
        return `<li class="${r.unseen ? 'news' : ''}">
          <div class="fb-top"><span class="tag ${r.kind}">${r.kind === 'bug' ? 'Bug' : 'Idea'}</span><span class="st ${st}">${statusLabel(r)}</span><small>${ago(Date.now() - r.at)}</small></div>
          <p class="fb-text">${esc(r.text)}</p>
          ${r.ship ? `<p class="fb-ship"><b>Shipped</b> ${esc(r.ship)}</p>` : ''}
          ${r.re ? `<p class="fb-re"><b>Phil</b> ${esc(r.re)}</p>` : ''}
        </li>`;
      })
      .join('');
    if (this.reports.length >= KEEP) list.insertAdjacentHTML('beforeend', `<li class="fb-note">Only your last ${KEEP} reports are kept here.</li>`);
  }
}
