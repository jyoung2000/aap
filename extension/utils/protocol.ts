import browser from 'webextension-polyfill';

// Internal runtime message commands (content/popup <-> background).
export const CMD = {
  // content or popup -> background
  RESOLVE_FIELDS: 'resolveFields',
  RAISE_BLOCKER: 'raiseBlocker',
  LIST_INTERVENTIONS: 'listInterventions',
  ANSWER_INTERVENTION: 'answerIntervention',
  REPORT_RESULT: 'reportResult',
  CAPTURE_TAB: 'captureTab',
  NOTIFY: 'notify',
  BRING_TO_FRONT: 'bringToFront',
  CONTENT_READY: 'contentReady',
  // popup -> background
  GET_STATE: 'getState',
  UNPAIR: 'unpair',
  PAIRED: 'paired',
  TRIGGER_RUN: 'triggerRun',
  ENABLE_DEBUGGER: 'enableDebugger',
  // background -> content
  START_FILLING: 'startFilling',
  INTERVENTION_ANSWERED: 'interventionAnswered',
  // background -> popup (broadcast)
  STATE_UPDATE: 'stateUpdate',
} as const;

export type Cmd = (typeof CMD)[keyof typeof CMD];

export interface RuntimeMessage {
  cmd: Cmd;
  [key: string]: unknown;
}

/** Send a message to the background service worker and await its reply. */
export async function sendToBackground<T = unknown>(msg: RuntimeMessage): Promise<T> {
  return (await browser.runtime.sendMessage(msg)) as T;
}

/** WebSocket message types exchanged with the container (/ws/ext). */
export const WS = {
  HELLO: 'hello',
  PING: 'ping',
  PONG: 'pong',
  RUN_START: 'run.start',
  INTERVENTION_NEW: 'intervention.new',
  INTERVENTION_ANSWERED: 'intervention.answered',
  INTERVENTION_RESOLVED: 'intervention.resolved',
  SCREENCAST_FRAME: 'screencast.frame',
  SCREENCAST_START: 'screencast.start',
  SCREENCAST_INPUT: 'screencast.input',
  SCREENCAST_STOP: 'screencast.stop',
  RESUME: 'resume',
  EXT_STATUS: 'ext.status',
} as const;

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}
