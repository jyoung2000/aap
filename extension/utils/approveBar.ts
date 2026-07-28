// In-page JobPilot UI injected by the content script: the review-first APPROVE BAR
// and the intervention (human-input) panel. Rendered inside a Shadow DOM so page CSS
// can't bleed in, and styled to match JobPilot's frosted, deep-blue design language.

const HOST_ID = 'jobpilot-inpage-ui';

const STYLES = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.jp-root {
  --accent: #2563eb;
  --accent-strong: #1d4ed8;
  --surface: rgba(255,255,255,0.72);
  --surface-solid: #ffffff;
  --text: #0f172a;
  --sub: #475569;
  --border: rgba(15,23,42,0.10);
  --input-bg: rgba(255,255,255,0.9);
  --shadow: 0 12px 40px rgba(15,23,42,0.22);
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}
@media (prefers-color-scheme: dark) {
  .jp-root {
    --surface: rgba(17,24,39,0.74);
    --surface-solid: #111827;
    --text: #e5e7eb;
    --sub: #9ca3af;
    --border: rgba(255,255,255,0.12);
    --input-bg: rgba(30,41,59,0.92);
    --shadow: 0 12px 40px rgba(0,0,0,0.5);
  }
}
.jp-card {
  position: fixed;
  z-index: 2147483647;
  background: var(--surface);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  backdrop-filter: blur(22px) saturate(180%);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  border-radius: 16px;
  transition: transform 180ms ease, opacity 180ms ease;
}
.jp-bar { left: 50%; transform: translateX(-50%); bottom: 20px; width: min(760px, calc(100vw - 40px)); padding: 14px 16px; }
.jp-panel { right: 20px; bottom: 20px; width: min(420px, calc(100vw - 40px)); max-height: min(70vh, 640px); overflow: auto; padding: 16px; }
.jp-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.jp-logo { width: 22px; height: 22px; border-radius: 7px; background: linear-gradient(135deg, var(--accent), #60a5fa); flex: 0 0 auto; position: relative; }
.jp-logo::after { content: ''; position: absolute; inset: 6px; border-radius: 3px; background: #fff; clip-path: polygon(0 100%, 100% 45%, 40% 55%); }
.jp-title { font-weight: 650; letter-spacing: -0.01em; }
.jp-sub { color: var(--sub); font-size: 12px; }
.jp-spacer { flex: 1; }
.jp-values { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 12px; max-height: 160px; overflow: auto; }
.jp-chip { display: flex; flex-direction: column; gap: 2px; background: var(--input-bg); border: 1px solid var(--border); border-radius: 10px; padding: 6px 10px; max-width: 240px; }
.jp-chip .k { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--sub); }
.jp-chip .v { font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jp-chip input { font: inherit; border: 1px solid var(--accent); border-radius: 6px; padding: 2px 4px; background: var(--surface-solid); color: var(--text); }
.jp-actions { display: flex; gap: 8px; align-items: center; }
.jp-btn { font: inherit; font-weight: 600; border-radius: 10px; padding: 8px 14px; border: 1px solid var(--border); background: var(--input-bg); color: var(--text); cursor: pointer; transition: all 150ms ease; }
.jp-btn:hover { border-color: var(--accent); }
.jp-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.jp-btn.primary:hover { background: var(--accent-strong); }
.jp-btn.ghost { background: transparent; }
.jp-kbd { font-size: 10px; color: var(--sub); border: 1px solid var(--border); border-radius: 5px; padding: 0 4px; margin-left: 6px; }
.jp-field { margin-bottom: 14px; }
.jp-q { font-weight: 600; margin-bottom: 6px; }
.jp-badge { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #b91c1c; background: rgba(220,38,38,0.12); border-radius: 6px; padding: 1px 6px; margin-left: 6px; }
.jp-input, .jp-select { width: 100%; font: inherit; border: 1px solid var(--border); border-radius: 10px; padding: 9px 11px; background: var(--input-bg); color: var(--text); outline: none; transition: border-color 150ms ease; }
.jp-input:focus, .jp-select:focus { border-color: var(--accent); }
.jp-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.jp-opt { border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; cursor: pointer; background: var(--input-bg); transition: all 150ms ease; }
.jp-opt:hover, .jp-opt.sel { border-color: var(--accent); color: var(--accent); }
.jp-save { display: flex; align-items: center; gap: 7px; color: var(--sub); font-size: 12px; margin: 8px 0 4px; cursor: pointer; }
.jp-row { display: flex; justify-content: flex-end; }
.jp-resolved { opacity: 0.5; }
`;

function mountHost(): ShadowRoot {
  let host = document.getElementById(HOST_ID) as HTMLElement | null;
  if (host && host.shadowRoot) return host.shadowRoot;
  host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);
  const root = document.createElement('div');
  root.className = 'jp-root';
  shadow.appendChild(root);
  (document.documentElement || document.body).appendChild(host);
  return shadow;
}

function root(shadow: ShadowRoot): HTMLElement {
  return shadow.querySelector('.jp-root') as HTMLElement;
}

function headMarkup(subtitle: string): string {
  return `<div class="jp-head"><div class="jp-logo"></div>
    <div><div class="jp-title">JobPilot</div><div class="jp-sub">${escapeHtml(subtitle)}</div></div>
    <div class="jp-spacer"></div></div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// --- Approve bar (review-first) ---

export interface ApproveItem {
  label: string;
  value: string;
}
export interface ApproveResult {
  decision: 'approve' | 'skip';
  values: Record<string, string>;
}

export function showApproveBar(items: ApproveItem[]): Promise<ApproveResult> {
  const shadow = mountHost();
  const r = root(shadow);
  const values: Record<string, string> = {};
  items.forEach((it) => (values[it.label] = it.value));
  let editing = false;

  const card = document.createElement('div');
  card.className = 'jp-card jp-bar';
  r.appendChild(card);

  const render = () => {
    card.innerHTML =
      headMarkup('Review before submitting') +
      `<div class="jp-values">${items
        .map(
          (it, i) =>
            `<div class="jp-chip"><span class="k">${escapeHtml(it.label)}</span>` +
            (editing
              ? `<input data-i="${i}" value="${escapeHtml(values[it.label] ?? '')}" />`
              : `<span class="v" title="${escapeHtml(values[it.label] ?? '')}">${escapeHtml(values[it.label] || '—')}</span>`) +
            `</div>`,
        )
        .join('')}</div>` +
      `<div class="jp-actions">
        <button class="jp-btn primary" data-act="approve">Approve &amp; Submit<span class="jp-kbd">A</span></button>
        <button class="jp-btn" data-act="edit">${editing ? 'Done' : 'Edit'}<span class="jp-kbd">E</span></button>
        <button class="jp-btn ghost" data-act="skip">Skip<span class="jp-kbd">S</span></button>
        <div class="jp-spacer"></div><div class="jp-sub">${items.length} field${items.length === 1 ? '' : 's'}</div>
      </div>`;
    card.querySelectorAll<HTMLInputElement>('input[data-i]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = Number(inp.dataset.i);
        values[items[idx].label] = inp.value;
      });
    });
  };

  return new Promise<ApproveResult>((resolve) => {
    const finish = (decision: 'approve' | 'skip') => {
      document.removeEventListener('keydown', onKey, true);
      card.remove();
      resolve({ decision, values });
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const k = e.key.toLowerCase();
      if (k === 'a') { e.preventDefault(); finish('approve'); }
      else if (k === 's') { e.preventDefault(); finish('skip'); }
      else if (k === 'e') { e.preventDefault(); editing = !editing; render(); }
    };
    card.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
      if (act === 'approve') finish('approve');
      else if (act === 'skip') finish('skip');
      else if (act === 'edit') { editing = !editing; render(); }
    });
    document.addEventListener('keydown', onKey, true);
    render();
  });
}

// --- Intervention panel (human input) ---

export interface IvQuestion {
  id: string;
  label: string;
  question: string;
  field_type: string;
  options: string[];
  kind: string;
  is_knockout?: boolean;
}

export interface InterventionPanelHandle {
  markResolved(id: string, answer: string): void;
  close(): void;
}

export function showInterventionPanel(
  items: IvQuestion[],
  onAnswer: (id: string, answer: string, save: boolean) => void,
): InterventionPanelHandle {
  const shadow = mountHost();
  const r = root(shadow);
  const card = document.createElement('div');
  card.className = 'jp-card jp-panel';
  r.appendChild(card);

  const fieldHtml = (it: IvQuestion): string => {
    const knock = it.is_knockout ? '<span class="jp-badge">knockout</span>' : '';
    let control: string;
    if (it.options && it.options.length) {
      control =
        `<div class="jp-opts" data-opts="${it.id}">` +
        it.options.map((o) => `<div class="jp-opt" data-val="${escapeHtml(o)}">${escapeHtml(o)}</div>`).join('') +
        `</div>`;
    } else if (it.field_type === 'textarea') {
      control = `<textarea class="jp-input" data-input="${it.id}" rows="3"></textarea>`;
    } else {
      control = `<input class="jp-input" data-input="${it.id}" type="text" />`;
    }
    return `<div class="jp-field" data-field="${it.id}">
      <div class="jp-q">${escapeHtml(it.question || it.label)}${knock}</div>
      ${control}
      <label class="jp-save"><input type="checkbox" data-save="${it.id}" checked /> Save for future applications</label>
      <div class="jp-row"><button class="jp-btn primary" data-submit="${it.id}">Answer</button></div>
    </div>`;
  };

  card.innerHTML =
    headMarkup(`${items.length} question${items.length === 1 ? '' : 's'} need your input`) +
    items.map(fieldHtml).join('');

  const chosen: Record<string, string> = {};
  card.querySelectorAll<HTMLElement>('[data-opts]').forEach((wrap) => {
    wrap.addEventListener('click', (e) => {
      const opt = (e.target as HTMLElement).closest('.jp-opt') as HTMLElement | null;
      if (!opt) return;
      wrap.querySelectorAll('.jp-opt').forEach((o) => o.classList.remove('sel'));
      opt.classList.add('sel');
      chosen[wrap.getAttribute('data-opts')!] = opt.getAttribute('data-val') || '';
    });
  });

  card.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest('[data-submit]')?.getAttribute('data-submit');
    if (!id) return;
    const input = card.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-input="${id}"]`);
    const save = card.querySelector<HTMLInputElement>(`[data-save="${id}"]`)?.checked ?? true;
    const answer = (chosen[id] ?? input?.value ?? '').trim();
    if (!answer) return;
    onAnswer(id, answer, save);
    handle.markResolved(id, answer);
  });

  const handle: InterventionPanelHandle = {
    markResolved(id: string) {
      const field = card.querySelector(`[data-field="${id}"]`);
      if (field) {
        field.classList.add('jp-resolved');
        field.querySelectorAll('input, textarea, button, .jp-opt').forEach((el) =>
          ((el as HTMLElement).style.pointerEvents = 'none'),
        );
      }
    },
    close() {
      card.remove();
    },
  };
  return handle;
}
