export type ToolConfigVariant = 'classic' | 'long50' | 'deep15';

import type { ToolConfig } from '@itsjust/core';

const toolConfig = {
  id: 'pomodoro-timer',
  name: 'Pomodoro Timer',
  description:
    'A focused Pomodoro timer with configurable work/break intervals, session counters, and audio notification.',
  version: '1.0.0',
  exportFormats: ['json'],
  features: {
    export: true,
    autoSave: true,
    undoRedo: true,
    sidebar: true,
    statusBar: true,
    darkMode: true,
  },
  theme: {
    accent: '#ef4444',
    accentHover: '#dc2626',
    accentSubtle: 'rgba(239, 68, 68, 0.08)',
    brand: 'Pomodoro Timer',
    icon: '🍅',
  },
  shortcuts: [
    {
      title: 'Timer',
      shortcuts: [
        { keys: 'Space', label: 'Start / Pause' },
        { keys: 'S', label: 'Skip interval' },
        { keys: 'R', label: 'Reset session' },
      ],
    },
  ],
} satisfies ToolConfig;

export const PRESETS: {
  id: ToolConfigVariant;
  label: string;
  work: number;
  short: number;
  long: number;
  rounds: number;
}[] = [
  { id: 'classic', label: 'Classic 25/5', work: 25, short: 5, long: 15, rounds: 4 },
  { id: 'long50', label: 'Long focus 50/10', work: 50, short: 10, long: 30, rounds: 2 },
  { id: 'deep15', label: 'Sprint 15/30', work: 15, short: 30, long: 60, rounds: 3 },
];

export const DEFAULT_PRESET: ToolConfigVariant = 'classic';

export default toolConfig;
