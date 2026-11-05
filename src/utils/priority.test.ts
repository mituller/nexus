import { describe, expect, it } from "vitest";
import { extractPriorityFromLabels, isPriorityLabel } from "./priority";

describe("extractPriorityFromLabels", () => {
  it.each([
    [["priority::critical"], "critical"],
    [["P: High"], "high"],
    [["medium"], "medium"],
    [["low-priority"], "low"],
  ])("reads %j as %s", (labels, expected) => {
    expect(extractPriorityFromLabels(labels)).toBe(expected);
  });

  it("picks the most severe of several labels", () => {
    expect(extractPriorityFromLabels(["low", "critical", "high"])).toBe("critical");
  });

  it("matches across common separators", () => {
    expect(extractPriorityFromLabels(["priority_high"])).toBe("high");
    expect(extractPriorityFromLabels(["priority/low"])).toBe("low");
  });

  it.each(["follow-up", "slow", "below", "highlight", "highway", "mediumship"])(
    "does not read a priority from the word %s",
    (label) => {
      expect(extractPriorityFromLabels([label])).toBeUndefined();
    },
  );

  it("is undefined when no label names a priority", () => {
    expect(extractPriorityFromLabels(["bug", "frontend"])).toBeUndefined();
    expect(extractPriorityFromLabels([])).toBeUndefined();
  });
});

describe("isPriorityLabel", () => {
  it("is true only for labels that set a priority", () => {
    expect(isPriorityLabel("priority::high")).toBe(true);
    expect(isPriorityLabel("follow-up")).toBe(false);
    expect(isPriorityLabel("bug")).toBe(false);
  });
});
