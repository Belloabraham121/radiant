"use client";

import { useEffect, useRef } from "react";
import { ArtifactPreview } from "@/components/app/ArtifactPreview";
import type { ArtifactFile } from "@/lib/artifact-types";
import { isAppActionApiPath } from "@/lib/artifact-preview-bridge";
import { parseAppActionResultFromBody } from "@/lib/app-actions-api";
import { usePreviewAgentEventRelay } from "@/hooks/usePreviewAgentEventRelay";
import { useActivePreviewSessionRegistration } from "@/lib/active-preview-session";
import {
  handlePreviewApprovalResolvedMessage,
  registerPreviewApprovalRelay,
} from "@/lib/preview-approval-relay";

export function ArtifactPreviewWithApproval({
  files,
  revision,
  streaming = false,
  projectId,
  installationId,
  sessionId,
}: {
  files: ArtifactFile[];
  revision: number;
  streaming?: boolean;
  projectId?: string;
  installationId?: string;
  sessionId?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewEnabled = Boolean(projectId || installationId || sessionId);
  const { forward } = usePreviewAgentEventRelay(iframeRef, sessionId, previewEnabled);

  useActivePreviewSessionRegistration(
    projectId || installationId || sessionId
      ? { sessionId, projectId, installationId }
      : null,
  );

  useEffect(() => {
    function syncRelay() {
      registerPreviewApprovalRelay(iframeRef.current, sessionId);
    }
    syncRelay();
    const timer = window.setInterval(syncRelay, 200);
    return () => {
      window.clearInterval(timer);
      registerPreviewApprovalRelay(null);
    };
  }, [sessionId, revision, streaming]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      handlePreviewApprovalResolvedMessage(event.data);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <ArtifactPreview
          iframeRef={iframeRef}
          files={files}
          revision={revision}
          streaming={streaming}
          projectId={projectId}
          installationId={installationId}
          sessionId={sessionId}
          onProxiedApiResponse={(_status, body, path) => {
            if (!isAppActionApiPath(path)) return;
            const result = parseAppActionResultFromBody(body);
            if (result?.status === "approval_required") {
              forward({ active: false });
              return;
            }
            if (result?.status === "executed") {
              forward({
                action: result.action,
                step: "result",
                digest: result.digest,
                refresh: true,
              });
            }
          }}
        />
      </div>
    </div>
  );
}
