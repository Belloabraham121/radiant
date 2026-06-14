import { Sandbox } from "e2b";

export type KillRadiantSandboxesResult = {
  killed: string[];
  failed: Array<{ sandboxId: string; error: string }>;
};

/** Kill running E2B sandboxes tagged with metadata.app=radiant (orphan safety net). */
export async function killRadiantSandboxes(): Promise<KillRadiantSandboxesResult> {
  const killed: string[] = [];
  const failed: KillRadiantSandboxesResult["failed"] = [];

  const paginator = Sandbox.list({
    query: {
      metadata: { app: "radiant" },
      state: ["running"],
    },
  });

  while (paginator.hasNext) {
    const batch = await paginator.nextItems();
    for (const info of batch) {
      try {
        await Sandbox.kill(info.sandboxId);
        killed.push(info.sandboxId);
      } catch (error) {
        failed.push({
          sandboxId: info.sandboxId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { killed, failed };
}

/** Kill paused E2B sandboxes tagged metadata.app=radiant (deploy sandboxes should not pause). */
export async function killPausedRadiantSandboxes(): Promise<KillRadiantSandboxesResult> {
  const killed: string[] = [];
  const failed: KillRadiantSandboxesResult["failed"] = [];

  const paginator = Sandbox.list({
    query: {
      metadata: { app: "radiant" },
      state: ["paused"],
    },
  });

  while (paginator.hasNext) {
    const batch = await paginator.nextItems();
    for (const info of batch) {
      try {
        await Sandbox.kill(info.sandboxId);
        killed.push(info.sandboxId);
      } catch (error) {
        failed.push({
          sandboxId: info.sandboxId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { killed, failed };
}

export type E2bCleanupSweepResult = {
  running: KillRadiantSandboxesResult;
  paused: KillRadiantSandboxesResult;
};

/** Dev/staging cron sweep — running orphans + paused deploy sandboxes. */
export async function sweepRadiantSandboxes(): Promise<E2bCleanupSweepResult> {
  const running = await killRadiantSandboxes();
  const paused = await killPausedRadiantSandboxes();
  return { running, paused };
}

/** Optional deploy-worker boot hook — set DEPLOY_KILL_STALE_SANDBOXES_ON_BOOT=true */
export async function killStaleRadiantSandboxesOnBoot(): Promise<KillRadiantSandboxesResult | null> {
  if (process.env.DEPLOY_KILL_STALE_SANDBOXES_ON_BOOT !== "true") {
    return null;
  }
  return killRadiantSandboxes();
}
