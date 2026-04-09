export function parseCommand(str: string) {
    const trimmed = str.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/\s+/);
    return { name: parts[0], args: parts.slice(1) };
}