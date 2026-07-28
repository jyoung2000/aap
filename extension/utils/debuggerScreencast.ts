import browser from 'webextension-polyfill';

/**
 * Remote CAPTCHA solving via chrome.debugger (Chrome only, optional `debugger`
 * permission). Attaches to a blocked tab, streams JPEG frames over the WS to the
 * container (which relays to the web UI), and replays mouse/keyboard input the user
 * performs remotely. On Firefox — or if the user declines the permission — the whole
 * module is a no-op and callers fall back to a `needs_human` result.
 *
 * Deliberately isolated so its absence never breaks normal form filling.
 */

// Minimal shape of the chrome.debugger API we rely on (avoids an @types/chrome dep).
interface Debuggee {
  tabId: number;
}
interface ChromeDebugger {
  attach(target: Debuggee, version: string, cb: () => void): void;
  detach(target: Debuggee, cb?: () => void): void;
  sendCommand(target: Debuggee, method: string, params: object, cb?: (result: unknown) => void): void;
  onEvent: {
    addListener(cb: (source: Debuggee, method: string, params?: unknown) => void): void;
    removeListener(cb: (source: Debuggee, method: string, params?: unknown) => void): void;
  };
  onDetach: {
    addListener(cb: (source: Debuggee, reason: string) => void): void;
    removeListener(cb: (source: Debuggee, reason: string) => void): void;
  };
}

interface ScreencastFrameParams {
  data: string;
  sessionId: number;
  metadata?: unknown;
}

function chromeDebugger(): ChromeDebugger | null {
  const c = (globalThis as unknown as { chrome?: { debugger?: ChromeDebugger } }).chrome;
  return c?.debugger ?? null;
}

/** True when chrome.debugger exists in this runtime (Chrome/Chromium only). */
export function isDebuggerAvailable(): boolean {
  return chromeDebugger() !== null;
}

// `debugger` is a valid runtime permission but isn't in the polyfill's literal union.
const DEBUGGER_PERMS = { permissions: ['debugger'] } as unknown as Parameters<
  typeof browser.permissions.request
>[0];

/** Ask the user (once) to grant the optional `debugger` permission. */
export async function requestDebuggerPermission(): Promise<boolean> {
  if (!isDebuggerAvailable()) return false;
  try {
    return await browser.permissions.request(DEBUGGER_PERMS);
  } catch {
    return false;
  }
}

export async function hasDebuggerPermission(): Promise<boolean> {
  try {
    return await browser.permissions.contains(DEBUGGER_PERMS);
  } catch {
    return false;
  }
}

type SendFrame = (data: string) => void;

/** A single active screencast session bound to one tab. */
export class DebuggerScreencast {
  private attached = false;
  private onEventBound?: (source: Debuggee, method: string, params?: unknown) => void;

  constructor(
    private tabId: number,
    private sendFrame: SendFrame,
  ) {}

  private cmd(method: string, params: object = {}): Promise<unknown> {
    const dbg = chromeDebugger();
    if (!dbg) return Promise.reject(new Error('debugger unavailable'));
    return new Promise((resolve) => dbg.sendCommand({ tabId: this.tabId }, method, params, resolve));
  }

  async start(): Promise<void> {
    const dbg = chromeDebugger();
    if (!dbg) throw new Error('debugger unavailable');
    if (!(await hasDebuggerPermission())) {
      const granted = await requestDebuggerPermission();
      if (!granted) throw new Error('debugger permission declined');
    }
    await new Promise<void>((resolve, reject) => {
      dbg.attach({ tabId: this.tabId }, '1.3', () => {
        const err = (globalThis as unknown as { chrome?: { runtime?: { lastError?: { message?: string } } } }).chrome
          ?.runtime?.lastError;
        if (err) reject(new Error(err.message || 'attach failed'));
        else resolve();
      });
    });
    this.attached = true;

    this.onEventBound = (source, method, params) => {
      if (source.tabId !== this.tabId) return;
      if (method === 'Page.screencastFrame') {
        const p = params as ScreencastFrameParams;
        try {
          this.sendFrame(p.data);
        } finally {
          void this.cmd('Page.screencastFrameAck', { sessionId: p.sessionId });
        }
      }
    };
    dbg.onEvent.addListener(this.onEventBound);

    await this.cmd('Page.enable');
    await this.cmd('Page.startScreencast', {
      format: 'jpeg',
      quality: 60,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 1,
    });
  }

  /** Replay a remote input event (from ws `screencast.input`). */
  async dispatchInput(event: Record<string, unknown>): Promise<void> {
    if (!this.attached) return;
    const type = String(event.type || '');
    if (type.startsWith('mouse')) {
      await this.cmd('Input.dispatchMouseEvent', {
        type: type === 'mousedown' ? 'mousePressed' : type === 'mouseup' ? 'mouseReleased' : 'mouseMoved',
        x: Number(event.x) || 0,
        y: Number(event.y) || 0,
        button: (event.button as string) || 'left',
        clickCount: Number(event.clickCount) || (type === 'mousedown' ? 1 : 0),
      });
    } else if (type.startsWith('key')) {
      await this.cmd('Input.dispatchKeyEvent', {
        type: type === 'keydown' ? 'keyDown' : type === 'keyup' ? 'keyUp' : 'char',
        text: (event.text as string) || undefined,
        key: (event.key as string) || undefined,
        code: (event.code as string) || undefined,
        windowsVirtualKeyCode: Number(event.keyCode) || undefined,
      });
    }
  }

  async stop(): Promise<void> {
    const dbg = chromeDebugger();
    if (!dbg || !this.attached) return;
    try {
      await this.cmd('Page.stopScreencast');
    } catch {
      /* ignore */
    }
    if (this.onEventBound) dbg.onEvent.removeListener(this.onEventBound);
    await new Promise<void>((resolve) => dbg.detach({ tabId: this.tabId }, resolve));
    this.attached = false;
  }
}
