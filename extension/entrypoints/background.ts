import { defineBackground } from 'wxt/utils/define-background';
import browser from 'webextension-polyfill';
import { Api } from '../utils/api';
import { CMD, WS, type RuntimeMessage, type WsMessage } from '../utils/protocol';
import { clearPairState, getAutoRun, getPairState, setLinkConnected } from '../utils/storage';
import {
  DebuggerScreencast,
  isDebuggerAvailable,
  requestDebuggerPermission,
} from '../utils/debuggerScreencast';
import type {
  BackgroundState,
  PairState,
  QueueApp,
  QueueResponse,
  ResultReport,
} from '../utils/types';

/** Minimal shape of the message sender we rely on. */
interface Sender {
  tab?: { id?: number };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const randBetween = (min: number, max: number): number => Math.floor(min + Math.random() * (max - min));

const ALARM_KEEPALIVE = 'jobpilot-keepalive';

let pair: PairState | null = null;
let api: Api | null = null;
let ws: WebSocket | null = null;
let wsBackoff = 1000;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

const tabToApp = new Map<number, string>();
const appToTab = new Map<string, number>();
const runParams = new Map<string, QueueApp>();
const runResolvers = new Map<string, () => void>();
const runTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const startedTabs = new Set<number>();
const screencasts = new Map<string, DebuggerScreencast>();

const state: BackgroundState = {
  paired: false,
  linkConnected: false,
  running: false,
  autoRun: true,
  userEmail: '',
  apiBase: '',
  builtinVersion: '1.0.0',
  current: null,
  recent: [],
  interventions: [],
  debuggerAvailable: false,
};

export default defineBackground({
  persistent: true, // MV2 (Firefox) → persistent page; ignored on MV3 (Chrome SW).
  type: 'module',
  main() {
    // Listeners must be registered synchronously for MV3 service workers.
    browser.runtime.onMessage.addListener((msg: unknown, sender: unknown) =>
      handleMessage(msg as RuntimeMessage, sender as Sender),
    );

    browser.alarms.onAlarm.addListener((a) => {
      if (a.name === ALARM_KEEPALIVE) void onKeepAlive();
    });

    browser.tabs.onUpdated.addListener((tabId, info) => {
      if (info.status === 'complete' && tabToApp.has(tabId) && !startedTabs.has(tabId)) {
        setTimeout(() => startFillingForTab(tabId), 800);
      }
    });

    browser.tabs.onRemoved.addListener((tabId) => {
      const appId = tabToApp.get(tabId);
      tabToApp.delete(tabId);
      startedTabs.delete(tabId);
      if (appId && runResolvers.has(appId)) completeRun(appId, 'needs_human', 'Tab closed');
    });

    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.deviceToken || changes.apiBase)) void reloadPair();
    });

    browser.runtime.onStartup?.addListener?.(() => void init());
    browser.runtime.onInstalled?.addListener?.(() => void init());

    void init();
  },
});

async function init(): Promise<void> {
  state.builtinVersion = browser.runtime.getManifest().version;
  state.debuggerAvailable = isDebuggerAvailable();
  state.autoRun = await getAutoRun();
  ensureAlarm();
  await reloadPair();
}

function ensureAlarm(): void {
  browser.alarms.create(ALARM_KEEPALIVE, { periodInMinutes: 0.5 });
}

async function reloadPair(): Promise<void> {
  pair = await getPairState();
  if (pair) {
    api = new Api(pair.apiBase, pair.deviceToken);
    state.paired = true;
    state.userEmail = pair.userEmail;
    state.apiBase = pair.apiBase;
    connectWs();
  } else {
    api = null;
    state.paired = false;
    state.apiBase = '';
    state.userEmail = '';
  }
  broadcast();
}

// --- WebSocket link ---

function connectWs(): void {
  if (!pair) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(`${pair.wsUrl}?token=${encodeURIComponent(pair.deviceToken)}`);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    wsBackoff = 1000;
    void setConnected(true);
    startPing();
  };
  ws.onmessage = (ev) => handleWs(ev);
  ws.onclose = () => {
    void setConnected(false);
    stopPing();
    scheduleReconnect();
  };
  ws.onerror = () => {
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  };
}

function scheduleReconnect(): void {
  if (!pair) return;
  const delay = wsBackoff;
  wsBackoff = Math.min(wsBackoff * 2, 30000);
  setTimeout(connectWs, delay);
}

function startPing(): void {
  stopPing();
  pingTimer = setInterval(() => wsSend({ type: WS.PING }), 15000);
}

function stopPing(): void {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
}

function wsSend(obj: WsMessage): void {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  } catch {
    /* best effort */
  }
}

async function setConnected(v: boolean): Promise<void> {
  state.linkConnected = v;
  await setLinkConnected(v).catch(() => {});
  broadcast();
}

async function handleWs(ev: MessageEvent): Promise<void> {
  let msg: WsMessage;
  try {
    msg = JSON.parse(String(ev.data));
  } catch {
    return;
  }
  switch (msg.type) {
    case WS.HELLO:
    case WS.PONG:
      void setConnected(true);
      break;
    case WS.RUN_START:
      void runQueue();
      break;
    case WS.INTERVENTION_ANSWERED: {
      const appId = String(msg.application_id || '');
      const tabId = appToTab.get(appId);
      if (tabId != null) {
        browser.tabs
          .sendMessage(tabId, {
            cmd: CMD.INTERVENTION_ANSWERED,
            application_id: appId,
            label: msg.label,
            answer: msg.answer,
            kind: msg.kind,
          })
          .catch(() => {});
      }
      state.interventions = state.interventions.filter((i) => i.id !== msg.intervention_id);
      broadcast();
      break;
    }
    case WS.INTERVENTION_NEW: {
      const id = String(msg.intervention_id || '');
      if (id && !state.interventions.find((i) => i.id === id)) {
        state.interventions.unshift({
          id,
          application_id: String(msg.application_id || ''),
          kind: String(msg.kind || 'field'),
          label: String(msg.label || ''),
          field_type: String(msg.field_type || 'text'),
          options: (msg.options as string[]) || [],
          question: String(msg.question || ''),
          is_knockout: Boolean(msg.is_knockout),
        });
        broadcast();
      }
      break;
    }
    case WS.INTERVENTION_RESOLVED:
      state.interventions = state.interventions.filter((i) => i.id !== msg.intervention_id);
      broadcast();
      break;
    case WS.SCREENCAST_START:
      void startScreencast(String(msg.application_id || ''));
      break;
    case WS.SCREENCAST_INPUT: {
      const sc = screencasts.get(String(msg.application_id || ''));
      if (sc) void sc.dispatchInput((msg.event as Record<string, unknown>) || {});
      break;
    }
    case WS.SCREENCAST_STOP:
      void stopScreencast(String(msg.application_id || ''));
      break;
    case WS.RESUME:
      void stopScreencast(String(msg.application_id || ''));
      break;
    default:
      break;
  }
}

// --- Remote CAPTCHA screencast (Chrome only) ---

async function startScreencast(appId: string): Promise<void> {
  const tabId = appToTab.get(appId);
  if (tabId == null) return;
  if (!isDebuggerAvailable()) {
    await fallbackNeedsHuman(appId, 'Remote solving is unavailable on this browser');
    return;
  }
  try {
    const sc = new DebuggerScreencast(tabId, (data) =>
      wsSend({ type: WS.SCREENCAST_FRAME, application_id: appId, data }),
    );
    await sc.start();
    screencasts.set(appId, sc);
  } catch {
    await fallbackNeedsHuman(appId, 'Remote CAPTCHA solving was declined');
  }
}

async function stopScreencast(appId: string): Promise<void> {
  const sc = screencasts.get(appId);
  if (sc) {
    await sc.stop().catch(() => {});
    screencasts.delete(appId);
  }
}

async function fallbackNeedsHuman(appId: string, note: string): Promise<void> {
  try {
    await api?.reportResult(appId, { status: 'needs_human', error: `${note} (at browser)` });
  } catch {
    /* ignore */
  }
  notify('JobPilot needs you', `${note}. Finish this application at this machine.`);
  const tabId = appToTab.get(appId);
  if (tabId != null) browser.tabs.update(tabId, { active: true }).catch(() => {});
}

// --- Queue runner ---

async function runQueue(): Promise<void> {
  if (running || !api || !pair) return;
  running = true;
  state.running = true;
  broadcast();
  try {
    while (api && pair) {
      let res: QueueResponse;
      try {
        res = await api.queueNext();
      } catch {
        break;
      }
      if (!res.application) {
        if (res.reason === 'rate_limited') {
          await sleep((res.retry_after || 300) * 1000);
          continue;
        }
        break; // empty / done
      }
      runParams.set(res.application.id, res.application);
      await processApplication(res.application);
      await sleep(randBetween(3000, 9000)); // think-time between jobs
    }
  } finally {
    running = false;
    state.running = false;
    state.current = null;
    broadcast();
  }
}

async function processApplication(app: QueueApp): Promise<void> {
  state.current = {
    applicationId: app.id,
    title: app.title,
    company: app.company,
    url: app.apply_url,
    status: 'opening',
    step: 0,
  };
  broadcast();

  let tabId: number;
  try {
    const tab = await browser.tabs.create({ url: app.apply_url, active: false });
    tabId = tab.id as number;
  } catch {
    completeRun(app.id, 'failed', 'Could not open the application tab');
    return;
  }
  tabToApp.set(tabId, app.id);
  appToTab.set(app.id, tabId);

  await new Promise<void>((resolve) => {
    runResolvers.set(app.id, resolve);
    runTimeouts.set(
      app.id,
      setTimeout(() => completeRun(app.id, 'failed', 'Timed out'), 4 * 60 * 1000),
    );
  });
}

function startFillingForTab(tabId: number): void {
  if (!tabToApp.has(tabId) || startedTabs.has(tabId)) return;
  const appId = tabToApp.get(tabId)!;
  const app = runParams.get(appId);
  if (!app) return;
  startedTabs.add(tabId);
  if (state.current && state.current.applicationId === appId) state.current.status = 'filling';
  browser.tabs
    .sendMessage(tabId, {
      cmd: CMD.START_FILLING,
      applicationId: appId,
      mode: app.mode,
      humanized: app.humanized,
      reviewFirst: app.review_first,
    })
    .catch(() => {});
  broadcast();
}

function completeRun(appId: string, status: string, error?: string): void {
  const to = runTimeouts.get(appId);
  if (to) clearTimeout(to);
  runTimeouts.delete(appId);

  const app = runParams.get(appId);
  state.recent.unshift({
    applicationId: appId,
    title: app?.title || '',
    company: app?.company || '',
    status,
    at: Date.now(),
    error,
  });
  state.recent = state.recent.slice(0, 12);
  if (state.current?.applicationId === appId) state.current = null;

  const tabId = appToTab.get(appId);
  if (tabId != null && status !== 'needs_human') {
    setTimeout(() => browser.tabs.remove(tabId).catch(() => {}), 1500);
  }
  if (tabId != null) {
    tabToApp.delete(tabId);
    startedTabs.delete(tabId);
  }
  appToTab.delete(appId);
  runParams.delete(appId);
  void stopScreencast(appId);

  const resolve = runResolvers.get(appId);
  if (resolve) {
    runResolvers.delete(appId);
    resolve();
  }
  broadcast();
}

// --- Keepalive ---

async function onKeepAlive(): Promise<void> {
  if (!pair) return;
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) connectWs();
  else wsSend({ type: WS.PING });
  state.autoRun = await getAutoRun();
  if (state.autoRun && !running) void runQueue();
}

// --- Messaging hub ---

async function handleMessage(msg: RuntimeMessage, sender: Sender): Promise<unknown> {
  const senderTabId = sender.tab?.id;
  switch (msg.cmd) {
    case CMD.CONTENT_READY:
      if (senderTabId != null) startFillingForTab(senderTabId);
      return { ok: true };

    case CMD.RESOLVE_FIELDS:
      return api
        ? api.resolveFields(String(msg.appId), msg.fields as never)
        : { resolved: [], interventions: [] };

    case CMD.RAISE_BLOCKER:
      return api
        ? api.raiseBlocker(String(msg.appId), String(msg.kind), String(msg.question || ''), String(msg.screenshot || ''))
        : { intervention_id: '' };

    case CMD.LIST_INTERVENTIONS:
      return api ? api.listInterventions(msg.appId ? String(msg.appId) : undefined) : [];

    case CMD.ANSWER_INTERVENTION: {
      const out = api
        ? await api.answerIntervention(String(msg.id), String(msg.answer), Boolean(msg.save))
        : { ok: false };
      const iv = state.interventions.find((i) => i.id === msg.id);
      const appId = iv?.application_id;
      state.interventions = state.interventions.filter((i) => i.id !== msg.id);
      if (appId) {
        const tabId = appToTab.get(appId);
        if (tabId != null) {
          browser.tabs
            .sendMessage(tabId, {
              cmd: CMD.INTERVENTION_ANSWERED,
              application_id: appId,
              label: iv?.label || iv?.field_label || '',
              answer: msg.answer,
              kind: iv?.kind || 'field',
            })
            .catch(() => {});
        }
      }
      broadcast();
      return out;
    }

    case CMD.REPORT_RESULT: {
      const report = msg.report as ResultReport;
      let out: unknown = { ok: false };
      if (api) {
        try {
          out = await api.reportResult(String(msg.appId), report);
        } catch (e) {
          out = { ok: false, error: String((e as Error)?.message || e) };
        }
      }
      completeRun(String(msg.appId), report.status, report.error);
      return out;
    }

    case CMD.CAPTURE_TAB: {
      try {
        let winId: number | undefined;
        if (senderTabId != null) {
          await browser.tabs.update(senderTabId, { active: true });
          await sleep(150);
          winId = (await browser.tabs.get(senderTabId)).windowId;
        } else {
          winId = (await browser.windows.getCurrent()).id;
        }
        return await browser.tabs.captureVisibleTab(winId as number, { format: 'jpeg', quality: 55 });
      } catch {
        return '';
      }
    }

    case CMD.BRING_TO_FRONT: {
      if (senderTabId != null) {
        try {
          const t = await browser.tabs.get(senderTabId);
          if (t.windowId != null) await browser.windows.update(t.windowId, { focused: true });
          await browser.tabs.update(senderTabId, { active: true });
        } catch {
          /* ignore */
        }
      }
      return { ok: true };
    }

    case CMD.NOTIFY:
      notify(String(msg.title || 'JobPilot'), String(msg.message || ''));
      return { ok: true };

    case CMD.FETCH_RESUME:
      return await fetchResume();

    case CMD.GET_STATE:
      await refreshState();
      return state;

    case CMD.TRIGGER_RUN:
      void runQueue();
      return { ok: true };

    case CMD.PAIRED:
      await reloadPair();
      return { ok: true };

    case CMD.UNPAIR:
      await unpair();
      return { ok: true };

    case CMD.ENABLE_DEBUGGER: {
      const granted = await requestDebuggerPermission();
      state.debuggerAvailable = isDebuggerAvailable();
      broadcast();
      return { granted };
    }

    default:
      return { ok: false, error: 'unknown command' };
  }
}

async function refreshState(): Promise<void> {
  state.autoRun = await getAutoRun();
  state.debuggerAvailable = isDebuggerAvailable();
  if (api) {
    try {
      state.interventions = await api.listInterventions();
    } catch {
      /* keep last known */
    }
  }
}

async function unpair(): Promise<void> {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  ws = null;
  stopPing();
  await clearPairState();
  pair = null;
  api = null;
  state.paired = false;
  state.linkConnected = false;
  state.userEmail = '';
  state.interventions = [];
  state.current = null;
  broadcast();
}

async function fetchResume(): Promise<{ name: string; type: string; base64: string } | null> {
  if (!pair) return null;
  try {
    const res = await fetch(`${pair.apiBase.replace(/\/$/, '')}/api/ext/resume`, {
      headers: { Authorization: `Bearer ${pair.deviceToken}` },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const name =
      (res.headers.get('content-disposition') || '').match(/filename="?([^"]+)"?/)?.[1] || 'resume.pdf';
    return {
      name,
      type: res.headers.get('content-type') || 'application/pdf',
      base64: arrayBufferToBase64(buf),
    };
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function notify(title: string, message: string): void {
  try {
    browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('icon/128.png'),
      title,
      message,
    });
  } catch {
    /* notifications are best-effort */
  }
}

function broadcast(): void {
  browser.runtime.sendMessage({ cmd: CMD.STATE_UPDATE, state }).catch(() => {});
}
