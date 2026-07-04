import { z } from "zod";

export const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool", "unknown"]),
  text: z.string(),
  timestamp: z.string().optional()
});

export const redactionSchema = z.object({
  kind: z.string(),
  count: z.number().int().nonnegative()
});

export const sourceKindSchema = z.enum(["codex", "claude-code", "file", "stdin"]);

export const portableContextSchema = z.object({
  id: z.string(),
  source: sourceKindSchema,
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  workspace: z.string().optional(),
  goal: z.string().optional(),
  summary: z.string(),
  messages: z.array(messageSchema),
  filesMentioned: z.array(z.string()),
  commands: z.array(z.string()),
  decisions: z.array(z.string()),
  openTasks: z.array(z.string()),
  redactions: z.array(redactionSchema),
  rawRefs: z.array(z.string()),
  sourceRef: z
    .object({
      kind: sourceKindSchema,
      path: z.string().optional(),
      sessionId: z.string().optional()
    })
    .optional()
});

export const indexEntrySchema = z.object({
  id: z.string(),
  source: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  summary: z.string(),
  jsonPath: z.string(),
  markdownPath: z.string()
});

export const storeIndexSchema = z.object({
  sessions: z.array(indexEntrySchema)
});

export type SourceKind = z.infer<typeof sourceKindSchema>;
export type PortableContext = z.infer<typeof portableContextSchema>;
export type PortableMessage = z.infer<typeof messageSchema>;
export type Redaction = z.infer<typeof redactionSchema>;
export type IndexEntry = z.infer<typeof indexEntrySchema>;
export type StoreIndex = z.infer<typeof storeIndexSchema>;
