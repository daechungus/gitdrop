import { z } from 'zod';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const WindowSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, 'start must be HH:MM'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'end must be HH:MM'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
});

export const GitdropConfigSchema = z.object({
  remote: z.string().min(1, 'remote URL is required'),
  sourceDir: z.string().min(1, 'sourceDir is required'),
  window: WindowSchema,
  chunkBy: z.enum(['directory', 'file', 'filetype']).default('directory'),
  author: z
    .object({
      name: z.string().min(1),
      email: z.string().email(),
    })
    .optional(),
  pushStrategy: z.enum(['after-each', 'batch-end']).default('after-each'),
});

// ─── TypeScript Interfaces ────────────────────────────────────────────────────

export interface WindowConfig {
  start: string;
  end: string;
  date?: string;
}

export interface GitdropConfig {
  remote: string;
  sourceDir: string;
  window: WindowConfig;
  chunkBy: 'directory' | 'file' | 'filetype';
  author?: {
    name: string;
    email: string;
  };
  pushStrategy: 'after-each' | 'batch-end';
}

export interface ResolvedConfig extends GitdropConfig {
  resolvedSourceDir: string;
  resolvedDate: Date;
  windowStart: Date;
  windowEnd: Date;
}

// A single chunk of files to be committed together
export interface CommitChunk {
  files: string[];
  message: string;
  label: string; // human-readable group name (e.g., "src/components")
}

// A scheduled commit — chunk + assigned wall-clock time
export interface ScheduledCommit {
  chunk: CommitChunk;
  scheduledTime: Date;
}

// The full schedule written to disk for the daemon to read
export interface DaemonSchedule {
  id: string;
  remote: string;
  resolvedSourceDir: string;
  workDir: string;
  author?: { name: string; email: string };
  pushStrategy: 'after-each' | 'batch-end';
  commits: Array<{
    scheduledTime: string; // ISO string
    files: string[];
    message: string;
  }>;
  logFile: string;
}

export interface CommitResult {
  message: string;
  files: string[];
  scheduledTime: string;
  executedAt: string;
  commitHash: string;
  success: boolean;
  error?: string;
}
