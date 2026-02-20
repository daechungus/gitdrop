#!/usr/bin/env node
/**
 * gitdrop daemon — runs as a detached background process.
 *
 * Invoked by the main `gitdrop run` command as:
 *   node dist/core/daemon.js <schedule-file>
 *
 * The daemon:
 *  1. Reads the DaemonSchedule JSON from the schedule file
 *  2. Uses node-schedule to fire each commit at its exact wall-clock time
 *  3. Logs results to the log file specified in the schedule
 *  4. Cleans up the temp workDir after all commits are done
 */

import * as fs from 'fs';
import * as path from 'path';
import * as schedule from 'node-schedule';
import simpleGit from 'simple-git';
import { DaemonSchedule, CommitResult } from '../types/config';

const scheduleFile = process.argv[2];

if (!scheduleFile || !fs.existsSync(scheduleFile)) {
  process.stderr.write(`[gitdrop-daemon] Schedule file not found: ${scheduleFile}\n`);
  process.exit(1);
}

const daemonSchedule: DaemonSchedule = JSON.parse(fs.readFileSync(scheduleFile, 'utf-8'));
const { id, workDir, author, pushStrategy, commits, logFile } = daemonSchedule;

// Ensure log directory exists
fs.mkdirSync(path.dirname(logFile), { recursive: true });

function logEntry(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  process.stdout.write(line);
}

logEntry(`Daemon started for schedule ${id} — ${commits.length} commit(s) queued`);

// Setup git in the pre-cloned workDir
const git = simpleGit({ baseDir: workDir });

async function applyAuthor(): Promise<void> {
  if (author) {
    await git.addConfig('user.name', author.name);
    await git.addConfig('user.email', author.email);
  }
}

async function executeCommit(
  files: string[],
  message: string,
  scheduledTime: string
): Promise<CommitResult> {
  // Stage files
  await git.add(files);

  const status = await git.status();
  if (status.staged.length === 0) {
    return {
      message,
      files,
      scheduledTime,
      executedAt: new Date().toISOString(),
      commitHash: '',
      success: false,
      error: 'No changes detected — files may already be identical to remote HEAD',
    };
  }

  const result = await git.commit(message);
  return {
    message,
    files,
    scheduledTime,
    executedAt: new Date().toISOString(),
    commitHash: result.commit,
    success: true,
  };
}

async function doPush(): Promise<void> {
  await git.push('origin', 'HEAD', ['--set-upstream']);
}

async function main(): Promise<void> {
  await applyAuthor();

  let completedCount = 0;
  const total = commits.length;
  const cancelFns: Array<() => void> = [];
  const results: CommitResult[] = [];

  const onAllDone = async (): Promise<void> => {
    if (pushStrategy === 'batch-end') {
      logEntry('Pushing all commits...');
      try {
        await doPush();
        logEntry('Push complete.');
      } catch (e) {
        logEntry(`Push failed: ${(e as Error).message}`);
      }
    }

    // Write results summary
    const summaryFile = logFile.replace('.log', '-results.json');
    fs.writeFileSync(summaryFile, JSON.stringify(results, null, 2));
    logEntry(`Done. Results written to ${summaryFile}`);

    // Cleanup temp workDir
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
      logEntry('Temp working directory cleaned up.');
    } catch {
      logEntry('Warning: could not clean up temp dir.');
    }

    // Remove the schedule file
    try { fs.unlinkSync(scheduleFile); } catch { /* ignore */ }

    process.exit(0);
  };

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const fireAt = new Date(commit.scheduledTime);

    logEntry(
      `Scheduled commit ${i + 1}/${total}: "${commit.message}" at ${fireAt.toLocaleTimeString()}`
    );

    const job = schedule.scheduleJob(fireAt, async () => {
      logEntry(`Firing commit ${i + 1}/${total}: "${commit.message}"`);

      try {
        const result = await executeCommit(commit.files, commit.message, commit.scheduledTime);

        if (result.success) {
          logEntry(`  Committed: ${result.commitHash} — "${result.message}"`);

          if (pushStrategy === 'after-each') {
            logEntry(`  Pushing...`);
            await doPush();
            logEntry(`  Push complete.`);
          }
        } else {
          logEntry(`  Skipped: ${result.error}`);
        }

        results.push(result);
      } catch (e) {
        const errResult: CommitResult = {
          message: commit.message,
          files: commit.files,
          scheduledTime: commit.scheduledTime,
          executedAt: new Date().toISOString(),
          commitHash: '',
          success: false,
          error: (e as Error).message,
        };
        results.push(errResult);
        logEntry(`  Error: ${(e as Error).message}`);
      }

      completedCount++;
      if (completedCount === total) {
        await onAllDone();
      }
    });

    cancelFns.push(() => job.cancel());
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    logEntry('Daemon interrupted — cancelling remaining jobs...');
    cancelFns.forEach((fn) => fn());
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logEntry('Daemon terminated.');
    cancelFns.forEach((fn) => fn());
    process.exit(0);
  });
}

main().catch((e) => {
  fs.appendFileSync(logFile, `[FATAL] ${(e as Error).message}\n`);
  process.exit(1);
});
