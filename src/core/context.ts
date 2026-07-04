import type { PortableContext, PortableMessage, SourceKind } from "./schema.js";
import {
  DECISION_KEYWORDS,
  OPEN_TASK_KEYWORDS,
  createContextId,
  extractBullets,
  extractCommands,
  extractFiles,
  inferGoal,
  summarizeMessages
} from "./extract.js";

export type AssembleContextInput = {
  source: SourceKind;
  sourceLabel: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  workspace?: string;
  messages: PortableMessage[];
  rawRefs: string[];
  sourceRef?: PortableContext["sourceRef"];
};

/** Build a full PortableContext from parsed session data, deriving goal, summary, and extracted lists. */
export function assembleContext(input: AssembleContextInput): PortableContext {
  const textCorpus = input.messages.map((message) => message.text).join("\n");

  return {
    id: createContextId(input.source, input.title, input.updatedAt),
    source: input.source,
    title: input.title,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    workspace: input.workspace,
    goal: inferGoal(input.messages, input.title),
    summary: summarizeMessages(input.messages, input.title, input.sourceLabel),
    messages: input.messages,
    filesMentioned: extractFiles(textCorpus),
    commands: extractCommands(textCorpus),
    decisions: extractBullets(textCorpus, DECISION_KEYWORDS),
    openTasks: extractBullets(textCorpus, OPEN_TASK_KEYWORDS),
    redactions: [],
    rawRefs: input.rawRefs,
    sourceRef: input.sourceRef
  };
}
