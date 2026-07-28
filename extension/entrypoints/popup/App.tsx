import { useCallback, useEffect, useMemo, useState } from 'react';
import browser from 'webextension-polyfill';
import { CMD, sendToBackground } from '../../utils/protocol';
import { fetchExtensionInfo, pairDevice } from '../../utils/api';
import { setPairState } from '../../utils/storage';
import type { BackgroundState, InterventionItem } from '../../utils/types';

const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
const browserName: 'firefox' | 'chrome' = isFirefox ? 'firefox' : 'chrome';

const EMPTY_STATE: BackgroundState = {
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

function versionIsNewer(remote: string, local: string): boolean {
  const a = remote.split('.').map((n) => parseInt(n, 10) || 0);
  const b = local.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

export function App() {
  const [state, setState] = useState<BackgroundState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await sendToBackground<BackgroundState>({ cmd: CMD.GET_STATE });
      if (s) setState(s);
    } catch {
      /* background may be waking up */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const listener = (msg: unknown) => {
      const m = msg as { cmd?: string; state?: BackgroundState };
      if (m?.cmd === CMD.STATE_UPDATE && m.state) setState(m.state);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [refresh]);

  useEffect(() => {
    if (state.paired && state.apiBase) {
      void fetchExtensionInfo(state.apiBase).then((info) => {
        if (info && versionIsNewer(info.version, state.builtinVersion)) setUpdateVersion(info.version);
      });
    }
  }, [state.paired, state.apiBase, state.builtinVersion]);

  if (!loaded) {
    return (
      <div className="jp-app jp-center">
        <Logo />
        <div className="muted">Connecting…</div>
      </div>
    );
  }

  return (
    <div className="jp-app">
      <Header state={state} />
      {state.paired ? (
        <Dashboard state={state} updateVersion={updateVersion} onChange={refresh} />
      ) : (
        <PairScreen onPaired={refresh} />
      )}
      <footer className="jp-footer">
        <span className="muted">JobPilot v{state.builtinVersion}</span>
        <span className="muted">{browserName === 'firefox' ? 'Firefox' : 'Chrome'}</span>
      </footer>
    </div>
  );
}

function Logo() {
  return <div className="jp-logo" aria-hidden />;
}

function Header({ state }: { state: BackgroundState }) {
  return (
    <header className="jp-header">
      <Logo />
      <div className="jp-header-text">
        <div className="jp-brand">JobPilot</div>
        {state.paired ? (
          <div className="muted small">{state.userEmail || 'Paired'}</div>
        ) : (
          <div className="muted small">Auto-apply co-pilot</div>
        )}
      </div>
      {state.paired && (
        <div className={`jp-link ${state.linkConnected ? 'on' : 'off'}`} title={state.linkConnected ? 'Connected' : 'Offline'}>
          <span className="dot" />
          {state.linkConnected ? 'Live' : 'Offline'}
        </div>
      )}
    </header>
  );
}

function PairScreen({ onPaired }: { onPaired: () => void }) {
  const [base, setBase] = useState('http://localhost:1456');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const capabilities = ['fill', 'interventions', ...(browserName === 'chrome' ? ['debugger', 'screencast'] : [])].join(',');
      const resp = await pairDevice(base.trim(), {
        code: code.trim(),
        name: `${browserName === 'firefox' ? 'Firefox' : 'Chrome'} · JobPilot`,
        browser: browserName,
        capabilities,
      });
      await setPairState({
        apiBase: resp.api_base || base.trim(),
        wsUrl: resp.ws_url,
        deviceToken: resp.device_token,
        userEmail: resp.user_email,
      });
      await sendToBackground({ cmd: CMD.PAIRED });
      setDone(true);
      setTimeout(onPaired, 700);
    } catch (err) {
      setError((err as Error)?.message || 'Pairing failed');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="jp-body jp-center">
        <div className="jp-check">✓</div>
        <div className="jp-title">Paired successfully</div>
        <div className="muted small">Opening your dashboard…</div>
      </div>
    );
  }

  return (
    <form className="jp-body" onSubmit={submit}>
      <div className="jp-title">Pair this browser</div>
      <p className="muted small">
        Open JobPilot → Settings → Extensions to generate a 6-digit code, then enter it here.
      </p>
      <label className="jp-label">
        Container URL
        <input className="jp-field" value={base} onChange={(e) => setBase(e.target.value)} placeholder="http://localhost:1456" spellCheck={false} />
      </label>
      <label className="jp-label">
        Pairing code
        <input
          className="jp-field jp-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          inputMode="numeric"
          autoFocus
        />
      </label>
      {error && <div className="jp-error">{error}</div>}
      <button className="jp-btn primary block" type="submit" disabled={busy || code.length !== 6}>
        {busy ? 'Pairing…' : 'Pair browser'}
      </button>
    </form>
  );
}

function Dashboard({
  state,
  updateVersion,
  onChange,
}: {
  state: BackgroundState;
  updateVersion: string | null;
  onChange: () => void;
}) {
  const toggleAutoRun = async () => {
    await browser.storage.local.set({ autoRun: !state.autoRun });
    if (!state.autoRun) await sendToBackground({ cmd: CMD.TRIGGER_RUN });
    onChange();
  };
  const unpair = async () => {
    await sendToBackground({ cmd: CMD.UNPAIR });
    onChange();
  };
  const enableDebugger = async () => {
    await sendToBackground({ cmd: CMD.ENABLE_DEBUGGER });
    onChange();
  };

  const showEnableDebugger = browserName === 'chrome' && !state.debuggerAvailable;

  return (
    <div className="jp-body">
      {updateVersion && (
        <div className="jp-nudge">
          Update available — v{updateVersion}. Download the new build from JobPilot → Extensions.
        </div>
      )}

      <div className="jp-card-row">
        <div className="jp-stat">
          <div className="muted small">Status</div>
          <div className="jp-stat-value">{state.running ? 'Running' : state.autoRun ? 'Watching queue' : 'Paused'}</div>
        </div>
        <button className={`jp-toggle ${state.autoRun ? 'on' : ''}`} onClick={toggleAutoRun} title="Toggle auto-apply">
          <span className="knob" />
        </button>
      </div>

      <CurrentActivity state={state} />

      {state.interventions.length > 0 && (
        <section>
          <div className="jp-section-title">Needs your input</div>
          {state.interventions.map((iv) => (
            <InterventionCard key={iv.id} iv={iv} onAnswered={onChange} />
          ))}
        </section>
      )}

      {state.recent.length > 0 && (
        <section>
          <div className="jp-section-title">Recent</div>
          <ul className="jp-recent">
            {state.recent.map((r) => (
              <li key={`${r.applicationId}-${r.at}`}>
                <span className={`jp-badge ${r.status}`}>{r.status.replace('_', ' ')}</span>
                <span className="jp-recent-title" title={r.title}>
                  {r.title || 'Application'}
                  {r.company ? ` · ${r.company}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="jp-actions-row">
        {showEnableDebugger && (
          <button className="jp-btn ghost" onClick={enableDebugger}>
            Enable remote CAPTCHA solving
          </button>
        )}
        <button className="jp-btn ghost danger" onClick={unpair}>
          Unpair
        </button>
      </div>
    </div>
  );
}

function CurrentActivity({ state }: { state: BackgroundState }) {
  if (!state.current) {
    return (
      <div className="jp-idle muted small">
        {state.running ? 'Fetching the next application…' : 'Idle — queue an application in JobPilot to begin.'}
      </div>
    );
  }
  const c = state.current;
  return (
    <div className="jp-current">
      <div className="jp-spinner" />
      <div className="jp-current-text">
        <div className="jp-current-title">{c.title || 'Application'}</div>
        <div className="muted small">
          {c.company ? `${c.company} · ` : ''}
          {c.status}
        </div>
      </div>
    </div>
  );
}

function InterventionCard({ iv, onAnswered }: { iv: InterventionItem; onAnswered: () => void }) {
  const label = iv.label || iv.field_label || iv.question || 'Question';
  const options = iv.options || [];
  const [answer, setAnswer] = useState('');
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const canSubmit = useMemo(() => answer.trim().length > 0, [answer]);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await sendToBackground({ cmd: CMD.ANSWER_INTERVENTION, id: iv.id, answer: answer.trim(), save });
      onAnswered();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="jp-iv">
      <div className="jp-iv-q">
        {iv.question || label}
        {iv.is_knockout && <span className="jp-badge knock">knockout</span>}
      </div>
      {options.length > 0 ? (
        <div className="jp-opts">
          {options.map((o) => (
            <button key={o} className={`jp-opt ${answer === o ? 'sel' : ''}`} onClick={() => setAnswer(o)}>
              {o}
            </button>
          ))}
        </div>
      ) : (
        <input className="jp-field" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" />
      )}
      <label className="jp-save">
        <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save for future applications
      </label>
      <button className="jp-btn primary block" onClick={submit} disabled={!canSubmit || busy}>
        {busy ? 'Saving…' : 'Submit answer'}
      </button>
    </div>
  );
}
