type JsonPatchOp = {
  op: string;
  path: string;
  value?: unknown;
  from?: string;
};

function decodeSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function parsePointer(path: string): string[] {
  if (path === "") return [];
  return path.slice(1).split("/").map(decodeSegment);
}

function getParent(root: unknown, segments: string[]): { parent: Record<string, unknown>; key: string } {
  let current: unknown = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    current = (current as Record<string, unknown>)[segments[i]!];
  }
  return { parent: current as Record<string, unknown>, key: segments[segments.length - 1]! };
}

/** Minimal RFC6902 patch applier for client-side node config updates. */
export function applyJsonPatchClient<T extends Record<string, unknown>>(
  document: T,
  operations: Array<Record<string, unknown>>,
): T {
  const result = structuredClone(document);
  for (const raw of operations) {
    const op = raw as JsonPatchOp;
    if (op.op === "replace" || op.op === "add") {
      const segments = parsePointer(op.path);
      if (segments.length === 0) continue;
      const { parent, key } = getParent(result, segments);
      parent[key] = op.value;
    }
  }
  return result;
}
