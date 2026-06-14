"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ProjectsHub } from "@/components/projects/ProjectsHub";

function ProjectsHubFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm font-semibold text-[var(--hero-ink)]/45">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Loading projects…
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ProjectsHubFallback />}>
      <ProjectsHub />
    </Suspense>
  );
}
