import { describe, expect, it } from "vitest";
import { assembleMessages } from "../src/sources/opencode.js";

const messageRows = [
  {
    id: "msg_1",
    data: JSON.stringify({ role: "user", time: { created: 1783077438000 } }),
    time_created: 1783077438000
  },
  {
    id: "msg_2",
    data: JSON.stringify({ role: "assistant", time: { created: 1783077440000 } }),
    time_created: 1783077440000
  }
];

const partRows = [
  { message_id: "msg_1", data: JSON.stringify({ type: "text", text: "Check the failing tests" }) },
  { message_id: "msg_2", data: JSON.stringify({ type: "step-start" }) },
  { message_id: "msg_2", data: JSON.stringify({ type: "reasoning", text: "internal thoughts" }) },
  { message_id: "msg_2", data: JSON.stringify({ type: "text", text: "Running them now." }) },
  {
    message_id: "msg_2",
    data: JSON.stringify({
      type: "tool",
      tool: "bash",
      state: { status: "completed", input: { command: "npm test" }, output: "2 failed" }
    })
  }
];

describe("opencode message assembly", () => {
  it("builds user/assistant/tool messages from rows", () => {
    const messages = assembleMessages(messageRows, partRows);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
    expect(messages[0].text).toBe("Check the failing tests");
    expect(messages[1].text).toBe("Running them now.");
  });

  it("keeps tool input and output, drops reasoning and step markers", () => {
    const corpus = assembleMessages(messageRows, partRows)
      .map((message) => message.text)
      .join("\n");
    expect(corpus).toContain('Tool use: bash — {"command":"npm test"}');
    expect(corpus).toContain("Tool result:\n2 failed");
    expect(corpus).not.toContain("internal thoughts");
  });

  it("survives malformed rows", () => {
    const messages = assembleMessages(
      [{ id: "bad", data: "not json", time_created: 0 }, ...messageRows],
      partRows
    );
    expect(messages).toHaveLength(3);
  });
});
