import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import simpleGit, { SimpleGit } from 'simple-git';
import { ResolvedConfig } from '../types/config';

export class RepoManager {
  private git!: SimpleGit;
  private workDir!: string;
  private config: ResolvedConfig;

  constructor(config: ResolvedConfig) {
    this.config = config;
  }

  get workingDir(): string {
    return this.workDir;
  }

  // Clone the remote into a fresh temp directory and return the path.
  // If the remote is empty (no commits), initialize an empty repo instead.
  async setup(): Promise<string> {
    this.workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitdrop-'));

    try {
      const rootGit = simpleGit({ baseDir: os.tmpdir() });
      await rootGit.clone(this.config.remote, this.workDir, ['--depth', '1']);
    } catch (e) {
      const msg = (e as Error).message;

      if (
        msg.includes('Authentication failed') ||
        msg.includes('not found') ||
        msg.includes('Repository not found')
      ) {
        throw new Error(
          `Cannot access remote: ${this.config.remote}\n` +
            `Make sure the repo exists and you have push access.\n` +
            `Tip: embed a PAT in the URL:\n` +
            `  https://<TOKEN>@github.com/user/repo.git`
        );
      }

      // Empty repo — initialize locally and add the remote
      if (
        msg.includes('empty repository') ||
        msg.includes('did not match any file') ||
        msg.includes('Remote branch') ||
        msg.includes('nothing to fetch')
      ) {
        const initGit = simpleGit({ baseDir: this.workDir });
        await initGit.init();
        await initGit.addRemote('origin', this.config.remote);
      } else {
        throw e;
      }
    }

    this.git = simpleGit({ baseDir: this.workDir });

    // Apply author identity if provided
    if (this.config.author) {
      await this.git.addConfig('user.name', this.config.author.name);
      await this.git.addConfig('user.email', this.config.author.email);
    }

    return this.workDir;
  }

  // Copy a list of source-relative file paths into the working dir
  copyFiles(files: string[]): void {
    const missing: string[] = [];

    for (const relPath of files) {
      const src = path.join(this.config.resolvedSourceDir, relPath);
      const dest = path.join(this.workDir, relPath);

      if (!fs.existsSync(src)) {
        missing.push(relPath);
        continue;
      }

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing source files in ${this.config.resolvedSourceDir}:\n` +
          missing.map((f) => `  - ${f}`).join('\n')
      );
    }
  }

  // Stage + commit the given files.
  // Returns the commit hash, or '' if there was nothing to commit.
  async commit(files: string[], message: string): Promise<string> {
    this.copyFiles(files);

    await this.git.add(files);

    const status = await this.git.status();
    if (status.staged.length === 0) {
      return '';
    }

    const result = await this.git.commit(message);
    return result.commit;
  }

  async push(): Promise<void> {
    try {
      await this.git.push('origin', 'HEAD', ['--set-upstream']);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('rejected') || msg.includes('non-fast-forward')) {
        throw new Error(
          `Push rejected — remote has diverged. Re-run gitdrop to re-clone and retry.`
        );
      }
      throw e;
    }
  }

  cleanup(): void {
    if (this.workDir && fs.existsSync(this.workDir)) {
      fs.rmSync(this.workDir, { recursive: true, force: true });
    }
  }
}

// Standalone setup used by the daemon (which receives the workDir pre-cloned)
export function getGitForWorkDir(
  workDir: string,
  author?: { name: string; email: string }
): Promise<SimpleGit> {
  const git = simpleGit({ baseDir: workDir });
  const tasks: Promise<unknown>[] = [];
  if (author) {
    tasks.push(git.addConfig('user.name', author.name));
    tasks.push(git.addConfig('user.email', author.email));
  }
  return Promise.all(tasks).then(() => git);
}
