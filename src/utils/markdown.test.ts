import { describe, expect, it } from "vitest";
import { unescapeBrackets } from "./markdown";

describe("unescapeBrackets", () => {
  it("restores a wikilink escaped by the editor", () => {
    expect(unescapeBrackets("See \\[\\[Page Title]] here")).toBe("See [[Page Title]] here");
  });

  it("unescapes closing brackets too", () => {
    expect(unescapeBrackets("\\[\\[Page\\]\\]")).toBe("[[Page]]");
  });

  it("leaves other escapes and plain links alone", () => {
    const md = "\\*not bold\\* and [link](https://example.com)";
    expect(unescapeBrackets(md)).toBe(md);
  });
});
