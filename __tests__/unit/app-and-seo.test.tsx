import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import manifest from '@/app/manifest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import ErrorPage from '@/app/error';
import NotFound from '@/app/not-found';
import { JsonLd } from '@/app/json-ld';
import ToolPage from '@/app/page';
import { cn } from '@/lib/utils';
import { generateJsonLd, generateToolMetadata } from '@/lib/seo';
import toolConfig from '@/tool/tool.config';
import { getPublicSiteUrl, templateMetadata } from '@/tool/template-metadata';
import { pomodoroTimerTool } from '@/tool/tool-definition';
import { Canvas } from '@/tool/components/Canvas';
import { Sidebar } from '@/tool/components/Sidebar';
import { Toolbar } from '@/tool/components/Toolbar';
import { DEFAULT_STATE as BASE_DEFAULT_STATE } from '@/tool/types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/app/tool-client-wrapper', () => ({
  default: () => <div data-testid="tool-client-wrapper">tool-client-wrapper</div>,
}));

describe('app and seo', () => {
  const getOgImageUrl = (
    images: NonNullable<NonNullable<ReturnType<typeof generateToolMetadata>['openGraph']>['images']>
  ): string | undefined => {
    const list = Array.isArray(images) ? images : [images];
    const first = list[0];
    if (!first) return undefined;
    if (typeof first === 'string') return first;
    if (first instanceof URL) return first.toString();
    return String(first.url);
  };

  it('builds metadata and json-ld values', () => {
    const metadata = generateToolMetadata(toolConfig);
    const jsonLd = generateJsonLd(toolConfig);

    expect(metadata.creator).toBe(toolConfig.name);
    expect(metadata.metadataBase?.toString()).toBe('http://localhost:3000/');
    const ogUrl = metadata.openGraph?.images ? getOgImageUrl(metadata.openGraph.images) : undefined;
    expect(ogUrl).toContain('/og.svg');
    expect(jsonLd.url).toBe('http://localhost:3000');
    expect(jsonLd.featureList.length).toBeGreaterThan(0);
  });

  it('returns site manifest, robots and sitemap', () => {
    const man = manifest();
    const rob = robots();
    const map = sitemap();
    expect(man.name).toBe(templateMetadata.shortName);
    expect(Array.isArray(rob.rules) ? rob.rules.length : 1).toBeGreaterThan(0);
    expect(Array.isArray(map)).toBe(true);
  });

  it('renders error and not-found boundaries', () => {
    render(<ErrorPage error={new Error('boom')} reset={() => {}} />);
    render(<NotFound />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders JSON-LD script', () => {
    render(<JsonLd config={toolConfig} />);
    expect(document.querySelector('script[type="application/ld+json"]')).toBeInTheDocument();
  });

  it('renders top-level tool page', () => {
    render(<ToolPage />);
    expect(screen.getByTestId('tool-client-wrapper')).toBeInTheDocument();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeInTheDocument();
  });

  it('covers tool definition and helper exports', async () => {
    expect(cn('a', undefined, 'b', false, null, 'c')).toBe('a b c');
    expect(getPublicSiteUrl()).toBe('http://localhost:3000');
    expect(pomodoroTimerTool.name).toBe(toolConfig.name);
    const deserialized = pomodoroTimerTool.deserialize({
      workMinutes: 50,
      shortBreakMinutes: 10,
      longBreakMinutes: 30,
      roundsBeforeLongBreak: 2,
      phase: 'shortBreak',
      remainingMs: 60_000,
      status: 'paused',
      completedRounds: 2,
      totalFocusMs: 100 * 60 * 1000,
      soundEnabled: true,
    });
    expect(deserialized.success).toBe(true);
    if (deserialized.success) {
      expect(deserialized.data.workMinutes).toBe(50);
      expect(deserialized.data.remainingMs).toBe(60_000);
    }
    const repaired = pomodoroTimerTool.deserialize({ nope: true });
    expect(repaired.success).toBe(true);
    if (repaired.success) {
      expect(repaired.data.workMinutes).toBe(BASE_DEFAULT_STATE.workMinutes);
    }
    const serialized = pomodoroTimerTool.serialize({ ...BASE_DEFAULT_STATE, workMinutes: 50 });
    expect(serialized).toContain('"workMinutes":50');
    expect(pomodoroTimerTool.serialize({ ...BASE_DEFAULT_STATE })).toContain('"phase":"work"');
  });

  it('renders tool components and applies presets', async () => {
    const user = userEvent.setup();
    let latest = { ...BASE_DEFAULT_STATE };
    const Harness: React.FC = () => (
      <>
        <Toolbar
          state={latest}
          onChange={() => {}}
          onStartPause={() => {}}
          onReset={() => {}}
          onSkip={() => {}}
        />
        <Sidebar
          state={latest}
          onChange={(next) => {
            latest = next;
            setHarness({ ...next });
          }}
        />
      </>
    );
    let setHarness: (s: typeof latest) => void = () => undefined;
    const { rerender } = render(<Harness />);
    setHarness = (s) => {
      latest = s;
      rerender(<Harness />);
    };

    expect(screen.getByTestId('btn-start-pause')).toHaveTextContent('Start');
    expect(screen.getByTestId('preset-classic')).toBeInTheDocument();

    // Clicking a preset applies its schedule.
    await user.click(screen.getByTestId('preset-long50'));
    expect(latest.workMinutes).toBe(50);
    expect(latest.shortBreakMinutes).toBe(10);
    expect(latest.longBreakMinutes).toBe(30);
    expect(latest.roundsBeforeLongBreak).toBe(2);
    expect(latest.phase).toBe('work');
    expect(latest.remainingMs).toBe(50 * 60 * 1000);
    expect(latest.status).toBe('idle');
  });

  it('canvas settings inputs update state', async () => {
    const user = userEvent.setup();
    let latest = { ...BASE_DEFAULT_STATE };
    const Harness: React.FC = () => (
      <Canvas
        state={latest}
        onChange={(next) => {
          latest = next;
          setLatest({ ...next });
        }}
      />
    );
    let setLatest: (s: typeof latest) => void = () => undefined;
    const { rerender } = render(<Harness />);
    setLatest = (s) => {
      latest = s;
      rerender(<Harness />);
    };
    await user.click(screen.getByTestId('input-sound'));
    expect(latest.soundEnabled).toBe(false);
    await user.clear(screen.getByTestId('input-work'));
    await user.type(screen.getByTestId('input-work'), '5');
    await user.type(screen.getByTestId('input-work'), '0');
    expect(latest.workMinutes).toBe(150); // types 5 -> 50 -> 150 into the number input
    expect(latest.soundEnabled).toBe(false); // earlier toggle persisted
    expect(latest.remainingMs).toBe(BASE_DEFAULT_STATE.remainingMs); // unchanged by typing
  });
});
