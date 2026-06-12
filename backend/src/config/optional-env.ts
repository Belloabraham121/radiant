/** Read env with fallback — does not throw when unset. */
export function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}
