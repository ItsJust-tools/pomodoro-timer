import type { PomodoroState } from './types';
import { DEFAULT_STATE } from './types';

export function isState(value: unknown): value is PomodoroState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<PomodoroState>;
  return (
    typeof v.workMinutes === 'number' &&
    typeof v.remainingMs === 'number' &&
    typeof v.status === 'string' &&
    DEFAULT_STATE !== undefined
  );
}
