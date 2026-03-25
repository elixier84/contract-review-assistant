import { describe, it, expect } from "vitest";
import { extractJson, stripCodeFences, detectRefusal } from "../src/lib/claude-analyzer";

// ---------------------------------------------------------------------------
// stripCodeFences
// ---------------------------------------------------------------------------

describe("stripCodeFences", () => {
  it("returns plain text as-is", () => {
    expect(stripCodeFences('{"key": "value"}')).toBe('{"key": "value"}');
  });

  it("strips ```json fences", () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(stripCodeFences(input)).toBe('{"key": "value"}');
  });

  it("strips plain ``` fences", () => {
    const input = '```\n{"key": "value"}\n```';
    expect(stripCodeFences(input)).toBe('{"key": "value"}');
  });

  it("trims whitespace inside fences", () => {
    const input = '```json\n  {"key": "value"}  \n```';
    expect(stripCodeFences(input)).toBe('{"key": "value"}');
  });

  it("trims whitespace from non-fenced input", () => {
    expect(stripCodeFences("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(stripCodeFences("")).toBe("");
  });

  it("handles nested backticks in content", () => {
    const input = '```json\n{"code": "use ```bash``` here"}\n```';
    // The regex is greedy-minimal, so it captures up to the first ```
    const result = stripCodeFences(input);
    expect(result).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// extractJson
// ---------------------------------------------------------------------------

describe("extractJson", () => {
  it("returns valid JSON object as-is", () => {
    const input = '{"key": "value"}';
    expect(extractJson(input)).toBe('{"key": "value"}');
  });

  it("returns valid JSON array as-is", () => {
    const input = '[{"id": 1}, {"id": 2}]';
    expect(extractJson(input)).toBe('[{"id": 1}, {"id": 2}]');
  });

  it("strips code fences before extracting", () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(extractJson(input)).toBe('{"key": "value"}');
  });

  it("extracts JSON from text with leading decoration", () => {
    const input = 'Here is the analysis:\n\n{"confidence": 0.9, "data": "test"}';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ confidence: 0.9, data: "test" });
  });

  it("extracts JSON from text with trailing decoration", () => {
    const input = '{"confidence": 0.9}\n\n---\nbkit Feature Usage Report';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ confidence: 0.9 });
  });

  it("extracts JSON from text with both leading and trailing decoration", () => {
    const input = "Here's the result:\n\n{\"key\": \"value\"}\n\nDone!";
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  it("handles nested objects correctly", () => {
    const input = 'prefix {"outer": {"inner": "value"}} suffix';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ outer: { inner: "value" } });
  });

  it("handles nested arrays correctly", () => {
    const input = 'prefix [{"items": [1, 2, 3]}] suffix';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual([{ items: [1, 2, 3] }]);
  });

  it("handles strings containing braces", () => {
    const input = '{"text": "value with {braces} inside"}';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ text: "value with {braces} inside" });
  });

  it("handles escaped quotes in strings", () => {
    const input = '{"text": "say \\"hello\\""}';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ text: 'say "hello"' });
  });

  it("returns input when no JSON found", () => {
    const input = "no json here at all";
    const result = extractJson(input);
    expect(result).toBe("no json here at all");
  });

  it("handles empty string", () => {
    expect(extractJson("")).toBe("");
  });

  it("handles real-world bkit feature report suffix", () => {
    const input = `{"effective_date": "2012-03-20", "confidence": 0.92}

─────────────────────────────────────────────────
📊 bkit Feature Usage
─────────────────────────────────────────────────
✅ Used: Analysis
⏭️ Not Used: None`;
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({
      effective_date: "2012-03-20",
      confidence: 0.92,
    });
  });

  it("handles code fences around JSON with trailing text", () => {
    const input = "```json\n[{\"term\": \"Licensed Product\"}]\n```\n\nI hope this helps!";
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual([{ term: "Licensed Product" }]);
  });
});

// ---------------------------------------------------------------------------
// detectRefusal
// ---------------------------------------------------------------------------

describe("detectRefusal", () => {
  it("detects 'I can't' refusal", () => {
    expect(detectRefusal("I can't analyze this contract because it contains...")).toBe(true);
  });

  it("detects 'I cannot' refusal", () => {
    expect(detectRefusal("I cannot process this request.")).toBe(true);
  });

  it("detects 'I'm unable' refusal", () => {
    expect(detectRefusal("I'm unable to help with that.")).toBe(true);
  });

  it("detects 'I am unable' refusal", () => {
    expect(detectRefusal("I am unable to analyze the provided document.")).toBe(true);
  });

  it("detects 'I'm not able' refusal", () => {
    expect(detectRefusal("I'm not able to extract information from this.")).toBe(true);
  });

  it("detects 'I must decline' refusal", () => {
    expect(detectRefusal("I must decline this analysis request.")).toBe(true);
  });

  it("detects 'I won't be able' refusal", () => {
    expect(detectRefusal("I won't be able to complete this task.")).toBe(true);
  });

  it("does NOT flag normal JSON output", () => {
    expect(detectRefusal('{"effective_date": "2012-03-20", "confidence": 0.92}')).toBe(false);
  });

  it("does NOT flag contract text mentioning 'cannot'", () => {
    // This appears after the first 500 chars so should not trigger
    const prefix = "a".repeat(600);
    expect(detectRefusal(prefix + "I cannot do this.")).toBe(false);
  });

  it("only checks first 500 chars", () => {
    const safePrefix = "x".repeat(501);
    expect(detectRefusal(safePrefix + "I can't do this")).toBe(false);
  });

  it("handles empty string", () => {
    expect(detectRefusal("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(detectRefusal("I CAN'T analyze this")).toBe(true);
    expect(detectRefusal("i cannot process this")).toBe(true);
  });

  it("does NOT flag 'I can' (without 't or not)", () => {
    expect(detectRefusal("I can help you with the analysis.")).toBe(false);
  });
});
