import type { ArtifactFile } from "@/lib/artifact-types";

export type ArtifactTreeFolder = {
  type: "folder";
  name: string;
  /** Path prefix for expand/collapse identity (e.g. "src") */
  path: string;
  children: ArtifactTreeNode[];
};

export type ArtifactTreeFile = {
  type: "file";
  name: string;
  path: string;
};

export type ArtifactTreeNode = ArtifactTreeFolder | ArtifactTreeFile;

function insertPath(root: ArtifactTreeFolder, parts: string[], fullPath: string): void {
  if (parts.length === 0) return;

  const [head, ...rest] = parts;
  if (rest.length === 0) {
    root.children.push({ type: "file", name: head, path: fullPath });
    return;
  }

  const folderPath = root.path ? `${root.path}/${head}` : head;
  let folder = root.children.find(
    (child): child is ArtifactTreeFolder =>
      child.type === "folder" && child.path === folderPath,
  );

  if (!folder) {
    folder = { type: "folder", name: head, path: folderPath, children: [] };
    root.children.push(folder);
  }

  insertPath(folder, rest, fullPath);
}

function sortTree(node: ArtifactTreeFolder): void {
  node.children.sort((a, b) => {
    if (a.type === "folder" && b.type === "file") return -1;
    if (a.type === "file" && b.type === "folder") return 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    if (child.type === "folder") sortTree(child);
  }
}

/** Build a nested folder tree from flat artifact paths (e.g. src/App.tsx). */
export function buildArtifactFileTree(files: ArtifactFile[]): ArtifactTreeNode[] {
  const root: ArtifactTreeFolder = { type: "folder", name: "", path: "", children: [] };

  for (const file of files) {
    const normalized = file.path.replace(/^\/+/, "").replace(/^\/workspace\//, "");
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    insertPath(root, parts, file.path);
  }

  sortTree(root);
  return root.children;
}

/** Folder paths that enclose `filePath` (for auto-expand). */
export function parentFolderPaths(filePath: string): string[] {
  const normalized = filePath.replace(/^\/+/, "").replace(/^\/workspace\//, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return [];

  const folders: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    folders.push(parts.slice(0, i).join("/"));
  }
  return folders;
}

/** All folder paths in the tree (for default expand-all). */
export function collectFolderPaths(nodes: ArtifactTreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      paths.push(node.path);
      paths.push(...collectFolderPaths(node.children));
    }
  }
  return paths;
}
