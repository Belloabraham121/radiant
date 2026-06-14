export type ProjectsHubTab = "yours" | "installed" | "explorer";

export type YourProjectsScope = "all" | "saved" | "deployed";

export const PROJECTS_HUB_TABS: {
  id: ProjectsHubTab;
  label: string;
  description: string;
}[] = [
  {
    id: "yours",
    label: "Your projects",
    description: "Apps you built and saved from chat.",
  },
  {
    id: "installed",
    label: "Installed",
    description: "Apps you installed from the community catalog.",
  },
  {
    id: "explorer",
    label: "Explorer",
    description: "Browse and install public apps from other creators.",
  },
];

export const YOUR_PROJECTS_SCOPES: { id: YourProjectsScope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "saved", label: "Saved" },
  { id: "deployed", label: "Deployed" },
];

export function parseProjectsHubTab(value: string | null | undefined): ProjectsHubTab {
  if (value === "installed" || value === "explorer") return value;
  return "yours";
}

export function parseYourProjectsScope(value: string | null | undefined): YourProjectsScope {
  if (value === "saved" || value === "deployed") return value;
  return "all";
}

export function parseProjectsPage(value: string | null | undefined): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function matchesSearch(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return text.toLowerCase().includes(q);
}
