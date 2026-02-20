#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { previewCommand } from './commands/preview';
import { runCommand } from './commands/run';
import { statusCommand } from './commands/status';

const program = new Command();

program
  .name('gitdrop')
  .description(
    'Automatically spread local code changes across a realistic GitHub commit schedule.\n' +
    'A background daemon fires real git pushes at the scheduled times — no fake timestamps.'
  )
  .version('1.0.0');

program
  .command('init')
  .description('Generate a sample gitdrop.yaml config file')
  .argument('[output]', 'Output file path', 'gitdrop.yaml')
  .action((output: string) => {
    initCommand(output);
  });

program
  .command('preview')
  .description('Preview the auto-computed commit schedule without executing anything')
  .argument('[config]', 'Path to config file', 'gitdrop.yaml')
  .action(async (config: string) => {
    await previewCommand(config);
  });

program
  .command('run')
  .description(
    'Detect changes, build the schedule, and start a background daemon that fires commits in real time'
  )
  .argument('[config]', 'Path to config file', 'gitdrop.yaml')
  .action(async (config: string) => {
    await runCommand(config);
  });

program
  .command('status')
  .description('Show the status of a running or completed commit schedule')
  .argument('[id]', 'Schedule ID (shown after gitdrop run; omit to show all)')
  .action((id?: string) => {
    statusCommand(id);
  });

program.parse(process.argv);
