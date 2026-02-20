import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { GitdropConfigSchema, GitdropConfig, ResolvedConfig } from '../types/config';
import { applyHHMM } from '../utils/timeUtils';

export function loadConfig(configPath: string): ResolvedConfig {
  const absolutePath = path.resolve(configPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  const raw = fs.readFileSync(absolutePath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = yaml.load(raw);
  } catch (e) {
    throw new Error(`Failed to parse YAML: ${(e as Error).message}`);
  }

  const result = GitdropConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Config validation failed:\n${issues}`);
  }

  const config: GitdropConfig = result.data as GitdropConfig;

  // Resolve the target date
  const resolvedDate = config.window.date
    ? new Date(`${config.window.date}T00:00:00`)
    : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  const windowStart = applyHHMM(resolvedDate, config.window.start);
  const windowEnd = applyHHMM(resolvedDate, config.window.end);

  if (windowEnd <= windowStart) {
    throw new Error(
      `window.end (${config.window.end}) must be after window.start (${config.window.start})`
    );
  }

  return {
    ...config,
    resolvedSourceDir: path.resolve(config.sourceDir),
    resolvedDate,
    windowStart,
    windowEnd,
  };
}
