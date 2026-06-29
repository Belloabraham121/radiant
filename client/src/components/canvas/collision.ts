import type { Node } from "@xyflow/react";

export type CollisionAlgorithmOptions = {
  maxIterations: number;
  overlapThreshold: number;
  margin: number;
};

type Box<T extends Node> = {
  x: number;
  y: number;
  width: number;
  height: number;
  moved: boolean;
  node: T;
};

function getBoxesFromNodes<T extends Node>(nodes: T[], margin = 0): Box<T>[] {
  const boxes: Box<T>[] = new Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    boxes[i] = {
      x: node.position.x - margin,
      y: node.position.y - margin,
      width: (node.width ?? node.measured?.width ?? 0) + margin * 2,
      height: (node.height ?? node.measured?.height ?? 0) + margin * 2,
      node,
      moved: false,
    };
  }

  return boxes;
}

/**
 * Push apart any overlapping nodes so cards never stack on top of each other.
 * Separating-axis resolution along the smallest overlap, iterated to settle.
 * Generic so it returns the same node type it was given.
 */
export function resolveCollisions<T extends Node>(
  nodes: T[],
  { maxIterations = 50, overlapThreshold = 0.5, margin = 0 }: CollisionAlgorithmOptions,
): T[] {
  const boxes = getBoxesFromNodes(nodes, margin);

  for (let iter = 0; iter <= maxIterations; iter++) {
    let moved = false;

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i];
        const B = boxes[j];

        const centerAX = A.x + A.width * 0.5;
        const centerAY = A.y + A.height * 0.5;
        const centerBX = B.x + B.width * 0.5;
        const centerBY = B.y + B.height * 0.5;

        const dx = centerAX - centerBX;
        const dy = centerAY - centerBY;

        const px = (A.width + B.width) * 0.5 - Math.abs(dx);
        const py = (A.height + B.height) * 0.5 - Math.abs(dy);

        if (px > overlapThreshold && py > overlapThreshold) {
          A.moved = B.moved = moved = true;
          if (px < py) {
            const sx = dx > 0 ? 1 : -1;
            const moveAmount = (px / 2) * sx;
            A.x += moveAmount;
            B.x -= moveAmount;
          } else {
            const sy = dy > 0 ? 1 : -1;
            const moveAmount = (py / 2) * sy;
            A.y += moveAmount;
            B.y -= moveAmount;
          }
        }
      }
    }

    if (!moved) {
      break;
    }
  }

  return boxes.map((box) => {
    if (box.moved) {
      return {
        ...box.node,
        position: { x: box.x + margin, y: box.y + margin },
      };
    }
    return box.node;
  });
}
