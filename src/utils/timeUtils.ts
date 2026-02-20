export function parseHHMM(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time format "${time}" — expected HH:MM`);
  }
  return { hours: h, minutes: m };
}

export function applyHHMM(base: Date, time: string): Date {
  const { hours, minutes } = parseHHMM(time);
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// Distribute n points evenly across [start, end] with human-friendly jitter.
//
// Jitter strategy:
//   - Time jitter: ±20% of the interval between commits, capped at ±18 minutes.
//     This makes gaps look irregular (e.g. 47 min, 1h 23min, 58min) instead of
//     robotic (1h 00min, 1h 00min, 1h 00min).
//   - Seconds jitter: randomised to 0–59 so timestamps don't land on :00.
//     A manager seeing 09:15:00, 11:00:00, 13:00:00 knows it's a cron job.
//     09:15:34, 11:03:17, 12:58:52 looks like a person.
//
// Commits are kept strictly ordered and within [start, end].
export function distributeEvenly(start: Date, end: Date, n: number): Date[] {
  if (n === 0) return [];
  if (n === 1) {
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    mid.setSeconds(Math.floor(Math.random() * 60), 0);
    return [mid];
  }

  const totalMs = end.getTime() - start.getTime();
  const interval = totalMs / (n + 1); // n+1 gaps so commits don't bunch at the edges

  // Cap jitter at ±18 minutes so commits can't flip order or escape the window
  const maxJitterMs = Math.min(interval * 0.20, 18 * 60_000);

  const times: Date[] = [];

  for (let i = 1; i <= n; i++) {
    const base = start.getTime() + interval * i;

    // Bias the jitter slightly negative (people tend to commit slightly before
    // a mental deadline, not after) — purely cosmetic but makes patterns feel real
    const jitter = (Math.random() * 2 - 1.15) * maxJitterMs;

    // Randomise seconds so timestamps don't land on :00 or :30
    const secondsJitter = Math.floor(Math.random() * 60) * 1_000;

    const t = new Date(base + jitter + secondsJitter);
    times.push(t);
  }

  // Guarantee strictly ascending order (jitter can't cross commits, but be safe)
  times.sort((a, b) => a.getTime() - b.getTime());

  return times;
}

export function msUntil(target: Date): number {
  return target.getTime() - Date.now();
}
