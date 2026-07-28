import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthApi } from '@/api/endpoints';
import { ApiError, setUnauthorizedHandler } from '@/api/client';
import type { UserOut, UserSettingsUpdate, Theme } from '@/api/types';
import { useTheme } from './ThemeContext';

interface AuthApiShape {
  user: UserOut | null;
  loading: boolean;
  signin: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  signout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateSettings: (patch: UserSettingsUpdate) => Promise<UserOut>;
  setUser: (u: UserOut | null) => void;
}

const AuthContext = createContext<AuthApiShape | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [loading, setLoading] = useState(true);
  const { setTheme } = useTheme();
  const themeRef = useRef(setTheme);
  themeRef.current = setTheme;

  // Redirect to /signin on any 401.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      if (!location.pathname.startsWith('/signin') && !location.pathname.startsWith('/signup')) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.assign(`/signin?next=${next}`);
      }
    });
  }, []);

  const syncTheme = useCallback((u: UserOut | null) => {
    if (u && (u.theme === 'system' || u.theme === 'light' || u.theme === 'dark')) {
      themeRef.current(u.theme as Theme);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const u = await AuthApi.me();
      setUser(u);
      syncTheme(u);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setUser(null);
    } finally {
      setLoading(false);
    }
  }, [syncTheme]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signin = useCallback(
    async (email: string, password: string) => {
      const u = await AuthApi.signin(email, password);
      setUser(u);
      syncTheme(u);
    },
    [syncTheme],
  );

  const signup = useCallback(
    async (email: string, password: string) => {
      const u = await AuthApi.signup(email, password);
      setUser(u);
      syncTheme(u);
    },
    [syncTheme],
  );

  const signout = useCallback(async () => {
    try {
      await AuthApi.signout();
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const updateSettings = useCallback(
    async (patch: UserSettingsUpdate) => {
      const u = await AuthApi.updateSettings(patch);
      setUser(u);
      if (patch.theme) syncTheme(u);
      return u;
    },
    [syncTheme],
  );

  const value = useMemo<AuthApiShape>(
    () => ({ user, loading, signin, signup, signout, refresh, updateSettings, setUser }),
    [user, loading, signin, signup, signout, refresh, updateSettings],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApiShape {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
