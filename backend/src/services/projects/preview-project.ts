/** Sentinel project_id for chat-only artifacts not yet saved to Projects. */
export const PREVIEW_PROJECT_ID = "preview" as const;

export function isPreviewProjectId(projectId: string): boolean {
  return projectId === PREVIEW_PROJECT_ID;
}
