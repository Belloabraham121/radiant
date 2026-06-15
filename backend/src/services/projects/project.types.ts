import { z } from "zod";

export const artifactFileInputSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export const generateAppInputSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  save_to_project: z.boolean().optional(),
  name: z.string().min(1).max(120),
  tagline: z.string().max(280).optional(),
  template: z.enum(["custom", "escrow", "swap", "prediction"]).default("custom"),
  files: z.array(artifactFileInputSchema).min(1),
});

export type GenerateAppInput = z.infer<typeof generateAppInputSchema>;

export type AppTemplate = GenerateAppInput["template"];

const APP_TEMPLATES: readonly AppTemplate[] = ["custom", "escrow", "swap", "prediction"];

/** Coerce DB / draft template strings into the generate_app enum. */
export function coerceAppTemplate(value: string): AppTemplate {
  return (APP_TEMPLATES as readonly string[]).includes(value)
    ? (value as AppTemplate)
    : "custom";
}

export type ArtifactPayload = {
  project_id: string;
  name: string;
  tagline: string;
  template: string;
  revision: number;
  files: Array<{ path: string; content: string }>;
  draft_id?: string;
};

export type GenerateAppResult = {
  project_id: string;
  name: string;
  tagline: string;
  template: string;
  revision: number;
  files: Array<{ path: string; content: string }>;
  artifact: ArtifactPayload;
  saved_to_project: boolean;
  draft_id?: string;
};
