import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, fencedBlocks } from "./markdown.js";

const PAGE = join(ROOT, "docs", "system-prompt.md");
const MAX_LENGTH = 1500;

describe("docs/system-prompt.md", () => {
  const page = readFileSync(PAGE, "utf8");
  const blocks = fencedBlocks(page);

  it("holds exactly one fenced block, the prompt", () => {
    expect(blocks).toHaveLength(1);
  });

  it(`keeps the prompt to ${String(MAX_LENGTH)} characters or less`, () => {
    expect(blocks[0].content.length).toBeLessThanOrEqual(MAX_LENGTH);
  });

  it("tells the model to cite camptocamp.org, pass lang, treat marked text as content and flag missing values", () => {
    for (const phrase of ["camptocamp.org", "lang", "begin user-written text", "not on Camptocamp"]) {
      expect(blocks[0].content, phrase).toContain(phrase);
    }
  });

  it("says where to paste the prompt in each SDK", () => {
    for (const field of ["Agent.instructions", "instructions", "system_instruction"]) {
      expect(page, field).toContain(`\`${field}\``);
    }
  });
});
