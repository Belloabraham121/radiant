import type { PortKind } from "./canvas-graph.types.js";

/**
 * Port compatibility matrix for edge validation.
 *
 * Rules (output port on source → allowed input ports on target):
 * - `trigger` → `trigger` only — control-flow handoff between steps.
 * - `signal` → `signal` | `trigger` — boolean/threshold events may gate or branch.
 * - `market` → `market` | `data` — venue context can feed generic data inputs.
 * - `order_intent` → `order_intent` only — sized trade intents stay typed end-to-end.
 * - `data` → `data` | `signal` — structured payloads may drive logic or display.
 */
const OUTPUT_TO_INPUT_COMPAT: Record<PortKind, readonly PortKind[]> = {
  trigger: ["trigger"],
  signal: ["signal", "trigger"],
  market: ["market", "data"],
  order_intent: ["order_intent"],
  data: ["data", "signal"],
};

export function getCompatibleInputPorts(outputPort: PortKind): readonly PortKind[] {
  return OUTPUT_TO_INPUT_COMPAT[outputPort];
}

export function arePortsCompatible(
  sourcePort: PortKind,
  targetPort: PortKind,
): boolean {
  return OUTPUT_TO_INPUT_COMPAT[sourcePort].includes(targetPort);
}

/** Human-readable add_edge rejection with allowed target ports. */
export function formatIncompatiblePortsMessage(
  sourcePort: PortKind,
  targetPort: PortKind,
  targetNodeInputPorts?: readonly PortKind[],
): string {
  const allowed = getCompatibleInputPorts(sourcePort);
  let message = `Cannot connect ${sourcePort} → ${targetPort}. Source port ${sourcePort} may only connect to: ${allowed.join(" | ")}.`;

  if (targetNodeInputPorts && targetNodeInputPorts.length > 0) {
    const validOnTarget = targetNodeInputPorts.filter((port) => allowed.includes(port));
    if (validOnTarget.length > 0) {
      message += ` On this target node, use target_port: ${validOnTarget.join(" | ")}.`;
    }
  }

  if (sourcePort === "data" && targetPort === "trigger") {
    message +=
      " For workflow-stop after an action node, use action.data → workflow-stop.signal instead.";
  }

  return message;
}
