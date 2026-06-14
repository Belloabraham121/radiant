import { redirect } from "next/navigation";

export default async function InstalledAppsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const params = new URLSearchParams({ tab: "installed" });
  if (q?.trim()) params.set("q", q.trim());
  redirect(`/app/projects?${params.toString()}`);
}
