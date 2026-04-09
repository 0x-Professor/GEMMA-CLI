#!/usr/env/bin node
import { Command } from 'commander';

const program = new Command();

program
  .name('gemma')
  .description('A local AI agent powered by Google Gemma — runs fully offline')
  .version('1.0.0');

program
  .command('chat')
  .description('Start the Gemma CLI chat agent')
  .action(async () => {
    throw new Error('not implemented');
  });

program
  .command('doctor')
  .description('Check system compatibility for Gemma models')
  .action(async () => {
    throw new Error('not implemented');
  });

program
  .command('resume')
  .description('Resume most recent chat session')
  .action(async () => {
    throw new Error('not implemented');
  });

program
  .command('session')
  .argument('<id>', 'Session ID prefix')
  .description('Load session by IDs')
  .action(async (id: string) => {
    throw new Error('not implemented');
  });

program.parseAsync().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
