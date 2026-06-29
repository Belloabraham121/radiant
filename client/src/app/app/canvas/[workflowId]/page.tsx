import type { Metadata } from "next";
import { CanvasFeatureGuard } from "@/components/app/CanvasFeatureGuard";
import { CanvasWorkspace } from "@/components/canvas/CanvasWorkspace";
import { ActiveCanvasWorkflowProvider } from "@/components/canvas/canvas-workflow-context";

export const metadata: Metadata = {
  title: "Canvas",
};

type Props = {
  params: Promise<{ workflowId: string }>;
};

export default async function CanvasWorkflowPage({ params }: Props) {
  const { workflowId } = await params;

  return (
    <CanvasFeatureGuard>
      <ActiveCanvasWorkflowProvider workflowId={workflowId}>
        <CanvasWorkspace />
      </ActiveCanvasWorkflowProvider>
    </CanvasFeatureGuard>
  );
}
