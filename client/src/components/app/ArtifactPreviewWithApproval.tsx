"use client";

import { useRef } from "react";
import { ArtifactPreview } from "@/components/app/ArtifactPreview";
import { TransactionApprovalBar } from "@/components/app/TransactionApprovalBar";
import type { ArtifactFile } from "@/lib/artifact-types";
import { parseAppActionResultFromBody } from "@/lib/app-actions-api";
import { useAgentTransactionApproval } from "@/hooks/useAgentTransactionApproval";
import { usePreviewAgentEventRelay } from "@/hooks/usePreviewAgentEventRelay";
import { useActivePreviewSessionRegistration } from "@/lib/active-preview-session";

export function ArtifactPreviewWithApproval({
  files,
  revision,
  projectId,
  installationId,
  sessionId,
}: {
  files: ArtifactFile[];
  revision: number;
  projectId?: string;
  installationId?: string;
  sessionId?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewEnabled = Boolean(projectId || installationId);
  const { forward } = usePreviewAgentEventRelay(iframeRef, sessionId, previewEnabled);
  const pendingActionRef = useRef<string | undefined>(undefined);

  const approval = useAgentTransactionApproval({
    onExecuted: (result) => {
      forward({
        action: pendingActionRef.current,
        step: "result",
        digest: result.digest,
        refresh: true,
      });
    },
    onRejected: () => {
      forward({ active: false });
    },
  });

  pendingActionRef.current = approval.pending?.action;

  useActivePreviewSessionRegistration(
    projectId || installationId
      ? { sessionId, projectId, installationId }
      : null,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {approval.pending ? (
        <div className="shrink-0 space-y-2 border-b-2 border-[var(--hero-ink)]/10 bg-white p-3">
          <TransactionApprovalBar
            pending={approval.pending}
            busy={approval.approving || approval.rejecting}
            onApprove={() => void approval.approve()}
            onCancel={() => void approval.reject()}
          />
          {approval.error ? (
            <p role="alert" className="text-center text-xs font-semibold text-[var(--hero-coral)]">
              {approval.error}
            </p>
          ) : null}
        </div>
      ) : null}

      {!approval.pending && approval.successMessage ? (
        <p className="shrink-0 border-b border-[var(--hero-mint)]/30 bg-[var(--hero-mint)]/10 px-4 py-2 text-center text-xs font-semibold text-[var(--hero-ink)]">
          {approval.successMessage}
        </p>
      ) : null}

      <div className="min-h-0 flex-1">
        <ArtifactPreview
          iframeRef={iframeRef}
          files={files}
          revision={revision}
          projectId={projectId}
          installationId={installationId}
          sessionId={sessionId}
          onProxiedApiResponse={(_status, body) => {
            const result = parseAppActionResultFromBody(body);
            if (result?.status === "approval_required") {
              pendingActionRef.current = result.action ?? result.pending.action;
              forward({ active: true, action: pendingActionRef.current });
            }
            approval.handleActionResult(result);
          }}
        />
      </div>
    </div>
  );
}
