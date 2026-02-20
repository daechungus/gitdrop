import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

const TEMPLATE = `# gitdrop configuration
# Run 'gitdrop preview' to review the auto-generated schedule, then 'gitdrop run' to start.

# GitHub repository URL (embed a PAT for auth: https://<TOKEN>@github.com/user/repo.git)
remote: "https://github.com/your-username/your-repo.git"

# Path to your local project (the source of truth)
sourceDir: "./my-project"

# Time window — commits will be spread across this range today
window:
  start: "09:00"
  end:   "17:00"
  # date: "2026-02-19"  # optional; defaults to today

# How to group files into commits:
#   directory — one commit per top-level folder (recommended)
#   file       — one commit per changed file
#   filetype   — one commit per file extension
chunkBy: "directory"

# Optional: override the git author shown on commits
# author:
#   name: "Your Name"
#   email: "you@example.com"

# Push strategy:
#   after-each — push immediately after every commit (recommended — most realistic)
#   batch-end  — push everything at once after the final commit
pushStrategy: "after-each"
`;

export function initCommand(outputPath = 'gitdrop.yaml'): void {
  const absolutePath = path.resolve(outputPath);

  if (fs.existsSync(absolutePath)) {
    console.log(chalk.yellow(`Already exists: ${absolutePath}`));
    console.log(chalk.gray('Delete it first or specify a different output path.'));
    process.exit(1);
  }

  fs.writeFileSync(absolutePath, TEMPLATE, 'utf-8');
  console.log(chalk.green(`Created: ${absolutePath}`));
  console.log('');
  console.log(chalk.gray('Next steps:'));
  console.log(chalk.cyan('  1. Edit gitdrop.yaml — set remote, sourceDir, and window'));
  console.log(chalk.cyan('  2. gitdrop preview   — review the auto-computed schedule'));
  console.log(chalk.cyan('  3. gitdrop run       — start the background commit daemon'));
}
