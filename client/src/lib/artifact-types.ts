export type ArtifactFile = {
  path: string;
  content: string;
};

export type ArtifactPayload = {
  project_id: string;
  name: string;
  tagline: string;
  template: string;
  revision: number;
  files: ArtifactFile[];
};
