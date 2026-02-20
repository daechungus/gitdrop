import { CommitChunk, ScheduledCommit } from '../types/config';
import { distributeEvenly } from '../utils/timeUtils';

// Assign wall-clock times to each chunk within [windowStart, windowEnd]
export function distributeChunks(
  chunks: CommitChunk[],
  windowStart: Date,
  windowEnd: Date
): ScheduledCommit[] {
  if (chunks.length === 0) return [];

  const times = distributeEvenly(windowStart, windowEnd, chunks.length);

  return chunks.map((chunk, i) => ({
    chunk,
    scheduledTime: times[i],
  }));
}

// Filter out any scheduled commits whose time has already passed
export function filterFuture(scheduled: ScheduledCommit[]): {
  future: ScheduledCommit[];
  past: ScheduledCommit[];
} {
  const now = new Date();
  const future: ScheduledCommit[] = [];
  const past: ScheduledCommit[] = [];

  for (const s of scheduled) {
    if (s.scheduledTime > now) {
      future.push(s);
    } else {
      past.push(s);
    }
  }

  return { future, past };
}
