import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CommitChunk } from '../types/config';

type ChunkBy = 'directory' | 'file' | 'filetype';

// Recursively walk a directory, returning all file paths relative to root
function walk(dir: string, root: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip common noise directories
      if (['.git', 'node_modules', '.next', 'dist', 'build', '__pycache__'].includes(entry.name)) {
        continue;
      }
      files.push(...walk(fullPath, root));
    } else {
      files.push(path.relative(root, fullPath).replace(/\\/g, '/'));
    }
  }

  return files;
}

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Compare local source dir against the cloned work dir.
// Returns the list of file paths (relative to sourceDir) that differ or are new.
export function detectChangedFiles(sourceDir: string, workDir: string): string[] {
  const localFiles = walk(sourceDir, sourceDir);
  const changed: string[] = [];

  for (const relPath of localFiles) {
    const srcPath = path.join(sourceDir, relPath);
    const remotePath = path.join(workDir, relPath);

    if (!fs.existsSync(remotePath)) {
      // New file — not in remote
      changed.push(relPath);
    } else {
      const srcHash = hashFile(srcPath);
      const remoteHash = hashFile(remotePath);
      if (srcHash !== remoteHash) {
        changed.push(relPath);
      }
    }
  }

  return changed;
}

// Group a flat list of changed files into logical chunks
export function chunkFiles(files: string[], strategy: ChunkBy): CommitChunk[] {
  if (files.length === 0) return [];

  switch (strategy) {
    case 'file':
      return files.map((f) => ({
        files: [f],
        label: f,
        message: inferMessage([f]),
      }));

    case 'filetype': {
      const groups = new Map<string, string[]>();
      for (const f of files) {
        const ext = path.extname(f) || 'misc';
        if (!groups.has(ext)) groups.set(ext, []);
        groups.get(ext)!.push(f);
      }
      return Array.from(groups.entries()).map(([ext, grpFiles]) => ({
        files: grpFiles,
        label: `*${ext} files`,
        message: inferMessage(grpFiles),
      }));
    }

    case 'directory':
    default: {
      const groups = new Map<string, string[]>();
      for (const f of files) {
        // Group by top-level directory, or '.' for root-level files
        const parts = f.split('/');
        const topDir = parts.length > 1 ? parts[0] : '.';
        if (!groups.has(topDir)) groups.set(topDir, []);
        groups.get(topDir)!.push(f);
      }
      return Array.from(groups.entries()).map(([dir, grpFiles]) => ({
        files: grpFiles,
        label: dir === '.' ? 'root' : dir,
        message: inferMessage(grpFiles, dir),
      }));
    }
  }
}

// Generate a sensible commit message from a group of files
function inferMessage(files: string[], groupLabel?: string): string {
  if (groupLabel && groupLabel !== '.') {
    const isNew = files.some((f) => f.startsWith(groupLabel));
    return isNew ? `Update ${groupLabel}` : `Update ${groupLabel}`;
  }

  if (files.length === 1) {
    const name = path.basename(files[0]);
    return `Update ${name}`;
  }

  // Mixed root-level files
  const hasConfig = files.some((f) => {
    const base = path.basename(f).toLowerCase();
    return ['package.json', 'tsconfig.json', '.gitignore', '.env', 'readme.md', 'makefile'].includes(base);
  });
  if (hasConfig) return 'Update project config';

  return `Update ${files.length} files`;
}
