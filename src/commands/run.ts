import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import chalk from 'chalk';
import { loadConfig } from '../core/configLoader';
import { RepoManager } from '../core/repoManager';
import { detectChangedFiles, chunkFiles } from '../core/differ';
import { distributeChunks, filterFuture } from '../core/distributor';
import { createSpinner } from '../utils/spinner';
import { log } from '../utils/logger';
import { formatTime, formatDate } from '../utils/timeUtils';
import { DaemonSchedule } from '../types/config';

// Directory where gitdrop stores its runtime data
const GITDROP_HOME = path.join(os.homedir(), '.gitdrop');

export async function runCommand(configPath: string): Promise<void> {
  // 1. Load config
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

  // 2. Clone remote to temp working dir
  const repoManager = new RepoManager(config);
  const cloneSpinner = createSpinner(`Cloning ${config.remote}...`);
  cloneSpinner.start();

  let workDir: string;
  try {
    workDir = await repoManager.setup();
    cloneSpinner.succeed('Remote cloned to temp dir');
  } catch (e) {
    cloneSpinner.fail(`Clone failed: ${(e as Error).message}`);
    process.exit(1);
  }

  // 3. Detect changed files and chunk them
  const diffSpinner = createSpinner('Detecting changes vs remote...');
  diffSpinner.start();

  const changedFiles = detectChangedFiles(config.resolvedSourceDir, workDir);

  if (changedFiles.length === 0) {
    diffSpinner.warn('No differences detected — local code matches remote HEAD. Nothing to do.');
    repoManager.cleanup();
    process.exit(0);
  }

  diffSpinner.succeed(`${changedFiles.length} file(s) differ from remote`);

  // 4. Chunk and distribute across the time window
  const chunks = chunkFiles(changedFiles, config.chunkBy);
  const scheduled = distributeChunks(chunks, config.windowStart, config.windowEnd);
  const { future, past } = filterFuture(scheduled);

  if (past.length > 0) {
    log.warn(
      `${past.length} commit(s) fall before now and will be skipped.`
    );
  }

  if (future.length === 0) {
    log.error(
      'No commits are scheduled in the future. ' +
        'Adjust window.start/end or run earlier in the day.'
    );
    repoManager.cleanup();
    process.exit(1);
  }

  // 5. Copy ALL source files into workDir now (daemon will git-add each chunk at fire time)
  const copySpinner = createSpinner('Copying source files into working repo...');
  copySpinner.start();

  try {
    repoManager.copyFiles(changedFiles);
    copySpinner.succeed('Source files staged in working repo');
  } catch (e) {
    copySpinner.fail(`File copy failed: ${(e as Error).message}`);
    repoManager.cleanup();
    process.exit(1);
  }

  // 6. Build the daemon schedule JSON
  const scheduleId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const scheduleDir = path.join(GITDROP_HOME, 'schedules');
  const logDir = path.join(GITDROP_HOME, 'logs');
  fs.mkdirSync(scheduleDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const scheduleFile = path.join(scheduleDir, `${scheduleId}.json`);
  const logFile = path.join(logDir, `${scheduleId}.log`);

  const daemonSchedule: DaemonSchedule = {
    id: scheduleId,
    remote: config.remote,
    resolvedSourceDir: config.resolvedSourceDir,
    workDir,
    author: config.author,
    pushStrategy: config.pushStrategy,
    logFile,
    commits: future.map((s) => ({
      scheduledTime: s.scheduledTime.toISOString(),
      files: s.chunk.files,
      message: s.chunk.message,
    })),
  };

  fs.writeFileSync(scheduleFile, JSON.stringify(daemonSchedule, null, 2));

  // 7. Spawn the daemon as a detached background process
  const daemonScript = path.resolve(__dirname, '..', 'core', 'daemon.js');

  if (!fs.existsSync(daemonScript)) {
    log.error(`Daemon script not found at ${daemonScript}`);
    log.error('Run `npm run build` first.');
    repoManager.cleanup();
    fs.unlinkSync(scheduleFile);
    process.exit(1);
  }

  const child = child_process.spawn(process.execPath, [daemonScript, scheduleFile], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref(); // let parent exit freely

  // 8. Print confirmation
  console.log('');
  console.log(chalk.bold('─── gitdrop Running ──────────────────────────────────'));
  console.log(chalk.green('Background daemon started.') + chalk.gray(` ID: ${scheduleId}`));
  console.log('');
  console.log(chalk.cyan('Date:    ') + formatDate(config.resolvedDate));
  console.log(chalk.cyan('Window:  ') + `${config.window.start} → ${config.window.end}`);
  console.log(chalk.cyan('Commits: ') + future.length);
  console.log('');

  future.forEach((s, i) => {
    const timeStr = formatTime(s.scheduledTime);
    console.log(
      `  ${chalk.bold(`#${i + 1}`)}  ${chalk.green(timeStr)}  ${chalk.white(s.chunk.label)}  ${chalk.gray(`"${s.chunk.message}"`)}`
    );
  });

  console.log('');
  console.log(chalk.gray(`Logs:    ${logFile}`));
  console.log(chalk.gray(`Status:  gitdrop status ${scheduleId}`));
  console.log('');
  console.log(chalk.dim('You can close this terminal — commits will fire automatically.'));
}
