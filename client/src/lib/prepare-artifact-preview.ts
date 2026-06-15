import { apiFetch } from "@/lib/api";
import type { ArtifactFile, ArtifactPayload } from "@/lib/artifact-types";

type PrepareArtifactResponse = {
  files: ArtifactFile[];
};

/** Ensures platform runtime/client files and page imports exist before preview render. */
export async function prepareArtifactPayloadForPreview(
  payload: ArtifactPayload,
): Promise<ArtifactPayload> {
  if (payload.files.length === 0) {
    return payload;
  }

  const runtime = payload.files.find((file) => file.path === "lib/radiant-agent-runtime.ts");
  const page = payload.files.find((file) => file.path === "app/page.tsx");
  const runtimeOk = runtime?.content.includes("notifyParentExecuteResult");
  const pageOk = !page || page.content.includes("radiant-agent-runtime");
  if (runtimeOk && pageOk) {
    return payload;
  }

  try {
    const data = await apiFetch<PrepareArtifactResponse>("/api/v1/platform/prepare-artifact-preview", {
      method: "POST",
      body: JSON.stringify({
        files: payload.files,
        template: payload.template,
      }),
    });
    if (!data?.files?.length) {
      return payload;
    }
    return { ...payload, files: data.files };
  } catch {
    return payload;
  }
}
