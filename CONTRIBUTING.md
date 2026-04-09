# Contributing to GEMMA-CLI

First, thank you for considering contributing to GEMMA-CLI. We value community input to make this the fastest and most efficient local inference terminal application.

## Development Setup

1. Fork and clone the repository.
2. Install the required dependencies:
   ```bash
   npm install
   ```
3. Run the TypeScript build step to ensure there are no initial compilation errors:
   ```bash
   npm run build
   ```
4. Verify the test suite passes successfully:
   ```bash
   npx vitest run
   ```

## Architecture Overview

*   **`src/tui/`**: Contains the Ink/React components mapping the visual interface (ChatView, OnboardingView, Menus, etc.).
*   **`src/core/`**: Houses the `GemmaEngine` class responsible for lifecycle hooks, context building, and delegating tokens from `node-llama-cpp`.
*   **`src/system/`**: Manages hardware diagnostics, CUDA and Metal compilation validation, and file-system verifications.

## Pull Request Guidelines

1. **Create a Feature Branch**: Always branch off from `main` to ensure a clean commit history.
2. **Type Safety**: GEMMA-CLI is written in strict TypeScript. Ensure all new features are strongly typed and `npm run typecheck` resolves cleanly.
3. **No External Telemetry**: Do not introduce analytics, telemetry, or external network calls outside of explicit, user-initiated model downloads. The application purpose is extreme privacy.
4. **Professional UI Standards**: If modifying the Ink TUI, avoid standard ASCII art that breaks in traditional terminal emulators. Use conservative styling, clear contrasts, and static component rendering where available to prevent terminal layout ghosting.

## Reporting Issues

If you discover a bug, segmentation fault, or an advanced hardware detection error, please open a detailed issue including:
*   Your Operating System and architecture version.
*   Output from running the `gemma doctor` command.
*   Steps to properly reproduce the crash.

Your contributions help make advanced local AI accessible to everyone. Thank you.
