import { defineContentScript } from 'wxt/utils/define-content-script';
import browser from 'webextension-polyfill';
import { CMD, sendToBackground, type RuntimeMessage } from '../utils/protocol';
import type { InterventionItem, ResolveResult, ResultReport, StartFillingPayload } from '../utils/types';
import {
  clickReal,
  cropDataUrl,
  deriveLabel,
  detectBlocker,
  fillField,
  findNav,
  findSubmitButton,
  isVisible,
  pageSignature,
  rand,
  scanFields,
  sleep,
  toDescriptor,
  waitForStep,
  type ScannedField,
} from '../utils/dom';
import {
  showApproveBar,
  showInterventionPanel,
  type IvQuestion,
} from '../utils/approveBar';

/** Signal that a run cannot proceed without a human at this machine. */
class NeedsHuman extends Error {}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

// Maps normalized field label -> resolver, so remotely-delivered answers
// (ws `intervention.answered`) can unblock the live form.
const answerWaiters = new Map<string, (answer: string) => void>();

let activeRun = false;

const bg = {
  resolveFields: (appId: string, fields: ReturnType<typeof toDescriptor>[]) =>
    sendToBackground<ResolveResult>({ cmd: CMD.RESOLVE_FIELDS, appId, fields }),
  raiseBlocker: (appId: string, kind: string, question: string, screenshot: string) =>
    sendToBackground<{ intervention_id: string }>({ cmd: CMD.RAISE_BLOCKER, appId, kind, question, screenshot }),
  listInterventions: (appId: string) =>
    sendToBackground<InterventionItem[]>({ cmd: CMD.LIST_INTERVENTIONS, appId }),
  answerIntervention: (id: string, answer: string, save: boolean) =>
    sendToBackground({ cmd: CMD.ANSWER_INTERVENTION, id, answer, save }),
  reportResult: (appId: string, report: ResultReport) =>
    sendToBackground({ cmd: CMD.REPORT_RESULT, appId, report }),
  captureTab: () => sendToBackground<string>({ cmd: CMD.CAPTURE_TAB }),
  bringToFront: () => sendToBackground({ cmd: CMD.BRING_TO_FRONT }),
  notify: (title: string, message: string) => sendToBackground({ cmd: CMD.NOTIFY, title, message }),
  fetchResume: () =>
    sendToBackground<{ name: string; type: string; base64: string } | null>({ cmd: CMD.FETCH_RESUME }),
};

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  allFrames: false,
  main() {
    browser.runtime.onMessage.addListener((message: unknown) => {
      const msg = message as RuntimeMessage;
      if (msg.cmd === CMD.START_FILLING) {
        void startRun(msg as unknown as StartFillingPayload);
        return Promise.resolve({ ok: true });
      }
      if (msg.cmd === CMD.INTERVENTION_ANSWERED) {
        const waiter = answerWaiters.get(norm(String(msg.label || '')));
        if (waiter) waiter(String(msg.answer || ''));
        return Promise.resolve({ ok: true });
      }
      return undefined;
    });

    // Announce readiness so the background can begin a run if this tab is a run target.
    void sendToBackground({ cmd: CMD.CONTENT_READY, url: location.href }).catch(() => {});
  },
});

async function startRun(payload: StartFillingPayload): Promise<void> {
  if (activeRun) return;
  activeRun = true;
  const { applicationId, humanized, reviewFirst } = payload;
  const filled: Record<string, string> = {};

  try {
    let step = 0;
    const MAX_STEPS = 8;

    while (step < MAX_STEPS) {
      const blocker = detectBlocker();
      if (blocker) await handleBlocker(applicationId, blocker);

      const scanned = scanFields();
      if (scanned.length) {
        const descriptors = scanned.map(toDescriptor);
        const result = await bg.resolveFields(applicationId, descriptors);

        for (const rf of result.resolved) {
          if (!rf.value) continue;
          const f =
            scanned.find((sf) => !sf.filled && norm(sf.label) === norm(rf.label)) ||
            scanned.find((sf) => !sf.filled && norm(sf.label).includes(norm(rf.label)));
          if (!f) continue;
          try {
            await fillField(f, rf.value, humanized);
            filled[f.label] = rf.value;
          } catch {
            /* keep going */
          }
          if (humanized) await sleep(rand(2000, 8000)); // between-field reading pause
        }

        await handleFileInputs();

        if (result.interventions.length) {
          await handleInterventions(applicationId, result.interventions, scanned, humanized, filled);
        }
      }

      const nav = findNav();
      if (nav.type === 'next' && nav.el) {
        const sig = pageSignature();
        if (humanized) await sleep(rand(1500, 4000));
        clickReal(nav.el);
        await waitForStep(sig);
        step++;
        continue;
      }
      break; // reached the final step
    }

    await submitStage(applicationId, humanized, reviewFirst, filled);
  } catch (e) {
    if (e instanceof NeedsHuman) {
      await bg.reportResult(applicationId, { status: 'needs_human', field_snapshot: filled, error: e.message });
    } else {
      await bg.reportResult(applicationId, {
        status: 'failed',
        field_snapshot: filled,
        error: String((e as Error)?.message || e),
      });
    }
  } finally {
    activeRun = false;
  }
}

async function submitStage(
  applicationId: string,
  humanized: boolean,
  reviewFirst: boolean,
  filled: Record<string, string>,
): Promise<void> {
  if (reviewFirst) {
    const items = Object.entries(filled).map(([label, value]) => ({ label, value }));
    const decision = await showApproveBar(items);
    if (decision.decision === 'skip') {
      await bg.reportResult(applicationId, { status: 'skipped', field_snapshot: filled });
      return;
    }
    for (const [label, value] of Object.entries(decision.values)) {
      if (value !== filled[label]) {
        const f = scanFields().find((sf) => norm(sf.label) === norm(label));
        if (f) {
          try {
            await fillField(f, value, false);
          } catch {
            /* ignore */
          }
        }
        filled[label] = value;
      }
    }
  }

  // A required file input we couldn't populate must be finished by a human.
  const emptyFile = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))
    .filter(isVisible)
    .find((inp) => !(inp.files && inp.files.length) && (inp.required || /resume|cv|curriculum/i.test(deriveLabel(inp))));
  if (emptyFile) {
    await bg.raiseBlocker(applicationId, 'confirm', 'Attach your resume/file, then submit.', '');
    await bg.bringToFront();
    await bg.notify('JobPilot needs your resume', 'Attach the required file to finish this application.');
    await bg.reportResult(applicationId, {
      status: 'needs_human',
      field_snapshot: filled,
      error: 'Manual file upload required (at browser)',
    });
    return;
  }

  const submitBtn = findSubmitButton();
  if (!submitBtn) {
    await bg.bringToFront();
    await bg.notify('JobPilot needs you', 'Could not find a submit button — finish this one manually.');
    await bg.reportResult(applicationId, {
      status: 'needs_human',
      field_snapshot: filled,
      error: 'No submit button found',
    });
    return;
  }

  const sig = pageSignature();
  clickReal(submitBtn);
  await waitForConfirmation(sig);

  let shot = '';
  try {
    await bg.bringToFront();
    shot = await bg.captureTab();
  } catch {
    /* screenshot is best-effort */
  }

  await bg.reportResult(applicationId, {
    status: 'submitted',
    field_snapshot: filled,
    confirmation_screenshot: shot,
  });
  await bg.notify('Application submitted', 'JobPilot submitted your application.');
}

const CONFIRM_RE = /thank you|application (received|submitted|complete)|we('| ha)ve received|successfully (applied|submitted)/i;

async function waitForConfirmation(prevSig: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(600);
    if (pageSignature() !== prevSig) return;
    if (CONFIRM_RE.test(document.body?.innerText || '')) return;
  }
}

async function handleBlocker(appId: string, kind: 'captcha' | 'login'): Promise<void> {
  const el =
    document.querySelector<HTMLElement>(
      'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, .h-captcha, [data-sitekey]',
    ) || document.querySelector<HTMLElement>('input[type="password"]');
  // Screenshot is captured for the operator's view but not persisted inline
  // (backend stores a short reference), so we only use it to prime the remote view.
  try {
    const shot = await bg.captureTab();
    if (shot && el) await cropDataUrl(shot, el.getBoundingClientRect());
  } catch {
    /* ignore */
  }

  const question = kind === 'captcha' ? 'Solve the CAPTCHA to continue' : 'Sign in to continue';
  const res = await bg.raiseBlocker(appId, kind, question, '');
  await bg.bringToFront();
  await bg.notify('JobPilot paused', `${question} — finish it in this tab.`);

  const ivId = res?.intervention_id;
  const start = Date.now();
  while (Date.now() - start < 180000) {
    await sleep(4000);
    if (detectBlocker() == null) return; // cleared in-tab
    try {
      const open = await bg.listInterventions(appId);
      if (ivId && !open.find((o) => o.id === ivId)) return; // resolved elsewhere / remotely
    } catch {
      /* keep waiting */
    }
  }
  throw new NeedsHuman(`${kind} was not solved in time`);
}

async function handleInterventions(
  appId: string,
  interventions: InterventionItem[],
  scanned: ScannedField[],
  humanized: boolean,
  filled: Record<string, string>,
): Promise<void> {
  await bg.bringToFront();
  await bg.notify('JobPilot needs your input', `${interventions.length} question(s) to answer.`);

  const questions: IvQuestion[] = interventions.map((iv) => ({
    id: iv.id,
    label: iv.label || iv.field_label || iv.question || '',
    question: iv.question || iv.label || iv.field_label || '',
    field_type: iv.field_type || 'text',
    options: iv.options || [],
    kind: iv.kind || 'field',
    is_knockout: iv.is_knockout,
  }));

  const pending = new Set(questions.map((q) => q.id));

  const applyAnswer = async (q: IvQuestion, answer: string): Promise<void> => {
    filled[q.label] = answer;
    if (q.kind !== 'field') return;
    const f =
      scanned.find((sf) => norm(sf.label) === norm(q.label)) ||
      scanFields().find((sf) => norm(sf.label) === norm(q.label));
    if (f) {
      try {
        await fillField(f, answer, humanized);
      } catch {
        /* ignore */
      }
    }
  };

  await new Promise<void>((resolve, reject) => {
    let panel: ReturnType<typeof showInterventionPanel>;
    let poll: ReturnType<typeof setInterval>;
    let timeout: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearInterval(poll);
      clearTimeout(timeout);
      for (const q of questions) answerWaiters.delete(norm(q.label));
      panel?.close();
    };

    const resolveOne = async (q: IvQuestion, answer: string): Promise<void> => {
      if (!pending.has(q.id)) return;
      pending.delete(q.id);
      panel?.markResolved(q.id, answer);
      await applyAnswer(q, answer);
      if (pending.size === 0) {
        cleanup();
        resolve();
      }
    };

    panel = showInterventionPanel(questions, (id, answer, save) => {
      void bg.answerIntervention(id, answer, save);
      const q = questions.find((x) => x.id === id);
      if (q) void resolveOne(q, answer);
    });

    for (const q of questions) answerWaiters.set(norm(q.label), (answer) => void resolveOne(q, answer));

    poll = setInterval(async () => {
      try {
        const open = await bg.listInterventions(appId);
        const openIds = new Set(open.map((o) => o.id));
        for (const q of [...questions]) {
          if (pending.has(q.id) && !openIds.has(q.id)) {
            await resolveOne(q, filled[q.label] ?? ''); // resolved elsewhere without an inline answer
          }
        }
      } catch {
        /* keep polling */
      }
    }, 3000);

    timeout = setTimeout(() => {
      cleanup();
      reject(new NeedsHuman('Timed out waiting for human input'));
    }, 180000);
  });
}

async function handleFileInputs(): Promise<void> {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter(isVisible);
  if (!inputs.length) return;
  const resume = await bg.fetchResume().catch(() => null);
  if (!resume) return; // no bytes available — the submit stage will pause for a human
  for (const inp of inputs) {
    const label = deriveLabel(inp).toLowerCase();
    const wantsResume = /resume|cv|curriculum/.test(label) || inputs.length === 1;
    if (!wantsResume) continue;
    try {
      const file = base64ToFile(resume.base64, resume.name, resume.type);
      const dt = new DataTransfer();
      dt.items.add(file);
      inp.files = dt.files;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {
      /* skip gracefully */
    }
  }
}

function base64ToFile(base64: string, name: string, type: string): File {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type });
}
