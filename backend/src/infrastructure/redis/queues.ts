/** Deploy queue removed with artifact/app-builder pipeline. */

export function getDeployQueue(): null {
  return null;
}

export async function enqueueDeployJob(_jobId: string): Promise<void> {
  throw new Error("Deploy pipeline has been removed");
}

export function startDeployWorker(): null {
  return null;
}
