import { getSandboxConfig } from "../../config/sandbox.js";
import { E2bSandboxProvider } from "./e2b.provider.js";
import { MockSandboxProvider } from "./mock.provider.js";
import { NoneSandboxProvider } from "./none.provider.js";
import type { SandboxProvider, SandboxProviderName } from "./sandbox.provider.js";

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

/** Resolve a provider by stored job provider name (not global SANDBOX_PROVIDER). */
export function getSandboxProviderByName(name: SandboxProviderName): SandboxProvider {
  switch (name) {
    case "e2b":
      return new E2bSandboxProvider();
    case "mock":
      return new MockSandboxProvider();
    case "docker":
      return new MockSandboxProvider();
    default:
      return new NoneSandboxProvider();
  }
}
