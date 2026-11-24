import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import ToolClient, { playChime } from '@/app/tool-client';
import ToolClientWrapper from '@/app/tool-client-wrapper';
import type { PomodoroState } from '@/tool/types';
import { compressToEncodedURIComponent } from 'lz-string';

const DEFAULT_STATE = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsBeforeLongBreak: 4,
  phase: 'work' as const,
  remainingMs: 25 * 60 * 1000,
  status: 'idle' as const,
  completedRounds: 0,
  totalFocusMs: 0,
  soundEnabled: true,
};

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="dynamic-tool-client">dynamic-tool-client</div>,
}));

const mockSetData = vi.fn();
const mockToast = vi.fn();
const mockHandleExport = vi.fn();
const mockImport = vi.fn();

const mockState: PomodoroState = { ...DEFAULT_STATE };
let currentMockState: Partial<PomodoroState> = {};

vi.mock('@itsjust/core', () => ({
  ToolShell: ({ toolbar, sidebar, canvas, statusBar }: Record<string, unknown>) => (
    <div>
      <div>{toolbar as ReactNode}</div>
      <div>{sidebar as ReactNode}</div>
      <div>{canvas as ReactNode}</div>
      <div>{statusBar as ReactNode}</div>
    </div>
  ),
  ImportExport: ({ onShare }: { onShare?: () => void }) => (
    <button type="button" onClick={onShare}>
      trigger-share
    </button>
  ),
  useTool: () => ({
    state: {
      data: { ...DEFAULT_STATE, ...currentMockState },
      setData: (updater: unknown) => {
        if (typeof updater === 'function') {
          mockSetData(updater);
        } else {
          mockSetData(() => updater);
        }
      },
      isDirty: false,
      lastSaved: 'just now',
    },
    toast: mockToast,
    supportedFormats: ['json'],
    handleExport: mockHandleExport,
    importFromFile: mockImport,
    isImporting: false,
  }),
}));

describe('app client and help page', () => {
  beforeEach(() => {
    mockSetData.mockReset();
    mockToast.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    Object.defineProperty(navigator, 'share', {
      writable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    window.history.replaceState(null, '', 'http://localhost:3000/');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders dynamic tool client wrapper', () => {
    render(<ToolClientWrapper />);
    expect(screen.getByTestId('dynamic-tool-client')).toBeInTheDocument();
  });

  it('handles share flow in tool client', async () => {
    render(<ToolClient />);
    fireEvent.click(screen.getByText('trigger-share'));
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(mockToast).toHaveBeenCalled(), { timeout: 5000 });
  });

  it('loads state from a shared URL on mount', () => {
    const encoded = compressToEncodedURIComponent(
      JSON.stringify({ ...mockState, workMinutes: 50 })
    );
    window.history.replaceState(
      null,
      '',
      `http://localhost:3000/?state=${encodeURIComponent(encoded)}`
    );
    render(<ToolClient />);
    expect(mockSetData).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith('Loaded state from shared URL', 'success');
  });

  it('shows an error toast for a corrupt shared URL', () => {
    window.history.replaceState(null, '', 'http://localhost:3000/?state=%%%not-lz');
    render(<ToolClient />);
    expect(mockToast).toHaveBeenCalledWith('Invalid shared URL', 'error');
  });

  it('does not load state without a share param', () => {
    render(<ToolClient />);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('start button transitions idle -> running and ticking advances remaining time', () => {
    render(<ToolClient />);
    fireEvent.click(screen.getByTestId('btn-start-pause'));
    expect(mockSetData).toHaveBeenCalled();
    const firstCall = mockSetData.mock.calls[0] as unknown[] | undefined;
    if (!firstCall) throw new Error('no setData call');
    const firstUpdater = firstCall[0] as (prev: PomodoroState) => PomodoroState;
    const running: PomodoroState = firstUpdater({ ...DEFAULT_STATE });
    expect(running.status).toBe('running');
    const paused = firstUpdater({ ...DEFAULT_STATE, status: 'running' });
    expect(paused.status).toBe('paused');
    const resumed = firstUpdater({ ...DEFAULT_STATE, status: 'paused' });
    expect(resumed.status).toBe('running');
    // idle start uses the full phase duration when remaining is already full
    expect(running.remainingMs).toBe(DEFAULT_STATE.workMinutes * 60 * 1000);
  });

  it('skip resets to idle and advances phase', () => {
    render(<ToolClient />);
    fireEvent.click(screen.getByTestId('btn-skip'));
    const call = mockSetData.mock.calls[0] as unknown[] | undefined;
    if (!call) throw new Error('no setData call');
    const updater = call[0] as (prev: PomodoroState) => PomodoroState;
    const skipped: PomodoroState = updater({
      ...DEFAULT_STATE,
      status: 'running',
      remainingMs: 1000,
    });
    expect(skipped.status).toBe('idle');
    expect(skipped.phase).toBe('shortBreak');
  });

  it('reset keeps configuration but clears progress', () => {
    render(<ToolClient />);
    fireEvent.click(screen.getByTestId('btn-reset'));
    const call = mockSetData.mock.calls[0] as unknown[] | undefined;
    if (!call) throw new Error('no setData call');
    const updater = call[0] as (prev: PomodoroState) => PomodoroState;
    const reset: PomodoroState = updater({
      ...DEFAULT_STATE,
      completedRounds: 3,
      totalFocusMs: 50 * 60 * 1000,
      workMinutes: 50,
    });
    expect(reset.completedRounds).toBe(0);
    expect(reset.totalFocusMs).toBe(0);
    expect(reset.workMinutes).toBe(50);
    expect(reset.remainingMs).toBe(50 * 60 * 1000);
  });

  it('timer interval advances remaining time and chimes at phase end', () => {
    const audioSpy = vi.fn();
    const originalAudio = window.AudioContext;
    class FakeCtx {
      destination = {};
      currentTime = 0;
      createOscillator = () => ({
        connect: audioSpy,
        frequency: { value: 0 },
        type: '',
        start: vi.fn(),
        stop: vi.fn(),
      });
      createGain = () => ({
        connect: audioSpy,
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      });
      close = vi.fn().mockResolvedValue(undefined);
    }
    Object.defineProperty(window, 'AudioContext', { writable: true, value: FakeCtx });

    let current: PomodoroState = { ...DEFAULT_STATE, status: 'running', remainingMs: 2000 };
    currentMockState = { status: 'running' };
    mockSetData.mockImplementation((updater: (prev: PomodoroState) => PomodoroState) => {
      current = updater(current);
    });
    render(<ToolClient />);
    act(() => {
      vi.advanceTimersByTime(1000); // 500ms interval ticks elapsed ~ covers
    });
    act(() => {
      vi.advanceTimersByTime(4000); // long enough to cross the 2s boundary
    });
    expect(current.remainingMs).toBe(DEFAULT_STATE.shortBreakMinutes * 60 * 1000 - 3000); // overshoot carried
    expect(current.phase).toBe('shortBreak');
    expect(audioSpy).toHaveBeenCalled(); // chime played
    Object.defineProperty(window, 'AudioContext', { writable: true, value: originalAudio });
    currentMockState = {};
  });

  it('playChime silently no-ops without AudioContext', () => {
    const original = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', { writable: true, value: undefined });
    expect(() => playChime()).not.toThrow();
    Object.defineProperty(window, 'AudioContext', { writable: true, value: original });
  });

  it('keyboard shortcuts fire start/pause, skip and reset', () => {
    render(<ToolClient />);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(mockSetData).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 's' });
    expect(mockSetData).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: 'r' });
    expect(mockSetData).toHaveBeenCalledTimes(3);
    // focus an input: shortcut must be ignored
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 's' });
    expect(mockSetData).toHaveBeenCalledTimes(3);
  });
});
