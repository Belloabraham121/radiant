import type { Metadata } from "next";
import { CanvasFeatureGuard } from "@/components/app/CanvasFeatureGuard";
import { CanvasWorkspace } from "@/components/canvas/CanvasWorkspace";

export const metadata: Metadata = {
  title: "Canvas",
};

export default function CanvasPage() {
  return (
    <CanvasFeatureGuard>
      <CanvasWorkspace />
    </CanvasFeatureGuard>
  );
}
