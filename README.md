# Pomodoro Timer

A focused Pomodoro timer with configurable work/break intervals, session counters, and audio notification.

**Live:** [pomodoro-timer.itsjust.tools](https://pomodoro-timer.itsjust.tools)

## Features

- Configurable work, short break, and long break durations
- Automatic cycling: work → short break → work, with a long break after the configured number of rounds
- Start, pause, reset, and skip controls
- Round counter and total focus-time tracking for today
- Optional audio chime when an interval ends
- Preset schedules: classic 25/5, long focus 50/10, and sprint 15/30
- Shareable state via URL, `.itsjust.json` import/export
- 100% client-side — no data ever leaves your browser

## Keyboard shortcuts

| Key     | Action        |
| ------- | ------------- |
| `Space` | Start / Pause |
| `S`     | Skip interval |
| `R`     | Reset session |

## Development

```bash
npm install
npm run build -w @itsjust/core   # build shared core first
npm run dev
npm test
```

## Deployment

```bash
docker build -t itsjust-pomodoro-timer .
docker run -p 3000:3000 itsjust-pomodoro-timer
```

## License

MIT
