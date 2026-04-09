#!/usr/bin/env node
import { Command } from 'commander';
import { GemmaApp } from '../src/index.js';

const program = new Command();
const app = new GemmaApp();

program
  .name('gemma')
  .description('A local AI agent powered by Google Gemma — runs fully offline')
  .version('1.0.0');

program
  .command('chat')
  .description('Start the Gemma CLI chat agent')
  .action(async () => {
    await app.chat();
  });

program
  .command('doctor')
  .description('Check system compatibility for Gemma models')
  .action(async () => {
    await app.doctor();
  });

program
  .command('resume')
  .description('Resume most recent chat session')
  .action(async () => {
    await app.resume();
  });

program
  .command('session')
  .argument('<id>', 'Session ID prefix')
  .description('Load session by IDs')
  .action(async (id: string) => {
    await app.session(id);
  });

program.parseAsync().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
