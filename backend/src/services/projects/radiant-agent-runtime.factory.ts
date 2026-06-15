/** Testable core for lib/radiant-agent-runtime.ts (generated app template). */

export type RadiantAgentExecuteOptions = {
  animate?: boolean;
};

export type RadiantAgentContext = {
  animate: boolean;
  highlight: (targetId: string, className?: string) => void;
};

export type RadiantAgentHandler = (
  params: Record<string, unknown>,
  ctx: RadiantAgentContext,
) => void | Promise<void>;

export type RadiantAgentRuntimeEvent =
  | { type: "active"; active: boolean }
  | { type: "executing"; action: string; params: Record<string, unknown> }
  | { type: "result"; action: string; result: unknown };

export type RadiantAgentRuntime = {
  register: (action: string, handler: RadiantAgentHandler) => void;
  subscribe: (listener: (event: RadiantAgentRuntimeEvent) => void) => () => void;
  isActive: () => boolean;
  execute: (
    action: string,
    params?: Record<string, unknown>,
    opts?: RadiantAgentExecuteOptions,
  ) => Promise<unknown>;
};

export type RadiantAgentRuntimeDeps = {
  executeAction: (action: string, params: Record<string, unknown>) => Promise<unknown>;
  highlight?: (targetId: string, className?: string) => void;
  resolveApproval?: (
    action: string,
    result: { status: "approval_required"; pending: Record<string, unknown> },
  ) => Promise<unknown>;
};

function isApprovalRequired(
  result: unknown,
): result is { status: "approval_required"; pending: Record<string, unknown> } {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as { status?: string }).status === "approval_required"
  );
}

export function createRadiantAgentRuntime(deps: RadiantAgentRuntimeDeps): RadiantAgentRuntime {
  const handlers = new Map<string, RadiantAgentHandler>();
  const listeners = new Set<(event: RadiantAgentRuntimeEvent) => void>();
  let activeCount = 0;

  function emit(event: RadiantAgentRuntimeEvent) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Ignore subscriber errors — agent execution should continue.
      }
    }
  }

  function createContext(animate: boolean): RadiantAgentContext {
    return {
      animate,
      highlight: (targetId, className) => {
        deps.highlight?.(targetId, className);
      },
    };
  }

  return {
    register(action, handler) {
      handlers.set(action, handler);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isActive() {
      return activeCount > 0;
    },
    async execute(action, params = {}, opts = {}) {
      const animate = Boolean(opts.animate);
      if (animate) {
        activeCount += 1;
        emit({ type: "active", active: true });
      }
      emit({ type: "executing", action, params });

      try {
        if (animate) {
          const handler = handlers.get(action);
          if (handler) {
            await handler(params, createContext(true));
          }
        }

        let result = await deps.executeAction(action, params);
        if (isApprovalRequired(result) && deps.resolveApproval) {
          result = await deps.resolveApproval(action, result);
        }
        emit({ type: "result", action, result });
        return result;
      } finally {
        if (animate) {
          activeCount = Math.max(0, activeCount - 1);
          if (activeCount === 0) {
            emit({ type: "active", active: false });
          }
        }
      }
    },
  };
}
