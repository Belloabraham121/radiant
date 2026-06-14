"use client";

import { ArtifactPreview } from "@/components/app/ArtifactPreview";
import { TransactionApprovalBar } from "@/components/app/TransactionApprovalBar";
import type { ArtifactFile } from "@/lib/artifact-types";
import { parseAppActionResultFromBody } from "@/lib/app-actions-api";
import { useAgentTransactionApproval } from "@/hooks/useAgentTransactionApproval";

export function ArtifactPreviewWithApproval({
  files,
  revision,
  projectId,
  installationId,
}: {
  files: ArtifactFile[];
  revision: number;
  projectId?: string;
  installationId?: string;
}) {
  const approval = useAgentTransactionApproval();

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
          files={files}
          revision={revision}
          projectId={projectId}
          installationId={installationId}
          onProxiedApiResponse={(_status, body) => {
            approval.handleActionResult(parseAppActionResultFromBody(body));
          }}
        />
      </div>
    </div>
  );
}
