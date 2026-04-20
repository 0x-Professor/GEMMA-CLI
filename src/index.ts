import React from 'react';
import { render } from 'ink';
import { App } from './tui/App.js';
import { runDoctor } from './system/requirements.js';
import { loadLocalEnvFiles } from './utils/env.js';

loadLocalEnvFiles();

export class GemmaApp {
  async chat(): Promise<void> {
    const { waitUntilExit } = render(React.createElement(App));
    await waitUntilExit();
  }

  async doctor(): Promise<void> {
    const out = await runDoctor();
    console.log(out);
  }

  async resume(): Promise<void> {
    // Session manager logic goes here, for now hand off to chat
    await this.chat();
  }

  async session(id: string): Promise<void> {
    // Session loader logic goes here
    await this.chat();
  }
}
