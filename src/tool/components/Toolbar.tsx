'use client';

import React from 'react';
import type { PomodoroState } from '../types';

interface ToolbarProps {
  state: PomodoroState;
  onChange: (next: PomodoroState) => void;
  onStartPause: () => void;
  onReset: () => void;
  onSkip: () => void;
}

const btnClass =
  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export const Toolbar: React.FC<ToolbarProps> = ({ state, onStartPause, onReset, onSkip }) => {
  const running = state.status === 'running';
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
      data-testid="toolbar"
    >
      <div className="flex items-center gap-2" role="group" aria-label="Pomodoro timer controls">
        <button
          type="button"
          onClick={onStartPause}
          data-testid="btn-start-pause"
          className={`${btnClass} ${
            running
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {running ? 'Pause' : state.status === 'paused' ? 'Resume' : 'Start'}
        </button>
        <button
          type="button"
          onClick={onSkip}
          data-testid="btn-skip"
          className={`${btnClass} bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700`}
        >
          Skip
        </button>
        <button
          type="button"
          onClick={onReset}
          data-testid="btn-reset"
          className={`${btnClass} bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700`}
        >
          Reset
        </button>
      </div>
      <span data-testid="toolbar-summary" className="text-xs text-gray-500 dark:text-gray-400">
        {state.completedRounds}rounds · {Math.round(state.totalFocusMs / 60000)}min focus
      </span>
    </div>
  );
};
