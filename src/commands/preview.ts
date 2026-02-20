import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { loadConfig } from '../core/configLoader';
import { detectChangedFiles, chunkFiles } from '../core/differ';
import { distributeChunks, filterFuture } from '../core/distributor';
import { createSpinner } from '../utils/spinner';
import { formatTime, formatDate } from '../utils/timeUtils';

export async function previewCommand(configPath: string): Promise<void> {
  const spinner = createSpinner('Loading config...');
  spinner.start();

  let config;
  try {
    config = loadConfig(configPath);
    spinner.succeed('Config loaded');
  } catch (e) {
    spinner.fail(`Config error: ${(e as Error).message}`);
    process.exit(1);
  }

  // Clone remote to a temp dir to do the diff
  const cloneSpinner = createSpinner('Cloning remote to compute diff...');
  cloneSpinner.start();

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitdrop-preview-'));

  try {
    const rootGit = simpleGit({ baseDir: os.tmpdir() });
    try {
      await rootGit.clone(config.remote, workDir, ['--depth', '1']);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('empty repository') || msg.includes('did not match any file')) {
        // Empty repo — treat as if nothing is in remote (all files are new)
      } else {
        throw e;
      }
    }
    cloneSpinner.succeed('Remote cloned');
  } catch (e) {
    cloneSpinner.fail(`Clone failed: ${(e as Error).message}`);
    fs.rmSync(workDir, { recursive: true, force: true });
    process.exit(1);
  }

  // Detect diffs and build schedule
  const diffSpinner = createSpinner('Detecting changed files...');
  diffSpinner.start();

  const changedFiles = detectChangedFiles(config.resolvedSourceDir, workDir);

  if (changedFiles.length === 0) {
    diffSpinner.warn('No differences detected — local code matches remote HEAD.');
    fs.rmSync(workDir, { recursive: true, force: true });
    return;
  }

  diffSpinner.succeed(`Found ${changedFiles.length} changed file(s)`);

  const chunks = chunkFiles(changedFiles, config.chunkBy);
  const scheduled = distributeChunks(chunks, config.windowStart, config.windowEnd);
  const { future, past } = filterFuture(scheduled);

  // Cleanup temp
  fs.rmSync(workDir, { recursive: true, force: true });

  // Print preview
  console.log('');
  console.log(chalk.bold('─── gitdrop Preview ─────────────────────────────────'));
  console.log(chalk.cyan('Remote:       ') + config.remote);
  console.log(chalk.cyan('Source:       ') + config.resolvedSourceDir);
  console.log(chalk.cyan('Date:         ') + formatDate(config.resolvedDate));
  console.log(chalk.cyan('Window:       ') + `${config.window.start} → ${config.window.end}`);
  console.log(chalk.cyan('Chunk by:     ') + config.chunkBy);
  console.log(chalk.cyan('Push:         ') + config.pushStrategy);
  console.log(chalk.cyan('Commits:      ') + scheduled.length);
  console.log('');

  if (past.length > 0) {
    console.log(
      chalk.yellow(`  ⚠  ${past.length} commit(s) are scheduled before now and will be skipped.\n`)
    );
  }

  scheduled.forEach((s, i) => {
    const isPast = past.includes(s);
    const timeStr = formatTime(s.scheduledTime);
    const status = isPast ? chalk.red('[SKIP]') : chalk.green('[OK]  ');
    const num = chalk.bold(`#${i + 1}`);
    const label = chalk.white(s.chunk.label);
    const msg = chalk.gray(`"${s.chunk.message}"`);

    console.log(`  ${status} ${num} ${timeStr}  ${label}  ${msg}`);
    s.chunk.files.forEach((f) => {
      console.log(`              ${chalk.dim('↳')} ${chalk.gray(f)}`);
    });
    console.log('');
  });

  if (future.length === 0) {
    console.log(chalk.yellow('All commits are in the past. Adjust window.start or window.end.'));
  } else {
    console.log(
      chalk.green(`Ready to schedule ${future.length} commit(s).`) +
        chalk.gray(' Run: gitdrop run')
    );
  }
}
