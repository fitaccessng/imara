import { formatStoragePercent, getStorageBreakdown } from "../src/pages/storageBreakdown";

describe("getStorageBreakdown", () => {
  it("calculates used and available slices when there are no reservations", () => {
    expect(getStorageBreakdown(25, 0, 75)).toEqual({
      usedPercent: 25,
      reservedPercent: 0,
      availablePercent: 75,
    });
  });

  it("includes reserved uploads as a separate slice", () => {
    expect(getStorageBreakdown(20, 10, 70)).toEqual({
      usedPercent: 20,
      reservedPercent: 10,
      availablePercent: 70,
    });
  });

  describe("formatStoragePercent", () => {
    it("keeps a non-zero but tiny slice visible", () => {
      expect(formatStoragePercent(0.2)).toBe("<1%");
    });

    it("rounds ordinary percentages for compact chart labels", () => {
      expect(formatStoragePercent(42.6)).toBe("43%");
      expect(formatStoragePercent(0)).toBe("0%");
    });
  });

  it("shows all storage as available for an empty zero-quota account", () => {
    expect(getStorageBreakdown(0, 0, 0)).toEqual({
      usedPercent: 0,
      reservedPercent: 0,
      availablePercent: 100,
    });
  });
});
