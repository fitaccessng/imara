import { colorHex, halfPointSize } from "../src/components/wordFormatting";

describe("Word formatting conversion", () => {
  it("normalizes CSS hex and rgb colors for DOCX output", () => {
    expect(colorHex("#A1b2C3")).toBe("#a1b2c3");
    expect(colorHex("rgb(17, 24, 39)")).toBe("#111827");
    expect(colorHex("transparent")).toBeNull();
  });

  it("converts CSS font sizes to Word half-points", () => {
    expect(halfPointSize("11pt")).toBe("22");
    expect(halfPointSize("16px")).toBe("24");
    expect(halfPointSize("0pt")).toBeNull();
    expect(halfPointSize("inherit")).toBeNull();
  });
});
