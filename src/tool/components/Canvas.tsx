'use client';

import React from 'react';
import {
  formatMs,
  formatFocusTotal,
  phaseLabel,
  type Phase,
  type PomodoroState,
  type TimerStatus,
} from '../types';

interface CanvasProps {
  state: PomodoroState;
  onChange?: (state: PomodoroState) => void;
}

const PHASES: Phase[] = ['work', 'shortBreak', 'longBreak'];

function phaseDotColor(phase: Phase): string {
  return phase === 'work' ? 'bg-red-500' : phase === 'shortBreak' ? 'bg-green-500' : 'bg-blue-500';
}

export const Canvas: React.FC<CanvasProps> = ({ state, onChange }) => {
  const update = (patch: Partial<PomodoroState>) => onChange?.({ ...state, ...patch });
  const running = state.status === 'running';
  const roundInSet =
    state.roundsBeforeLongBreak > 0 ? (state.completedRounds % state.roundsBeforeLongBreak) + 1 : 1;

  const minutesField = (
    label: string,
    key: 'workMinutes' | 'shortBreakMinutes' | 'longBreakMinutes',
    testid: string
  ) => (
    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
      {label}
      <input
        type="number"
        min={1}
        max={180}
        value={state[key]}
        onChange={(e) => {
          const value = Number(e.target.value);
          update({ [key]: Number.isFinite(value) && value > 0 ? value : 1 });
        }}
        data-testid={testid}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />
    </label>
  );

  return (
    <div
      className="flex flex-col items-center gap-6 p-6"
      data-testid="pomodoro-canvas"
      data-phase={state.phase}
      data-status={state.status}
    >
      {/* Phase tabs */}
      <div className="flex gap-1" role="tablist" aria-label="Timer phase">
        {PHASES.map((phase) => (
          <button
            key={phase}
            type="button"
            role="tab"
            aria-selected={state.phase === phase}
            data-testid={`phase-tab-${phase}`}
            onClick={() => {
              const durations: Record<Phase, number> = {
                work: state.workMinutes,
                shortBreak: state.shortBreakMinutes,
                longBreak: state.longBreakMinutes,
              };
              update({
                phase,
                remainingMs: Math.max(1, durations[phase]) * 60 * 1000,
                status: state.status === 'running' ? 'paused' : state.status,
              });
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              state.phase === phase
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {phaseLabel(phase)}
          </button>
        ))}
      </div>

      {/* Big time display */}
      <div
        data-testid="time-display"
        aria-live="polite"
        className="font-mono text-6xl font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-7xl"
      >
        {formatMs(state.remainingMs)}
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <span
          data-testid="status-indicator"
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            running
              ? 'animate-pulse bg-green-500'
              : state.status === 'paused'
                ? 'bg-yellow-500'
                : 'bg-gray-400'
          }`}
        />
        <span data-testid="status-text">
          {running ? 'Running' : state.status === 'paused' ? 'Paused' : 'Ready'} —{' '}
          {phaseLabel(state.phase)}
        </span>
      </div>

      {/* Round dots */}
      <div
        className="flex items-center gap-1.5"
        data-testid="round-dots"
        aria-label="Round progress"
      >
        {Array.from({ length: state.roundsBeforeLongBreak }, (_, i) => (
          <span
            key={i}
            title={`Round ${i + 1} of ${state.roundsBeforeLongBreak}`}
            className={`h-3 w-3 rounded-full border border-gray-300 dark:border-gray-600 ${
              i < roundInSet
                ? phaseDotColor(state.phase === 'work' ? 'work' : state.phase)
                : 'bg-transparent'
            }`}
          />
        ))}
        <span data-testid="round-counter" className="ml-2 text-sm text-gray-600 dark:text-gray-400">
          Round {roundInSet}/{state.roundsBeforeLongBreak}
        </span>
      </div>

      {/* Today stats */}
      <div className="grid w-full max-w-md grid-cols-2 gap-3" data-testid="stats">
        <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Completed rounds today
          </div>
          <div
            data-testid="stat-rounds"
            className="text-2xl font-semibold text-gray-900 dark:text-gray-100"
          >
            {state.completedRounds}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Focus time today
          </div>
          <div
            data-testid="stat-focus"
            className="text-2xl font-semibold text-gray-900 dark:text-gray-100"
          >
            {formatFocusTotal(state.totalFocusMs)}
          </div>
        </div>
      </div>

      {/* Settings */}
      <fieldset className="w-full max-w-md rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Settings
        </legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {minutesField('Work (min)', 'workMinutes', 'input-work')}
          {minutesField('Short break (min)', 'shortBreakMinutes', 'input-short')}
          {minutesField('Long break (min)', 'longBreakMinutes', 'input-long')}
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            Rounds → long break
            <input
              type="number"
              min={1}
              max={12}
              value={state.roundsBeforeLongBreak}
              onChange={(e) => {
                const value = Number(e.target.value);
                update({ roundsBeforeLongBreak: Number.isFinite(value) && value > 0 ? value : 1 });
              }}
              data-testid="input-rounds"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={state.soundEnabled}
            onChange={(e) => update({ soundEnabled: e.target.checked })}
            data-testid="input-sound"
            className="h-4 w-4"
          />
          Chime when an interval ends
        </label>
      </fieldset>

      <span className="sr-only" data-testid="sr-status">
        {`${phaseLabel(state.phase)}, ${formatMs(state.remainingMs)} remaining, ${String(state.status as TimerStatus)}`}
      </span>
    </div>
  );
};
