import browser from 'webextension-polyfill';
import type { PairState } from './types';

const KEYS = ['apiBase', 'wsUrl', 'deviceToken', 'userEmail', 'autoRun', 'linkConnected'] as const;

export async function getPairState(): Promise<PairState | null> {
  const s = (await browser.storage.local.get(['apiBase', 'wsUrl', 'deviceToken', 'userEmail'])) as Partial<PairState>;
  if (s.apiBase && s.wsUrl && s.deviceToken) {
    return {
      apiBase: s.apiBase,
      wsUrl: s.wsUrl,
      deviceToken: s.deviceToken,
      userEmail: s.userEmail || '',
    };
  }
  return null;
}

export async function setPairState(state: PairState): Promise<void> {
  await browser.storage.local.set({ ...state });
}

export async function clearPairState(): Promise<void> {
  await browser.storage.local.remove([...KEYS]);
}

export async function getAutoRun(): Promise<boolean> {
  const { autoRun } = (await browser.storage.local.get('autoRun')) as { autoRun?: boolean };
  return autoRun !== false; // default true
}

export async function setAutoRun(v: boolean): Promise<void> {
  await browser.storage.local.set({ autoRun: v });
}

export async function setLinkConnected(v: boolean): Promise<void> {
  await browser.storage.local.set({ linkConnected: v });
}
