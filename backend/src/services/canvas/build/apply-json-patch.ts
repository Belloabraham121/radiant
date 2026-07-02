import type { JsonPatchOperation } from "./canvas-build-progress.types.js";

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function parseJsonPointer(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) {
    throw new Error(`Invalid JSON Pointer: ${path}`);
  }
  return path
    .slice(1)
    .split("/")
    .map(decodeJsonPointerSegment);
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function getParent(
  root: unknown,
  segments: string[],
): { parent: Record<string, unknown> | unknown[]; key: string | number } {
  if (segments.length === 0) {
    throw new Error("Cannot resolve root parent");
  }
  let current: unknown = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i]!;
    if (Array.isArray(current)) {
      const index = Number(seg);
      if (!Number.isInteger(index)) {
        throw new Error(`Expected array index at ${seg}`);
      }
      current = current[index];
    } else if (current !== null && typeof current === "object") {
      current = (current as Record<string, unknown>)[seg];
    } else {
      throw new Error(`Path segment not found: ${seg}`);
    }
  }
  const last = segments[segments.length - 1]!;
  if (Array.isArray(current)) {
    const index = last === "-" ? current.length : Number(last);
    if (!Number.isInteger(index)) {
      throw new Error(`Expected array index at ${last}`);
    }
    return { parent: current, key: index };
  }
  if (current !== null && typeof current === "object") {
    return { parent: current as Record<string, unknown>, key: last };
  }
  throw new Error(`Path parent is not an object: ${segments.join("/")}`);
}

function readAtPointer(root: unknown, path: string): unknown {
  const segments = parseJsonPointer(path);
  let current: unknown = root;
  for (const seg of segments) {
    if (Array.isArray(current)) {
      current = current[Number(seg)];
    } else if (current !== null && typeof current === "object") {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

function applyOneOperation(target: unknown, op: JsonPatchOperation): void {
  switch (op.op) {
    case "add":
    case "replace": {
      const segments = parseJsonPointer(op.path);
      if (segments.length === 0) {
        throw new Error(`${op.op} on root is not supported`);
      }
      const { parent, key } = getParent(target, segments);
      if (Array.isArray(parent)) {
        if (key === parent.length) {
          parent.push(op.value);
        } else {
          if (op.op === "replace") {
            parent[key as number] = op.value;
          } else {
            parent.splice(key as number, 0, op.value);
          }
        }
      } else {
        parent[key as string] = op.value;
      }
      break;
    }
    case "remove": {
      const segments = parseJsonPointer(op.path);
      const { parent, key } = getParent(target, segments);
      if (Array.isArray(parent)) {
        parent.splice(key as number, 1);
      } else {
        delete parent[key as string];
      }
      break;
    }
    case "move":
    case "copy": {
      if (!op.from) throw new Error(`${op.op} requires from`);
      const value =
        op.op === "move"
          ? (() => {
              const existing = readAtPointer(target, op.from);
              applyOneOperation(target, { op: "remove", path: op.from });
              return existing;
            })()
          : readAtPointer(target, op.from);
      applyOneOperation(target, { op: "add", path: op.path, value });
      break;
    }
    case "test": {
      const existing = readAtPointer(target, op.path);
      if (JSON.stringify(existing) !== JSON.stringify(op.value)) {
        throw new Error(`Test operation failed at ${op.path}`);
      }
      break;
    }
    default:
      throw new Error(`Unsupported patch op: ${(op as JsonPatchOperation).op}`);
  }
}

/** Apply RFC 6902 JSON Patch operations to a cloned object. */
export function applyJsonPatch<T extends Record<string, unknown>>(
  document: T,
  operations: JsonPatchOperation[],
): T {
  const result = deepClone(document);
  for (const op of operations) {
    applyOneOperation(result, op);
  }
  return result;
}
