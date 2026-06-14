export function writeSseEvent(
  res: { write: (chunk: string) => boolean; flush?: () => void },
  event: string,
  data: unknown,
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.flush?.();
}

export function writeSseComment(
  res: { write: (chunk: string) => boolean; flush?: () => void },
  comment: string,
): void {
  res.write(`: ${comment}\n\n`);
  res.flush?.();
}
