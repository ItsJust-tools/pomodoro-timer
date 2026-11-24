'use client';

import React from 'react';
import type { PomodoroState } from '../types';
import { PRESETS, DEFAULT_PRESET, type ToolConfigVariant } from '../tool.config';

interface SidebarProps {
  state: PomodoroState;
  onChange: (next: PomodoroState) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ state, onChange }) => {
  const applyPreset = (presetId: ToolConfigVariant) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onChange({
      ...state,
      workMinutes: preset.work,
      shortBreakMinutes: preset.short,
      longBreakMinutes: preset.long,
      roundsBeforeLongBreak: preset.rounds,
      phase: 'work',
      remainingMs: preset.work * 60 * 1000,
      status: 'idle',
    });
  };

  const activePreset = PRESETS.find(
    (p) =>
      p.work === state.workMinutes &&
      p.short === state.shortBreakMinutes &&
      p.long === state.longBreakMinutes &&
      p.rounds === state.roundsBeforeLongBreak
  );

  return (
    <div
      className="flex flex-col gap-4 p-4 text-sm text-gray-700 dark:text-gray-300"
      data-testid="sidebar"
    >
      <section aria-label="Preset schedules">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Presets
        </h3>
        <div className="flex flex-col gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`preset-${preset.id}`}
              onClick={() => applyPreset(preset.id)}
              className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                activePreset?.id === preset.id
                  ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                  : 'border-gray-200 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800'
              }`}
            >
              <span className="font-medium">{preset.label}</span>
              <span className="block text-gray-500 dark:text-gray-400">
                {preset.work}m work · {preset.short}m short · {preset.long}m long · long break every{' '}
                {preset.rounds} rounds
              </span>
            </button>
          ))}
        </div>
        {!activePreset && (
          <p
            className="mt-2 text-xs text-gray-500 dark:text-gray-400"
            data-testid="custom-config-note"
          >
            Custom schedule — defaults apply from “
            {PRESETS.find((p) => p.id === DEFAULT_PRESET)?.label}”.
          </p>
        )}
      </section>

      <section aria-label="Session summary">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Today
        </h3>
        <ul className="space-y-1 text-xs">
          <li data-testid="sidebar-rounds">Completed rounds: {state.completedRounds}</li>
          <li data-testid="sidebar-focus">
            Focus time: {Math.round(state.totalFocusMs / 60000)} min
          </li>
          <li>Sound: {state.soundEnabled ? 'on' : 'off'}</li>
        </ul>
      </section>

      <section aria-label="How it works">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          How it works
        </h3>
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Work in focused intervals, take a short break after each one, and a long break after{' '}
          {state.roundsBeforeLongBreak} rounds. Use <kbd>Space</kbd> to start/pause and <kbd>S</kbd>{' '}
          to skip. Your configuration lives in the URL, so a bookmarked timer keeps its settings.
        </p>
      </section>
    </div>
  );
};
