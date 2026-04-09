# GEMMA-CLI

A remarkably fast, secure, and completely local terminal user interface for Google's Gemma models.

**Note: This is an unofficial implementation.**

GEMMA-CLI brings the raw computing power of Google's localized artificial intelligence directly to your terminal. Built natively with Node.js and TypeScript, it utilizes a deeply optimized `node-llama-cpp` backend designed to intelligently evaluate your local hardware and natively orchestrate the most effective Gemma quantization tier for your specific machine architecture—all without an active internet connection after the initial setup.

## Features

*   **100% Local Inference**: Your chat history, prompts, and context windows remain strictly on your physical device. Zero data is transmitted externally during inference, ensuring absolute privacy.
*   **Intelligent Hardware Auto-Detection**: The built-in diagnostics engine actively profiles your operating system, CPU, total RAM, and GPU architecture (`CUDA`, `Apple Metal`, or `CPU fallback`). It seamlessly delegates to the optimal compute layer and recommends the best model variant for your exact system capabilities.
*   **High-Performance TUI**: A fluid, React-based terminal user interface powered by Ink. Features precise real-time token streaming, active system status indicators, and keyboard-driven slash command menus.
*   **Seamless Model Management**: First-time users are guided through an integrated onboarding wizard to download the appropriate `.gguf` weights dynamically directly from the CLI.

## Installation

Ensure you have Node.js installed (v18 or higher is dynamically supported).

```bash
git clone https://github.com/0x-Professor/GEMMA-CLI.git
cd GEMMA-CLI
npm install
npm run build
```

To make the command available globally on your system, you can use `npm link`:

```bash
npm link
```

## Usage

### Start Chatting

Initialize the local inference engine and enter the interactive chat interface:

```bash
gemma chat
```
*If this is your first time running the CLI, it will automatically launch the setup wizard to assess your hardware and efficiently download the necessary compute weights.*

### Diagnostics and System Checks

To natively inspect your current hardware capabilities, memory constraints, and the model compatibility matrix based on your hardware profile:

```bash
gemma doctor
```

### Slash Commands

While inside the chat interface, type `/` to access built-in commands natively:
*   `/model` - Switch or download an alternative Gemma model size profile.
*   `/exit` - Safely unload the model from memory and terminate the active process.

## Underlying Ecosystem

*   [Ink](https://github.com/vadimdemedes/ink) - React architecture for interactive command-line applications.
*   [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) - High-performance local LLM runtime bindings.
*   [Google Gemma](https://blog.google/technology/developers/gemma-open-models/) - State-of-the-art open weights models.

## License

This project is open-source. Please see the LICENSE file for more information. Google and Gemma are trademarks of Google LLC.# GEMMA-CLI

A remarkably fast, secure, and completely local terminal user interface for Google's Gemma models.

**Note: This is an unofficial implementation.**

GEMMA-CLI brings the raw computing power of Google's localized artificial intelligence directly to your terminal. Built natively with Node.js and TypeScript, it utilizes a deeply optimized C++ backend designed to evaluate your local hardware and natively orchestrate the most effective Gemma quantization tier for your specific machine architecture—all without an active internet connection after the initial setup.

## Features

*   **100% Local Inference**: Your chat history, prompts, and context windows remain strictly on your physical device. Zero data is transmitted externally during inference.
*   **Intelligent Hardware Auto-Detection**: The built-in diagnostics engine actively profiles your operating system, CPU, total RAM, and GPU architecture (CUDA, Apple Metal, or CPU fallback). It seamlessly compiles optimal binaries and recommends the best model variant for your exact system capabilities.
*   **High-Performance TUI**: A fluid, React-based terminal user interface powered by Ink. Features precise real-time token streaming, active system status indicators, and keyboard-driven slash command menus.
*   **Seamless Model Management**: First-time users are guided through an integrated onboarding wizard to download the appropriate .gguf weights dynamically. 

## Installation

Ensure you have Node.js installed (v18 or higher is dynamically supported).

`ash
git clone https://github.com/0x-Professor/GEMMA-CLI.git
cd GEMMA-CLI
npm install
npm run build
`

To make the command available globally on your system:

`ash
npm link
`

## Usage

### Start Chatting

Initialize the local inference engine and enter the interactive chat interface:

`ash
gemma chat
`
*If this is your first time running the CLI, it will automatically launch the setup wizard to assess your hardware and efficiently download the necessary weights.*

### Diagnostics and System Checks

To inspect your current hardware capabilities, memory constraints, and the model compatibility matrix:

`ash
gemma doctor
`

### Slash Commands

While inside the chat interface, type / to access built-in commands natively:
*   /model - Switch or download an alternative Gemma model size.
*   /exit - Safely unload the model from memory and terminate the active process.

## Underlying Architecture

*   [Ink](https://github.com/vadimdemedes/ink) - React architecture for interactive command-line applications.
*   [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) - High-performance local LLM bindings.
*   [Google Gemma](https://blog.google/technology/developers/gemma-open-models/) - State-of-the-art open weights models.

## License

This project is open-source. Google and Gemma are trademarks of Google LLC.
