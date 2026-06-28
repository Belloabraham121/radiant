import type { Metadata } from "next";
import { CanvasWorkspace } from "@/components/canvas/CanvasWorkspace";

export const metadata: Metadata = {
  title: "Canvas",
};

export default function CanvasPage() {
  return <CanvasWorkspace />;
}
