'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { ToolShell, useTool, ImportExport } from '@itsjust/core';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { toolConfig, templateBaseVersion, Canvas, Toolbar, Sidebar } from '@/tool';
import { pomodoroTimerTool } from '@/tool/tool-definition';
import {
  advance,
  skipPhase,
  phaseDurationMs,
  DEFAULT_STATE,
  type PomodoroState,
  type Phase,
} from '@/tool/types';

/** Single chime via Web Audio; silently ignored when audio is unavailable. */
export function playChime(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.5);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.55);
    });
    window.setTimeout(() => void ctx.close().catch(() => undefined), 1500);
  } catch {
    // Audio unavailable (autoplay policy or no Web Audio support); ignore.
  }
}

export default function ToolClient() {
  const ToolShellCompat = ToolShell as unknown as ComponentType<Record<string, unknown>> & {
    Toolbar?: ComponentType<{ children?: ReactNode }>;
    Body?: ComponentType<{ children?: ReactNode }>;
    Sidebar?: ComponentType<{ children?: ReactNode }>;
    Canvas?: ComponentType<{ children?: ReactNode }>;
    StatusBar?: ComponentType<{ children?: ReactNode }>;
  };
  const canvasRef = useRef<HTMLDivElement>(null);
  const tool = useTool<PomodoroState>(pomodoroTimerTool, canvasRef);
  const setToolData = tool.state.setData;
  const showToast = tool.toast;
  const [isSharing, setIsSharing] = useState(false);
  const hasLoadedSharedState = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth > 768 && toolConfig.features.sidebar
  );

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(0);
  const title = toolConfig.name;
  const state = tool.state.data;

  // Load shared URL state once on mount.
  useEffect(() => {
    if (hasLoadedSharedState.current) return;
    hasLoadedSharedState.current = true;
    const params = new URLSearchParams(window.location.search);
    const encodedState = params.get('state');
    if (!encodedState) return;
    try {
      const serialized = decompressFromEncodedURIComponent(encodedState);
      if (!serialized) throw new Error('Invalid shared URL');
      const parsed: unknown = JSON.parse(serialized);
      const deserialized = pomodoroTimerTool.deserialize(parsed);
      if (!deserialized.success) throw new Error(deserialized.error);
      setToolData(deserialized.data);
      showToast('Loaded state from shared URL', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load shared URL';
      showToast(message, 'error');
    }
  }, [setToolData, showToast]);

  const clearTicker = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (state.status !== 'running') {
      clearTicker();
      return;
    }
    lastTickRef.current = Date.now();
    tickRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      setToolData((prev: PomodoroState): PomodoroState => {
        if (prev.status !== 'running') return prev;
        const result = advance(prev, elapsed);
        const nextState = result.state;
        if (result.completedPhase && result.state.soundEnabled) {
          playChime();
        }
        void nextState;
        return result.state;
      });
    }, 250);
    return clearTicker;
  }, [state.status, clearTicker, setToolData]);

  const handleStartPause = useCallback(() => {
    setToolData((prev: PomodoroState): PomodoroState => {
      if (prev.status === 'running') return { ...prev, status: 'paused' };
      if (prev.status === 'paused') return { ...prev, status: 'running' };
      // idle: start the current phase from full duration
      return {
        ...prev,
        status: 'running',
        remainingMs: Math.max(prev.remainingMs, phaseDurationMs(prev, prev.phase)),
      };
    });
  }, [setToolData]);

  const handleSkip = useCallback(() => {
    clearTicker();
    setToolData((prev: PomodoroState): PomodoroState => skipPhase(prev).state);
  }, [clearTicker, setToolData]);

  const handleReset = useCallback(() => {
    clearTicker();
    setToolData((prev: PomodoroState): PomodoroState => ({
      ...DEFAULT_STATE,
      workMinutes: prev.workMinutes,
      shortBreakMinutes: prev.shortBreakMinutes,
      longBreakMinutes: prev.longBreakMinutes,
      roundsBeforeLongBreak: prev.roundsBeforeLongBreak,
      soundEnabled: prev.soundEnabled,
      remainingMs: prev.workMinutes * 60 * 1000,
    }));
  }, [clearTicker, setToolData]);

  const handleResetStats = useCallback(() => {
    setToolData((prev) => ({ ...prev, completedRounds: 0, totalFocusMs: 0 }));
  }, [setToolData]);

  // Keyboard shortcuts: Space = start/pause, S = skip, R = reset.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        handleStartPause();
      } else if (event.key === 's' || event.key === 'S') {
        handleSkip();
      } else if (event.key === 'r' || event.key === 'R') {
        handleReset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleStartPause, handleSkip, handleReset]);

  const handleShare = useCallback(async () => {
    setIsSharing(true);
    try {
      const serialized = pomodoroTimerTool.serialize(state);
      const encodedState = compressToEncodedURIComponent(serialized);
      if (!encodedState) throw new Error('Failed to encode state for URL');
      const url = new URL(window.location.href);
      url.searchParams.set('state', encodedState);
      url.searchParams.set('tool', toolConfig.id);
      window.history.replaceState(null, '', url.toString());

      const shareUrl = url.toString();
      if (navigator.share) {
        try {
          await navigator.share({ title, url: shareUrl });
          showToast('Shared URL ready', 'success');
          return;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(shareUrl);
      showToast('Share URL copied to clipboard', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create share URL';
      showToast(message, 'error');
    } finally {
      setIsSharing(false);
    }
  }, [showToast, state, title]);

  const toolbarContent = (
    <>
      <Toolbar
        state={state}
        onChange={(next) => setToolData(() => next)}
        onStartPause={handleStartPause}
        onSkip={handleSkip}
        onReset={handleReset}
      />
      <ImportExport
        formats={tool.supportedFormats}
        onExport={tool.handleExport}
        onImport={tool.importFromFile}
        isImporting={tool.isImporting}
        onShare={handleShare}
        isSharing={isSharing}
      />
    </>
  );

  const sidebarContent = (
    <>
      <Sidebar state={state} onChange={(next) => setToolData(() => next)} />
      <button
        type="button"
        data-testid="btn-reset-stats"
        onClick={handleResetStats}
        className="m-4 rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        Reset today&rsquo;s counters
      </button>
    </>
  );

  const canvasContent = (
    <div ref={canvasRef}>
      <Canvas state={state} onChange={(next) => setToolData(() => next)} />
    </div>
  );

  const statusBarContent = (
    <>
      <span
        className={`status-slot status-slot-state ${tool.state.isDirty ? 'status-unsaved' : 'status-saved'}`}
      >
        {tool.state.isDirty ? (
          <>
            <span className="status-saving-dot" />
            Unsaved
          </>
        ) : tool.state.lastSaved ? (
          <>Saved {tool.state.lastSaved}</>
        ) : (
          'Ready'
        )}
      </span>
      <span className="status-slot status-slot-mode">{String(state.phase as Phase)}</span>
      <span className="status-slot status-slot-summary">
        {state.completedRounds} rounds · {Math.round(state.totalFocusMs / 60000)} min focus
      </span>
      <span className="status-slot status-slot-tool-version">Tool v{toolConfig.version}</span>
      <span className="status-slot status-slot-template-version">
        Template v{templateBaseVersion}
      </span>
    </>
  );

  const hasLegacySections = Boolean(
    ToolShellCompat.Toolbar &&
    ToolShellCompat.Body &&
    ToolShellCompat.Sidebar &&
    ToolShellCompat.Canvas &&
    ToolShellCompat.StatusBar
  );

  return (
    <ToolShellCompat
      config={toolConfig}
      sidebarOpen={sidebarOpen}
      onSidebarChange={setSidebarOpen}
      toolbar={toolbarContent}
      sidebar={sidebarContent}
      canvas={canvasContent}
      statusBar={statusBarContent}
    >
      {hasLegacySections
        ? (() => {
            const ToolbarSection = ToolShellCompat.Toolbar as ComponentType<{
              children?: ReactNode;
            }>;
            const BodySection = ToolShellCompat.Body as ComponentType<{ children?: ReactNode }>;
            const SidebarSection = ToolShellCompat.Sidebar as ComponentType<{
              children?: ReactNode;
            }>;
            const CanvasSection = ToolShellCompat.Canvas as ComponentType<{ children?: ReactNode }>;
            const StatusBarSection = ToolShellCompat.StatusBar as ComponentType<{
              children?: ReactNode;
            }>;
            return (
              <>
                <ToolbarSection>{toolbarContent}</ToolbarSection>
                <BodySection>
                  <SidebarSection>{sidebarContent}</SidebarSection>
                  <CanvasSection>{canvasContent}</CanvasSection>
                </BodySection>
                <StatusBarSection>{statusBarContent}</StatusBarSection>
              </>
            );
          })()
        : null}
    </ToolShellCompat>
  );
}
