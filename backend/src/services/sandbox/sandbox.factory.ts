import { getSandboxConfig } from "../../config/sandbox.js";
import { E2bSandboxProvider } from "./e2b.provider.js";
import { MockSandboxProvider } from "./mock.provider.js";
import { NoneSandboxProvider } from "./none.provider.js";
import type { SandboxProvider } from "./sandbox.provider.js";

let cached: SandboxProvider | undefined;

export function getSandboxProvider(): SandboxProvider {
  if (cached) return cached;

  const { provider } = getSandboxConfig();

  switch (provider) {
    case "e2b":
      cached = new E2bSandboxProvider();
      break;
    case "mock":
      cached = new MockSandboxProvider();
      break;
    case "docker":
      // Docker worker lands in Phase 6 — fall back to mock semantics until then.
      cached = new MockSandboxProvider();
      break;
    default:
      cached = new NoneSandboxProvider();
  }

  return cached;
}

export function resetSandboxProviderForTests(): void {
  cached = undefined;
}
