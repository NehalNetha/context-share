import type { PortableContext, Redaction } from "./schema.js";

type Rule = {
  kind: string;
  pattern: RegExp;
  replacement: string;
};

const rules: Rule[] = [
  {
    kind: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]"
  },
  {
    kind: "bearer-token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi,
    replacement: "Bearer [REDACTED_TOKEN]"
  },
  {
    kind: "openai-api-key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    replacement: "[REDACTED_OPENAI_KEY]"
  },
  {
    kind: "anthropic-api-key",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    replacement: "[REDACTED_ANTHROPIC_KEY]"
  },
  {
    kind: "github-token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]"
  },
  {
    kind: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: "[REDACTED_AWS_KEY]"
  },
  {
    kind: "generic-api-key",
    pattern: /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s]{12,}/gi,
    replacement: "[REDACTED_SECRET_ASSIGNMENT]"
  },
  {
    kind: "high-entropy",
    pattern: /\b[A-Za-z0-9+/=_-]{48,}\b/g,
    replacement: "[REDACTED_HIGH_ENTROPY]"
  }
];

export function redactText(input: string): { text: string; redactions: Redaction[] } {
  let text = input;
  const counts = new Map<string, number>();

  for (const rule of rules) {
    text = text.replace(rule.pattern, (match) => {
      if (looksLikeSafeLongIdentifier(match, rule.kind)) {
        return match;
      }
      counts.set(rule.kind, (counts.get(rule.kind) ?? 0) + 1);
      return rule.replacement;
    });
  }

  return {
    text,
    redactions: [...counts.entries()].map(([kind, count]) => ({ kind, count }))
  };
}

export function redactContext(context: PortableContext): PortableContext {
  const counts = new Map<string, number>();
  const apply = (value: string): string => {
    const result = redactText(value);
    for (const redaction of result.redactions) {
      counts.set(redaction.kind, (counts.get(redaction.kind) ?? 0) + redaction.count);
    }
    return result.text;
  };

  return {
    ...context,
    title: apply(context.title),
    summary: apply(context.summary),
    workspace: context.workspace ? apply(context.workspace) : undefined,
    messages: context.messages.map((message) => ({
      ...message,
      text: apply(message.text)
    })),
    filesMentioned: context.filesMentioned.map(apply),
    commands: context.commands.map(apply),
    decisions: context.decisions.map(apply),
    openTasks: context.openTasks.map(apply),
    rawRefs: context.rawRefs.map(apply),
    sourceRef: context.sourceRef
      ? {
          ...context.sourceRef,
          path: context.sourceRef.path ? apply(context.sourceRef.path) : undefined,
          sessionId: context.sourceRef.sessionId ? apply(context.sourceRef.sessionId) : undefined
        }
      : undefined,
    redactions: mergeRedactions(context.redactions, counts)
  };
}

function mergeRedactions(existing: Redaction[], counts: Map<string, number>): Redaction[] {
  const merged = new Map<string, number>();
  for (const item of existing) {
    merged.set(item.kind, (merged.get(item.kind) ?? 0) + item.count);
  }
  for (const [kind, count] of counts) {
    merged.set(kind, (merged.get(kind) ?? 0) + count);
  }
  return [...merged.entries()].map(([kind, count]) => ({ kind, count }));
}

function looksLikeSafeLongIdentifier(match: string, kind: string): boolean {
  if (kind !== "high-entropy") {
    return false;
  }
  return /^0{12,}$/.test(match) || /^[a-f0-9-]{32,}$/i.test(match);
}
