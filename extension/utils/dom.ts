import type { FieldDescriptor } from './types';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
export const rand = (min: number, max: number): number => min + Math.random() * (max - min);
export const randInt = (min: number, max: number): number => Math.floor(rand(min, max + 1));

export type FieldKind = 'text' | 'textarea' | 'select' | 'checkbox' | 'radio';

export interface ScannedField {
  key: string;
  label: string;
  type: string; // descriptor type sent to the backend
  options: string[];
  kind: FieldKind;
  elements: HTMLElement[]; // radio groups hold every option; others hold one element
  filled: boolean;
}

type Fillable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset', 'file']);

export function isVisible(el: Element): boolean {
  const he = el as HTMLElement;
  if (he.hidden) return false;
  const style = getComputedStyle(he);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = he.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
}

function cssEscape(v: string): string {
  const c = (globalThis as unknown as { CSS?: { escape?: (s: string) => string } }).CSS;
  return c?.escape ? c.escape(v) : v.replace(/["\\]/g, '\\$&');
}

function humanize(raw: string): string {
  return raw
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function clean(text: string): string {
  return text.replace(/[\s\u00a0]+/g, ' ').trim().slice(0, 200);
}

function precedingText(el: Element): string {
  // Look at the element (or its field wrapper) and the nearest preceding text.
  let node: Element | null = el;
  for (let i = 0; i < 4 && node; i++) {
    let sib = node.previousElementSibling;
    while (sib) {
      const tag = sib.tagName.toLowerCase();
      if (!['script', 'style', 'input', 'select', 'textarea'].includes(tag)) {
        const t = clean(sib.textContent || '');
        if (t && t.length <= 120) return t;
      }
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  return '';
}

export function deriveLabel(el: HTMLElement): string {
  const doc = el.ownerDocument;
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const t = labelledby
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    if (t) return clean(t);
  }
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return clean(aria);

  if (el.id) {
    const forLabel = doc.querySelector(`label[for="${cssEscape(el.id)}"]`);
    if (forLabel?.textContent?.trim()) return clean(forLabel.textContent);
  }
  const wrap = el.closest('label');
  if (wrap?.textContent?.trim()) return clean(wrap.textContent);

  const ph = el.getAttribute('placeholder');
  if (ph && ph.trim()) return clean(ph);

  const prev = precedingText(el);
  if (prev) return prev;

  const name = el.getAttribute('name') || el.id;
  if (name) return humanize(name);
  return '';
}

function normalizeType(el: Fillable): string {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  const t = (el.getAttribute('type') || 'text').toLowerCase();
  if (t === 'checkbox') return 'boolean';
  if (t === 'radio') return 'radio';
  if (['email', 'tel', 'url', 'number'].includes(t)) return t;
  if (['date', 'month', 'week', 'time', 'datetime-local'].includes(t)) return 'date';
  return 'text';
}

function selectOptions(el: HTMLSelectElement): string[] {
  return Array.from(el.options)
    .map((o) => clean(o.textContent || o.value))
    .filter((v) => v && !/^(select|choose|please select|--)/i.test(v));
}

/** Scan the current document for fillable fields, grouping radio buttons by name. */
export function scanFields(): ScannedField[] {
  const out: ScannedField[] = [];
  const radioGroups = new Map<string, HTMLInputElement[]>();
  const nodes = Array.from(document.querySelectorAll<Fillable>('input, textarea, select'));

  for (const el of nodes) {
    if (el instanceof HTMLInputElement) {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      if (SKIP_INPUT_TYPES.has(t)) continue;
    }
    if ((el as HTMLInputElement).disabled) continue;
    if (!isVisible(el)) continue;

    if (el instanceof HTMLInputElement && el.type === 'radio') {
      const key = el.name || deriveLabel(el);
      const arr = radioGroups.get(key) || [];
      arr.push(el);
      radioGroups.set(key, arr);
      continue;
    }

    const kind: FieldKind =
      el instanceof HTMLTextAreaElement
        ? 'textarea'
        : el instanceof HTMLSelectElement
          ? 'select'
          : el.type === 'checkbox'
            ? 'checkbox'
            : 'text';

    out.push({
      key: el.id || el.getAttribute('name') || `f${out.length}`,
      label: deriveLabel(el),
      type: normalizeType(el),
      options: el instanceof HTMLSelectElement ? selectOptions(el) : [],
      kind,
      elements: [el],
      filled: false,
    });
  }

  for (const [name, radios] of radioGroups) {
    if (!radios.length) continue;
    const groupLabel = deriveLabel(radios[0].closest('fieldset') || radios[0]) || humanize(name);
    out.push({
      key: name,
      label: groupLabel,
      type: 'radio',
      options: radios.map((r) => radioLabel(r)),
      kind: 'radio',
      elements: radios,
      filled: false,
    });
  }

  return out.filter((f) => f.label);
}

function radioLabel(r: HTMLInputElement): string {
  const doc = r.ownerDocument;
  if (r.id) {
    const l = doc.querySelector(`label[for="${cssEscape(r.id)}"]`);
    if (l?.textContent?.trim()) return clean(l.textContent);
  }
  const wrap = r.closest('label');
  if (wrap?.textContent?.trim()) return clean(wrap.textContent);
  return clean(r.value || '');
}

export function toDescriptor(f: ScannedField): FieldDescriptor {
  return { label: f.label, type: f.type, options: f.options };
}

/** Set a value through the native prototype setter so React/Vue trackers fire. */
export function setNativeValue(el: Fillable, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  const ownDesc = Object.getOwnPropertyDescriptor(el, 'value');
  const setter = desc?.set;
  const ownSetter = ownDesc?.set;
  if (setter && ownSetter && setter !== ownSetter) {
    setter.call(el, value);
  } else if (setter) {
    setter.call(el, value);
  } else {
    (el as unknown as { value: string }).value = value;
  }
}

function fire(el: Element, type: string, init: EventInit = {}): void {
  el.dispatchEvent(new Event(type, { bubbles: true, ...init }));
}

function fireInput(el: Element): void {
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: false }));
}

function fireKey(el: Element, type: 'keydown' | 'keypress' | 'keyup', ch: string): void {
  el.dispatchEvent(
    new KeyboardEvent(type, { bubbles: true, cancelable: true, key: ch, char: ch }),
  );
}

export function scrollIntoView(el: HTMLElement): void {
  try {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {
    /* ignore */
  }
}

/** Realistic pointer + click sequence. */
export function clickReal(el: HTMLElement): void {
  scrollIntoView(el);
  const opts = { bubbles: true, cancelable: true, view: window } as MouseEventInit;
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
  try {
    el.click();
  } catch {
    /* ignore */
  }
}

/** Type a value character-by-character with human cadence and the full event chain. */
export async function humanType(el: Fillable, value: string): Promise<void> {
  scrollIntoView(el);
  el.focus();
  fire(el, 'focus');
  setNativeValue(el, '');
  let current = '';
  for (const ch of value) {
    fireKey(el, 'keydown', ch);
    fireKey(el, 'keypress', ch);
    current += ch;
    setNativeValue(el, current);
    fireInput(el);
    fireKey(el, 'keyup', ch);
    // Variable cadence 60–180ms, with the occasional longer pause.
    await sleep(Math.random() < 0.08 ? rand(300, 700) : rand(60, 180));
  }
  fire(el, 'change');
  fire(el, 'blur');
  el.blur();
}

function fastText(el: Fillable, value: string): void {
  el.focus();
  setNativeValue(el, value);
  fireInput(el);
  fire(el, 'change');
  fire(el, 'blur');
}

function selectOption(el: HTMLSelectElement, value: string): boolean {
  const want = value.trim().toLowerCase();
  let idx = -1;
  Array.from(el.options).forEach((o, i) => {
    const txt = (o.textContent || o.value).trim().toLowerCase();
    if (idx === -1 && (txt === want || o.value.toLowerCase() === want)) idx = i;
  });
  if (idx === -1) {
    Array.from(el.options).forEach((o, i) => {
      const txt = (o.textContent || o.value).trim().toLowerCase();
      if (idx === -1 && want && (txt.includes(want) || want.includes(txt))) idx = i;
    });
  }
  if (idx === -1) return false;
  el.selectedIndex = idx;
  fireInput(el);
  fire(el, 'change');
  fire(el, 'blur');
  return true;
}

function truthy(value: string): boolean {
  return /^(yes|true|on|1|checked|agree|i agree|accept)/i.test(value.trim());
}

/** Fill one scanned field with the resolved value, honoring humanized vs fast mode. */
export async function fillField(f: ScannedField, value: string, humanized: boolean): Promise<boolean> {
  if (value == null) return false;
  const first = f.elements[0];

  if (f.kind === 'radio') {
    const want = value.trim().toLowerCase();
    let target = f.elements.find((r) => radioLabel(r as HTMLInputElement).toLowerCase() === want);
    if (!target) target = f.elements.find((r) => radioLabel(r as HTMLInputElement).toLowerCase().includes(want));
    if (!target) return false;
    (target as HTMLInputElement).checked = true;
    clickReal(target);
    fire(target, 'input');
    fire(target, 'change');
    f.filled = true;
    return true;
  }

  if (f.kind === 'checkbox') {
    const box = first as HTMLInputElement;
    const desired = truthy(value);
    if (box.checked !== desired) clickReal(box);
    box.checked = desired;
    fire(box, 'input');
    fire(box, 'change');
    f.filled = true;
    return true;
  }

  if (f.kind === 'select') {
    const sel = first as HTMLSelectElement;
    if (humanized) {
      scrollIntoView(sel);
      sel.focus();
      fire(sel, 'mousedown');
      await sleep(rand(200, 500));
    }
    const ok = selectOption(sel, value);
    f.filled = ok;
    return ok;
  }

  // text / textarea
  const el = first as HTMLInputElement | HTMLTextAreaElement;
  if (humanized) await humanType(el, value);
  else fastText(el, value);
  f.filled = true;
  return true;
}

// --- Blocker detection & wizard navigation ---

export function detectBlocker(): 'captcha' | 'login' | null {
  const captcha = document.querySelector(
    'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, .h-captcha, [data-sitekey], iframe[title*="captcha" i], #cf-chl-widget',
  );
  if (captcha && isVisible(captcha)) return 'captcha';

  const pw = document.querySelector<HTMLInputElement>('input[type="password"]');
  const looksLikeAuth = /login|signin|sign-in|auth|account\/sign/i.test(location.href);
  if (pw && isVisible(pw) && looksLikeAuth) return 'login';
  return null;
}

interface Actionable {
  el: HTMLElement;
  text: string;
}

function actionables(): Actionable[] {
  const sel = 'button, input[type="submit"], input[type="button"], [role="button"], a[href]';
  return Array.from(document.querySelectorAll<HTMLElement>(sel))
    .filter((el) => isVisible(el) && !(el as HTMLButtonElement).disabled)
    .map((el) => ({
      el,
      text: clean(
        (el as HTMLInputElement).value || el.getAttribute('aria-label') || el.textContent || '',
      ).toLowerCase(),
    }))
    .filter((a) => a.text);
}

const SUBMIT_RE = /\b(submit application|submit|apply now|send application|finish|complete application)\b/i;
const NEXT_RE = /\b(next|continue|save (and|&) continue|proceed|review)\b/i;

export function findNav(): { type: 'submit' | 'next' | 'none'; el: HTMLElement | null } {
  const acts = actionables();
  const next = acts.find((a) => NEXT_RE.test(a.text) && !SUBMIT_RE.test(a.text));
  if (next) return { type: 'next', el: next.el };
  const submit = acts.find((a) => SUBMIT_RE.test(a.text));
  if (submit) return { type: 'submit', el: submit.el };
  return { type: 'none', el: null };
}

export function findSubmitButton(): HTMLElement | null {
  const acts = actionables();
  return acts.find((a) => SUBMIT_RE.test(a.text))?.el ?? null;
}

export function pageSignature(): string {
  const inputs = document.querySelectorAll('input, textarea, select');
  const first = scanFields()[0]?.label || '';
  return `${location.href}|${inputs.length}|${first}`;
}

/** Wait for the page to advance to a new wizard step (signature change) or settle. */
export async function waitForStep(prevSig: string, timeoutMs = 12000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(400);
    if (pageSignature() !== prevSig) {
      await sleep(700); // settle
      return;
    }
  }
}

/** Crop a full-tab screenshot dataURL to an element's bounding box (best effort). */
export async function cropDataUrl(dataUrl: string, rect: DOMRect): Promise<string> {
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('img load'));
      img.src = dataUrl;
    });
    const dpr = window.devicePixelRatio || 1;
    const pad = 12 * dpr;
    const sx = Math.max(0, rect.left * dpr - pad);
    const sy = Math.max(0, rect.top * dpr - pad);
    const sw = Math.min(img.width - sx, rect.width * dpr + pad * 2);
    const sh = Math.min(img.height - sy, rect.height * dpr + pad * 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, sw);
    canvas.height = Math.max(1, sh);
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return dataUrl;
  }
}
