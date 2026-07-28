import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { WsEvent } from '@/api/types';

export type SocketStatus = 'connecting' | 'open' | 'closed';
type Handler = (event: WsEvent) => void;

interface SocketApi {
  status: SocketStatus;
  extOnline: boolean;
  send: (msg: unknown) => void;
  subscribe: (type: string, handler: Handler) => () => void;
}

const SocketContext = createContext<SocketApi | null>(null);

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws/app`;
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [extOnline, setExtOnline] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const handlers = useRef<Map<string, Set<Handler>>>(new Map());
  const pingTimer = useRef<number | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const attempt = useRef(0);
  const alive = useRef(true);

  const emit = useRef((event: WsEvent) => {
    const set = handlers.current.get(event.type);
    if (set) set.forEach((h) => h(event));
    const all = handlers.current.get('*');
    if (all) all.forEach((h) => h(event));
  });

  useEffect(() => {
    if (!user) return;
    alive.current = true;

    const clearTimers = () => {
      if (pingTimer.current) window.clearInterval(pingTimer.current);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      pingTimer.current = null;
      reconnectTimer.current = null;
    };

    const connect = () => {
      if (!alive.current) return;
      setStatus(attempt.current === 0 ? 'connecting' : 'connecting');
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attempt.current = 0;
        setStatus('open');
        // Keepalive ping.
        pingTimer.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 25000);
      };

      ws.onmessage = (ev) => {
        let data: WsEvent;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (data.type === 'pong') return;
        if (data.type === 'ext.status') setExtOnline(Boolean(data.online));
        emit.current(data);
      };

      ws.onclose = () => {
        clearTimers();
        setStatus('closed');
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    };

    const scheduleReconnect = () => {
      if (!alive.current) return;
      attempt.current += 1;
      const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt.current, 5));
      reconnectTimer.current = window.setTimeout(connect, delay);
    };

    connect();

    return () => {
      alive.current = false;
      clearTimers();
      setExtOnline(false);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [user]);

  const api = useMemo<SocketApi>(
    () => ({
      status,
      extOnline,
      send: (msg: unknown) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
      subscribe: (type: string, handler: Handler) => {
        let set = handlers.current.get(type);
        if (!set) {
          set = new Set();
          handlers.current.set(type, set);
        }
        set.add(handler);
        return () => {
          set?.delete(handler);
        };
      },
    }),
    [status, extOnline],
  );

  return createElement(SocketContext.Provider, { value: api }, children);
}

export function useSocket(): SocketApi {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}

/** Subscribe to one WS event type for the lifetime of the component. */
export function useSocketEvent(type: string, handler: Handler) {
  const { subscribe } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    return subscribe(type, (e) => ref.current(e));
  }, [type, subscribe]);
}
