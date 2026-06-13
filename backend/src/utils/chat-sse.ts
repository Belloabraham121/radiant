export function writeSseEvent(
  res: { write: (chunk: string) => boolean; flush?: () => void },
  event: string,
  data: unknown,
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.flush?.();
}
