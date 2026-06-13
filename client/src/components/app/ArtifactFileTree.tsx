"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileCode, Folder, FolderOpen } from "lucide-react";
import type { ArtifactFile } from "@/lib/artifact-types";
import {
  buildArtifactFileTree,
  collectFolderPaths,
  parentFolderPaths,
  type ArtifactTreeNode,
} from "@/lib/artifact-file-tree";

function TreeNodeRow({
  node,
  depth,
  activePath,
  expanded,
  onToggleFolder,
  onSelectFile,
}: {
  node: ArtifactTreeNode;
  depth: number;
  activePath: string;
  expanded: Set<string>;
  onToggleFolder: (folderPath: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const pad = depth * 12 + 8;

  if (node.type === "file") {
    const active = node.path === activePath;
    return (
      <li>
        <button
          type="button"
          onClick={() => onSelectFile(node.path)}
          className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-xs font-bold transition-colors ${
            active
              ? "bg-[var(--hero-violet)]/15 text-[var(--hero-violet)]"
              : "text-[var(--hero-ink)]/70 hover:bg-[var(--hero-ink)]/5"
          }`}
          style={{ paddingLeft: pad }}
        >
          <FileCode className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate font-mono">{node.name}</span>
        </button>
      </li>
    );
  }

  const isOpen = expanded.has(node.path);
  return (
    <li>
      <button
        type="button"
        onClick={() => onToggleFolder(node.path)}
        className="flex w-full items-center gap-1 rounded-lg py-1.5 pr-2 text-left text-xs font-bold text-[var(--hero-ink)]/75 transition-colors hover:bg-[var(--hero-ink)]/5"
        style={{ paddingLeft: pad }}
        aria-expanded={isOpen}
      >
        <ChevronRight
          className={`size-3.5 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
          strokeWidth={2.5}
        />
        {isOpen ? (
          <FolderOpen className="size-3.5 shrink-0 text-[var(--hero-amber)]" strokeWidth={2.5} />
        ) : (
          <Folder className="size-3.5 shrink-0 text-[var(--hero-amber)]" strokeWidth={2.5} />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isOpen ? (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.type === "file" ? child.path : child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              expanded={expanded}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ArtifactFileTree({
  files,
  activePath,
  onSelect,
}: {
  files: ArtifactFile[];
  activePath: string;
  onSelect: (path: string) => void;
}) {
  const tree = useMemo(() => buildArtifactFileTree(files), [files]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpanded(new Set(collectFolderPaths(tree)));
  }, [tree]);

  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current);
      for (const folder of parentFolderPaths(activePath)) {
        next.add(folder);
      }
      return next;
    });
  }, [activePath]);

  const toggleFolder = (folderPath: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  if (tree.length === 0) {
    return (
      <p className="p-3 text-xs font-semibold text-[var(--hero-ink)]/45">No files yet.</p>
    );
  }

  return (
    <ul className="space-y-0.5 p-2">
      {tree.map((node) => (
        <TreeNodeRow
          key={node.type === "file" ? node.path : node.path}
          node={node}
          depth={0}
          activePath={activePath}
          expanded={expanded}
          onToggleFolder={toggleFolder}
          onSelectFile={onSelect}
        />
      ))}
    </ul>
  );
}
