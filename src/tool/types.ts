export type Phase = 'work' | 'shortBreak' | 'longBreak';

export type TimerStatus = 'idle' | 'running' | 'paused';

export interface PomodoroState {
  /** Durations in minutes. */
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** Number of completed work rounds before a long break. */
  roundsBeforeLongBreak: number;
  /** Current phase of the cycle. */
  phase: Phase;
  /** Remaining milliseconds in the current phase. */
  remainingMs: number;
  /** idle | running | paused */
  status: TimerStatus;
  /** Completed work rounds today (since reset). */
  completedRounds: number;
  /** Total focused milliseconds accumulated today. */
  totalFocusMs: number;
  /** Play a chime when an interval ends. */
  soundEnabled: boolean;
}

export const DEFAULT_STATE: PomodoroState = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsBeforeLongBreak: 4,
  phase: 'work',
  remainingMs: 25 * 60 * 1000,
  status: 'idle',
  completedRounds: 0,
  totalFocusMs: 0,
  soundEnabled: true,
};

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 180;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 12;

export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'work':
      return 'Focus';
    case 'shortBreak':
      return 'Short break';
    case 'longBreak':
      return 'Long break';
  }
}

/** Clamp a minutes value into the accepted range. */
export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes))
    return minutes === Infinity ? MAX_MINUTES : DEFAULT_STATE.workMinutes;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes)));
}

/** Clamp the rounds-before-long-break setting. */
export function clampRounds(rounds: number): number {
  if (!Number.isFinite(rounds)) return DEFAULT_STATE.roundsBeforeLongBreak;
  return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(rounds)));
}

/** Duration of a phase in milliseconds for the given settings. */
export function phaseDurationMs(
  state: Pick<PomodoroState, 'workMinutes' | 'shortBreakMinutes' | 'longBreakMinutes'>,
  phase: Phase
): number {
  const minutes =
    phase === 'work'
      ? state.workMinutes
      : phase === 'shortBreak'
        ? state.shortBreakMinutes
        : state.longBreakMinutes;
  return clampMinutes(minutes) * 60 * 1000;
}

/** Format milliseconds as mm:ss (or hh:mm:ss above one hour). */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const seconds = total % 60;
  const minutesTotal = Math.floor(total / 60);
  const minutes = minutesTotal % 60;
  const hours = Math.floor(minutesTotal / 60);
  const two = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

/** Format a focus duration in a compact human form, e.g. "1h 25m". */
export function formatFocusTotal(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export interface TickResult {
  state: PomodoroState;
  /** The phase that just ended (chime due). */
  completedPhase: Phase | null;
  /** A work phase just finished — counts toward focus time. */
  completedRound: boolean;
}

/**
 * Advance a running timer by `elapsedMs`. Handles any number of phase
 * transitions (long elapsed periods) in one call.
 */
export function advance(state: PomodoroState, elapsedMs: number): TickResult {
  let next = state;
  let remaining = next.remainingMs - elapsedMs;
  let focusGained = 0;
  let completedPhase: Phase | null = null;
  let rounds = next.completedRounds;

  let guard = 0;
  while (remaining <= 0 && guard < 100000) {
    guard += 1;
    const phase = next.phase;
    completedPhase = phase;
    if (phase === 'work') {
      focusGained += phaseDurationMs(next, 'work');
      rounds += 1;
      const nextPhase: Phase =
        rounds % clampRounds(next.roundsBeforeLongBreak) === 0 ? 'longBreak' : 'shortBreak';
      const dur = phaseDurationMs(next, nextPhase);
      next = {
        ...next,
        phase: nextPhase,
        completedRounds: rounds,
        totalFocusMs: next.totalFocusMs + phaseDurationMs(next, 'work'),
        remainingMs: dur,
      };
      remaining = dur + remaining; // carry the overshoot into the new phase
    } else {
      const dur = phaseDurationMs(next, 'work');
      next = { ...next, phase: 'work', remainingMs: dur };
      remaining = dur + remaining;
    }
  }

  if (remaining > 0) {
    next = { ...next, remainingMs: remaining };
  } else {
    // Degenerate guard exit; clamp to at least the current duration.
    next = { ...next, remainingMs: Math.max(1000, phaseDurationMs(next, next.phase)) };
  }

  void focusGained;
  return { state: next, completedPhase, completedRound: completedPhase === 'work' };
}

/**
 * Skip the current phase: a finished/skipped work phase counts as focus time
 * for the remaining portion and increments the round counter; breaks simply
 * advance to the next work phase.
 */
export function skipPhase(state: PomodoroState): TickResult {
  if (state.phase === 'work') {
    const focusGained = Math.max(0, state.workMinutes * 60 * 1000 - state.remainingMs);
    const rounds = state.completedRounds + 1;
    const nextPhase: Phase =
      rounds % clampRounds(state.roundsBeforeLongBreak) === 0 ? 'longBreak' : 'shortBreak';
    return {
      state: {
        ...state,
        phase: nextPhase,
        remainingMs: phaseDurationMs(state, nextPhase),
        completedRounds: rounds,
        totalFocusMs: state.totalFocusMs + focusGained,
        status: 'idle',
      },
      completedPhase: 'work',
      completedRound: true,
    };
  }
  return {
    state: {
      ...state,
      phase: 'work',
      remainingMs: phaseDurationMs(state, 'work'),
      status: 'idle',
    },
    completedPhase: state.phase,
    completedRound: false,
  };
}

/** Full reset back to the default (or given) configuration. */
export function resetState(
  config?: Partial<
    Pick<
      PomodoroState,
      | 'workMinutes'
      | 'shortBreakMinutes'
      | 'longBreakMinutes'
      | 'roundsBeforeLongBreak'
      | 'soundEnabled'
    >
  >
): PomodoroState {
  const merged = { ...DEFAULT_STATE, ...config };
  return {
    ...merged,
    phase: 'work',
    remainingMs: merged.workMinutes * 60 * 1000,
    status: 'idle',
    completedRounds: 0,
    totalFocusMs: 0,
  };
}
