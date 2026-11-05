import { describe, expect, it } from "vitest";
import { extractPriorityFromLabels } from "./priority";

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

  it("is undefined when no label names a priority", () => {
    expect(extractPriorityFromLabels(["bug", "frontend"])).toBeUndefined();
    expect(extractPriorityFromLabels([])).toBeUndefined();
  });
});
