import { describe, it, expect } from 'vitest';
import {
  advance,
  skipPhase,
  clampMinutes,
  clampRounds,
  phaseDurationMs,
  formatMs,
  formatFocusTotal,
  resetState,
  DEFAULT_STATE,
  MAX_MINUTES,
  MIN_MINUTES,
} from '@/tool/types';
import {
  serializeState,
  deserializeState,
  roundTrips,
  pomodoroTimerTool,
} from '@/tool/tool-definition';
import type { PomodoroState } from '@/tool/types';

const makeState = (overrides: Partial<PomodoroState> = {}): PomodoroState => ({
  ...DEFAULT_STATE,
  ...overrides,
});

describe('format helpers', () => {
  it('formats mm:ss', () => {
    expect(formatMs(25 * 60 * 1000)).toBe('25:00');
    expect(formatMs(59999)).toBe('01:00');
    expect(formatMs(0)).toBe('00:00');
  });

  it('formats hh:mm:ss above one hour and clamps negatives', () => {
    expect(formatMs(75 * 60 * 1000)).toBe('1:15:00');
    expect(formatMs(-1000)).toBe('00:00');
  });

  it('formats focus totals', () => {
    expect(formatFocusTotal(0)).toBe('0m');
    expect(formatFocusTotal(25 * 60 * 1000)).toBe('25m');
    expect(formatFocusTotal(85 * 60 * 1000)).toBe('1h 25m');
  });
});

describe('clamping', () => {
  it('clamps minutes to [1, 180]', () => {
    expect(clampMinutes(0)).toBe(MIN_MINUTES);
    expect(clampMinutes(-5)).toBe(MIN_MINUTES);
    expect(clampMinutes(1000)).toBe(MAX_MINUTES);
    expect(clampMinutes(25.4)).toBe(25);
    expect(clampMinutes(NaN)).toBe(DEFAULT_STATE.workMinutes);
    expect(clampMinutes(Infinity)).toBe(MAX_MINUTES);
  });

  it('clamps rounds to [1, 12]', () => {
    expect(clampRounds(0)).toBe(1);
    expect(clampRounds(99)).toBe(12);
    expect(clampRounds(2.7)).toBe(3);
    expect(clampRounds(NaN)).toBe(DEFAULT_STATE.roundsBeforeLongBreak);
  });

  it('computes phase durations', () => {
    expect(phaseDurationMs(DEFAULT_STATE, 'work')).toBe(25 * 60 * 1000);
    expect(phaseDurationMs(DEFAULT_STATE, 'shortBreak')).toBe(5 * 60 * 1000);
    expect(phaseDurationMs(DEFAULT_STATE, 'longBreak')).toBe(15 * 60 * 1000);
  });
});

describe('advance (ticking)', () => {
  it('counts down accurately without reaching zero', () => {
    const state = makeState({ status: 'running', remainingMs: 60_000 });
    const result = advance(state, 1500);
    expect(result.state.remainingMs).toBe(58_500);
    expect(result.completedPhase).toBeNull();
    expect(result.completedRound).toBe(false);
    expect(result.state.status).toBe('running');
    expect(result.state.phase).toBe('work');
  });

  it('transitions work -> short break when a work phase completes', () => {
    const state = makeState({ status: 'running', remainingMs: 10_000, completedRounds: 0 });
    const result = advance(state, 10_000);
    expect(result.completedPhase).toBe('work');
    expect(result.completedRound).toBe(true);
    expect(result.state.phase).toBe('shortBreak');
    expect(result.state.remainingMs).toBe(DEFAULT_STATE.shortBreakMinutes * 60 * 1000);
    expect(result.state.completedRounds).toBe(1);
    expect(result.state.totalFocusMs).toBe(DEFAULT_STATE.workMinutes * 60 * 1000);
  });

  it('transitions work -> long break after the configured number of rounds', () => {
    const rounds = 4;
    const state = makeState({ status: 'running', remainingMs: 5_000, completedRounds: rounds - 1 });
    const result = advance(state, 5_000);
    expect(result.state.phase).toBe('longBreak');
    expect(result.state.completedRounds).toBe(rounds);
    expect(result.state.remainingMs).toBe(DEFAULT_STATE.longBreakMinutes * 60 * 1000);
  });

  it('goes work -> short break -> work across successive completions', () => {
    let state = makeState({ status: 'running', remainingMs: 1_000 });
    state = advance(state, 1_000).state; // work done -> short break
    expect(state.phase).toBe('shortBreak');
    state = { ...state, remainingMs: 1_000, status: 'running' };
    state = advance(state, 1_000).state; // short break done -> work
    expect(state.phase).toBe('work');
    expect(state.remainingMs).toBe(DEFAULT_STATE.workMinutes * 60 * 1000);
  });

  it('carries overshoot into the next phase without losing time', () => {
    const state = makeState({ status: 'running', remainingMs: 2_000 });
    const result = advance(state, 3_500);
    expect(result.state.phase).toBe('shortBreak');
    // short break duration (5min) minus 1.5s overshoot
    expect(result.state.remainingMs).toBe(5 * 60 * 1000 - 1_500);
  });

  it('handles hours of elapsed time with many transitions in one tick', () => {
    const state = makeState({ status: 'running', remainingMs: 1_000 });
    const elapsed = 30 * 60 * 1000; // 30 minutes
    const result = advance(state, elapsed);
    // Should have advanced multiple phases; must be a valid state.
    expect(result.state.remainingMs).toBeGreaterThan(0);
    expect(result.state.remainingMs).toBeLessThanOrEqual(
      Math.max(
        result.state.workMinutes,
        result.state.shortBreakMinutes,
        result.state.longBreakMinutes
      ) *
        60 *
        1000
    );
    expect(['work', 'shortBreak', 'longBreak']).toContain(result.state.phase);
    expect(result.state.completedRounds).toBeGreaterThan(0);
  });

  it('never returns a non-positive remaining time', () => {
    const state = makeState({ status: 'running', remainingMs: 500 });
    const result = advance(state, 10 * 60 * 1000);
    expect(result.state.remainingMs).toBeGreaterThan(0);
  });

  it('does not mutate the input state', () => {
    const state = makeState({ status: 'running', remainingMs: 1_000 });
    const snapshot = JSON.stringify(state);
    advance(state, 60_000);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('skipPhase', () => {
  it('skipping mid-work counts only elapsed focus and advances', () => {
    const state = makeState({ remainingMs: 20 * 60 * 1000 }); // 5 of 25 minutes done
    const result = skipPhase(state);
    expect(result.state.phase).toBe('shortBreak');
    expect(result.state.completedRounds).toBe(1);
    expect(result.state.totalFocusMs).toBe(5 * 60 * 1000);
    expect(result.state.status).toBe('idle');
  });

  it('skipping at full work duration yields no focus time', () => {
    const result = skipPhase(makeState({ remainingMs: 25 * 60 * 1000 }));
    expect(result.state.totalFocusMs).toBe(0);
    expect(result.state.completedRounds).toBe(1);
  });

  it('skipping a break returns to a fresh work phase without focus credit', () => {
    const state = makeState({
      phase: 'shortBreak',
      remainingMs: 2 * 60 * 1000,
      completedRounds: 1,
    });
    const result = skipPhase(state);
    expect(result.state.phase).toBe('work');
    expect(result.state.remainingMs).toBe(DEFAULT_STATE.workMinutes * 60 * 1000);
    expect(result.state.completedRounds).toBe(1);
    expect(result.completedRound).toBe(false);
  });

  it('long break triggers after skipped rounds reach the configured count', () => {
    const state = makeState({ remainingMs: 1_000, completedRounds: 3, roundsBeforeLongBreak: 4 });
    const result = skipPhase(state);
    expect(result.state.phase).toBe('longBreak');
  });
});

describe('resetState', () => {
  it('resets to defaults with config overrides', () => {
    const state = resetState({ workMinutes: 50, soundEnabled: false });
    expect(state.workMinutes).toBe(50);
    expect(state.soundEnabled).toBe(false);
    expect(state.phase).toBe('work');
    expect(state.remainingMs).toBe(50 * 60 * 1000);
    expect(state.completedRounds).toBe(0);
    expect(state.totalFocusMs).toBe(0);
    expect(state.status).toBe('idle');
  });
});

describe('serialization round-trip', () => {
  it('round-trips the full configuration', () => {
    const state = makeState({
      workMinutes: 50,
      shortBreakMinutes: 10,
      longBreakMinutes: 30,
      roundsBeforeLongBreak: 6,
      phase: 'shortBreak',
      remainingMs: 123_456,
      status: 'paused',
      completedRounds: 7,
      totalFocusMs: 987_654,
      soundEnabled: false,
    });
    expect(roundTrips(state)).toBe(true);
    const restored = deserializeState(JSON.parse(serializeState(state)));
    expect(restored.success).toBe(true);
    if (restored.success) {
      expect(restored.data).toEqual(state);
    }
  });

  it('normalizes running to paused on serialize', () => {
    const serialized = JSON.parse(serializeState(makeState({ status: 'running' })));
    expect(serialized.status).toBe('paused');
    // A value running -> paused round-trips as equal per serialize() contract.
    expect(roundTrips(makeState({ status: 'running' }))).toBe(true);
  });

  it('rejects non-object payloads', () => {
    expect(deserializeState(null).success).toBe(false);
    expect(deserializeState('nope').success).toBe(false);
    expect(deserializeState([1, 2]).success).toBe(false);
    expect(deserializeState(undefined).success).toBe(false);
  });

  it('falls back to defaults for missing or invalid fields', () => {
    const result = deserializeState({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workMinutes).toBe(DEFAULT_STATE.workMinutes);
      expect(result.data.roundsBeforeLongBreak).toBe(DEFAULT_STATE.roundsBeforeLongBreak);
      expect(result.data.soundEnabled).toBe(true);
    }
  });

  it('clamps out-of-range durations and remaining time from payloads', () => {
    const result = deserializeState({
      workMinutes: 9999,
      shortBreakMinutes: 0,
      longBreakMinutes: -3,
      roundsBeforeLongBreak: 500,
      phase: 'bogus',
      status: 'warp',
      remainingMs: 10 ** 9,
      totalFocusMs: -5,
      completedRounds: -2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workMinutes).toBe(MAX_MINUTES);
      expect(result.data.shortBreakMinutes).toBe(1);
      expect(result.data.longBreakMinutes).toBe(1);
      expect(result.data.roundsBeforeLongBreak).toBe(12);
      expect(result.data.phase).toBe('work');
      expect(result.data.status).toBe('idle');
      expect(result.data.totalFocusMs).toBe(0);
      expect(result.data.completedRounds).toBe(0);
      expect(result.data.remainingMs).toBe(MAX_MINUTES * 60 * 1000);
    }
  });

  it('repairs corrupted tool payloads through the Tool interface', () => {
    const repaired = pomodoroTimerTool.deserialize({ nope: true });
    expect(repaired.success).toBe(true);
    if (repaired.success) {
      expect(repaired.data.workMinutes).toBe(DEFAULT_STATE.workMinutes);
    }
    expect(pomodoroTimerTool.id).toBe('pomodoro-timer');
    expect(pomodoroTimerTool.initialState.phase).toBe('work');
  });

  it('isState reflects structural validity', async () => {
    const { isState } = await import('@/tool/ui-shared');
    expect(isState({ workMinutes: 25, remainingMs: 1, status: 'idle' })).toBe(true);
    expect(isState({})).toBe(false);
    expect(isState(null)).toBe(false);
    expect(isState('x')).toBe(false);
  });
});
