import type { Tool, DeserializeResult } from '@itsjust/core';
import toolConfig from './tool.config';
import {
  DEFAULT_STATE,
  clampMinutes,
  clampRounds,
  phaseDurationMs,
  type Phase,
  type PomodoroState,
  type TimerStatus,
} from './types';

const VALID_PHASES: Phase[] = ['work', 'shortBreak', 'longBreak'];
const VALID_STATUSES: TimerStatus[] = ['idle', 'running', 'paused'];

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Serialize tool state into a compact JSON string for share/import.
 * Running state is normalized to 'paused' so a bookmarked timer does not
 * claim to be ticking while nobody is watching.
 */
export function serializeState(state: PomodoroState): string {
  return JSON.stringify({
    workMinutes: clampMinutes(state.workMinutes),
    shortBreakMinutes: clampMinutes(state.shortBreakMinutes),
    longBreakMinutes: clampMinutes(state.longBreakMinutes),
    roundsBeforeLongBreak: clampRounds(state.roundsBeforeLongBreak),
    phase: state.phase,
    remainingMs: Math.max(0, Math.round(state.remainingMs)),
    status: state.status === 'running' ? 'paused' : state.status,
    completedRounds: state.completedRounds,
    totalFocusMs: Math.max(0, Math.round(state.totalFocusMs)),
    soundEnabled: state.soundEnabled,
  });
}

/** Validate and recover tool state from an arbitrary payload. */
export function deserializeState(data: unknown): DeserializeResult<PomodoroState> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { success: false, error: 'Invalid data format: expected pomodoro timer state object' };
  }
  const v = data as Record<string, unknown>;
  const workMinutes = clampMinutes(finiteOr(v.workMinutes, DEFAULT_STATE.workMinutes));
  const shortBreakMinutes = clampMinutes(
    finiteOr(v.shortBreakMinutes, DEFAULT_STATE.shortBreakMinutes)
  );
  const longBreakMinutes = clampMinutes(
    finiteOr(v.longBreakMinutes, DEFAULT_STATE.longBreakMinutes)
  );
  const roundsBeforeLongBreak = clampRounds(
    finiteOr(v.roundsBeforeLongBreak, DEFAULT_STATE.roundsBeforeLongBreak)
  );
  const phase: Phase = VALID_PHASES.includes(v.phase as Phase)
    ? (v.phase as Phase)
    : DEFAULT_STATE.phase;
  const status: TimerStatus = VALID_STATUSES.includes(v.status as TimerStatus)
    ? (v.status as TimerStatus)
    : DEFAULT_STATE.status;
  const rawRemaining = finiteOr(v.remainingMs, NaN);
  const maxRemaining = phaseDurationMs({ workMinutes, shortBreakMinutes, longBreakMinutes }, phase);
  const remainingMs =
    Number.isFinite(rawRemaining) && rawRemaining > 0
      ? Math.min(maxRemaining, Math.round(rawRemaining))
      : maxRemaining;
  const rawFocus = finiteOr(v.totalFocusMs, 0);

  const state: PomodoroState = {
    workMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    roundsBeforeLongBreak,
    phase,
    remainingMs,
    status: status === 'running' ? 'paused' : status,
    completedRounds: Math.max(0, Math.round(finiteOr(v.completedRounds, 0))),
    totalFocusMs: Math.max(0, Math.round(Number.isFinite(rawFocus) ? rawFocus : 0)),
    soundEnabled: boolOr(v.soundEnabled, DEFAULT_STATE.soundEnabled),
  };
  return { success: true, data: state };
}

/** True when a serialized string round-trips back to the same state. */
export function roundTrips(state: PomodoroState): boolean {
  try {
    const restored = deserializeState(JSON.parse(serializeState(state)));
    if (!restored.success) return false;
    const a = JSON.parse(serializeState(state));
    const b = JSON.parse(serializeState(restored.data));
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export const pomodoroTimerTool: Tool<PomodoroState> = {
  id: toolConfig.id,
  name: toolConfig.name,
  version: toolConfig.version,
  config: toolConfig,
  initialState: { ...DEFAULT_STATE },
  serialize: serializeState,
  deserialize: deserializeState,
};
