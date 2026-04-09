import { marked } from 'marked';
import markedTerminal from 'marked-terminal';
import chalk from 'chalk';
import highlight from 'cli-highlight';

marked.setOptions({
  // @ts-expect-error type mismatches for marked terminal configs
  renderer: new markedTerminal({
    code: chalk.yellow,
    blockquote: chalk.gray.italic,
    html: chalk.gray,
    heading: chalk.green.bold,
    firstHeading: chalk.magenta.underline.bold,
    hr: chalk.reset,
    listitem: chalk.reset,
    table: chalk.reset,
    paragraph: chalk.reset,
    strong: chalk.bold,
    em: chalk.italic,
    codespan: chalk.yellow,
    del: chalk.dim.gray.strikethrough,
    link: chalk.blue,
    href: chalk.blue.underline,
  }),
});

export function formatMarkdown(text: string): string {
  try {
    return marked(text) as string;
  } catch {
    return text;
  }
}

export function highlightTokens(code: string, language?: string): string {
  if (language && highlight.supportsLanguage(language)) {
    return highlight.highlight(code, { language });
  }
  return highlight.highlightAuto(code);
}
