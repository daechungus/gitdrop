import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { DaemonSchedule, CommitResult } from '../types/config';
import { formatTime } from '../utils/timeUtils';

const GITDROP_HOME = path.join(os.homedir(), '.gitdrop');

export function statusCommand(scheduleId?: string): void {
  const scheduleDir = path.join(GITDROP_HOME, 'schedules');
  const logDir = path.join(GITDROP_HOME, 'logs');

  if (!fs.existsSync(scheduleDir)) {
    console.log(chalk.gray('No schedules found. Run `gitdrop run` first.'));
    return;
  }

  // List all schedule files or filter by ID
  const files = fs.readdirSync(scheduleDir).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.log(chalk.gray('No active schedules found.'));
    return;
  }

  const targets = scheduleId
    ? files.filter((f) => f.startsWith(scheduleId))
    : files;

  if (targets.length === 0) {
    console.log(chalk.yellow(`No schedule found with ID: ${scheduleId}`));
    return;
  }

  for (const file of targets) {
    const schedulePath = path.join(scheduleDir, file);
    const schedule: DaemonSchedule = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
    const logFile = path.join(logDir, `${schedule.id}.log`);
    const resultsFile = path.join(logDir, `${schedule.id}-results.json`);

    console.log('');
    console.log(chalk.bold(`─── Schedule ${schedule.id} ─────────────────────────`));
    console.log(chalk.cyan('Remote:  ') + schedule.remote);
    console.log(chalk.cyan('Commits: ') + schedule.commits.length);

    // Check if results are available (daemon finished)
    if (fs.existsSync(resultsFile)) {
      const results: CommitResult[] = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
      console.log(chalk.green('Status:  Complete'));
      console.log('');

      results.forEach((r, i) => {
        const icon = r.success ? chalk.green('✓') : chalk.red('✗');
        const time = formatTime(new Date(r.executedAt));
        const hash = r.commitHash ? chalk.gray(r.commitHash.slice(0, 7)) : chalk.red('no hash');
        console.log(
          `  ${icon} #${i + 1}  ${time}  ${chalk.white(r.message)}  ${hash}`
        );
        if (r.error) {
          console.log(chalk.red(`         ${r.error}`));
        }
      });
    } else {
      // Daemon still running — show log tail
      console.log(chalk.yellow('Status:  Running'));
      console.log('');

      if (fs.existsSync(logFile)) {
        const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
        const tail = lines.slice(-10);
        console.log(chalk.gray('Recent log:'));
        tail.forEach((line) => console.log(chalk.gray('  ' + line)));
      }

      console.log('');
      const pending = schedule.commits.filter(
        (c) => new Date(c.scheduledTime) > new Date()
      );
      pending.forEach((c, i) => {
        const fireAt = new Date(c.scheduledTime);
        const timeStr = formatTime(fireAt);
        const isPast = fireAt < new Date();
        const icon = isPast ? chalk.green('✓') : chalk.yellow('⏳');
        console.log(`  ${icon}  ${timeStr}  ${chalk.white(c.message)}`);
        void i;
      });
    }

    console.log('');
    console.log(chalk.gray(`Log: ${logFile}`));
  }
}
