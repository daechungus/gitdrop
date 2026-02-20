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

// Distribute n points evenly across [start, end], with human-friendly variance
// Returns array of Dates
export function distributeEvenly(start: Date, end: Date, n: number): Date[] {
  if (n === 0) return [];
  if (n === 1) {
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    return [mid];
  }

  const totalMs = end.getTime() - start.getTime();
  const interval = totalMs / (n + 1); // n+1 gaps including edges
  const times: Date[] = [];

  for (let i = 1; i <= n; i++) {
    // Add slight random jitter (±30s) so commits don't look mechanical
    const jitter = (Math.random() - 0.5) * 60_000;
    const t = new Date(start.getTime() + interval * i + jitter);
    times.push(t);
  }

  return times;
}

export function msUntil(target: Date): number {
  return target.getTime() - Date.now();
}
