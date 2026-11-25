import { appendDictationText } from "../src/productivity/localDictation";

describe("note dictation transcript handling", () => {
  it("adds spoken phrases without spaces before punctuation", () => {
    expect(appendDictationText("Meeting notes", " starts now.")).toBe("Meeting notes starts now.");
    expect(appendDictationText("Hello", ", world")).toBe("Hello, world");
  });

  it("leaves the note unchanged for an empty transcript", () => {
    expect(appendDictationText("Existing note", "  ")).toBe("Existing note");
  });
});
