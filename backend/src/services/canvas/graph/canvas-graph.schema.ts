import { z } from "zod";
import { canvasAgentLlmConfigSchema } from "../llm/canvas-llm.schema.js";
import {
  CANVAS_GRAPH_SCHEMA_VERSION,
  CANVAS_NODE_TYPES,
  CANVAS_WORKFLOW_STATUSES,
  PORT_KINDS,
} from "./canvas-graph.types.js";

export const portKindSchema = z.enum(PORT_KINDS);

export const canvasNodeTypeSchema = z.enum(CANVAS_NODE_TYPES);

export const canvasViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
});

export const canvasNodeSchema = z.object({
  id: z.string().uuid(),
  type: canvasNodeTypeSchema,
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  size: z
    .object({
      w: z.number().positive(),
      h: z.number().positive(),
    })
    .optional(),
  config: z.record(z.unknown()),
  preview_state: z.enum(["idle", "loading", "ready", "error"]).optional(),
  meta: z
    .object({
      label: z.string().optional(),
      builder_note: z.string().optional(),
    })
    .optional(),
});

export const canvasEdgeEndpointSchema = z.object({
  node_id: z.string().uuid(),
  port: portKindSchema,
});

export const canvasEdgeSchema = z.object({
  id: z.string().uuid(),
  source: canvasEdgeEndpointSchema,
  target: canvasEdgeEndpointSchema,
});

export const canvasGraphSchema = z.object({
  nodes: z.array(canvasNodeSchema),
  edges: z.array(canvasEdgeSchema),
  viewport: canvasViewportSchema.optional(),
});

export const canvasWorkflowDocumentSchema = z.object({
  schema_version: z.literal(CANVAS_GRAPH_SCHEMA_VERSION),
  workflow_id: z.string().uuid(),
  user_id: z.string().min(1),
  name: z.string().min(1).max(256),
  status: z.enum(CANVAS_WORKFLOW_STATUSES),
  revision: z.number().int().nonnegative(),
  nodes: z.array(canvasNodeSchema),
  edges: z.array(canvasEdgeSchema),
  viewport: canvasViewportSchema.optional(),
  policy_id: z.string().uuid(),
  build_config: canvasAgentLlmConfigSchema.optional(),
  tester_config: canvasAgentLlmConfigSchema.optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const canvasBuildConfigSchema = canvasAgentLlmConfigSchema;
export const canvasTesterConfigSchema = canvasAgentLlmConfigSchema;
