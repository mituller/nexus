import { describe, expect, it } from "vitest";
import { emlToNoteContent, parseEml } from "./emlParser";

const eml = (...lines: string[]) => lines.join("\r\n");
const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");

describe("parseEml headers", () => {
  it("reads the standard headers from a plain message", () => {
    const parsed = parseEml(eml(
      "Subject: Hello",
      "From: Ann <ann@example.com>",
      "To: Bob <bob@example.com>",
      "Cc: Cy <cy@example.com>",
      "Date: Mon, 1 Jun 2026 09:00:00 -0400",
      "",
      "Body text",
    ));
    expect(parsed).toEqual({
      subject: "Hello",
      from: "Ann <ann@example.com>",
      to: "Bob <bob@example.com>",
      cc: "Cy <cy@example.com>",
      date: "Mon, 1 Jun 2026 09:00:00 -0400",
      body: "Body text",
    });
  });

  it("falls back when headers are missing", () => {
    const parsed = parseEml(eml("X-Other: 1", "", "Body"));
    expect(parsed.subject).toBe("(No subject)");
    expect(parsed.from).toBe("");
    expect(parsed.cc).toBeUndefined();
  });

  it("unfolds continuation lines", () => {
    expect(parseEml(eml("Subject: A long", "  subject line", "", "x")).subject).toBe("A long subject line");
  });

  it("decodes base64 and quoted-printable encoded words", () => {
    expect(parseEml(eml(`Subject: =?UTF-8?B?${b64("Café")}?=`, "", "x")).subject).toBe("Café");
    expect(parseEml(eml("Subject: =?UTF-8?Q?Caf=C3=A9_time?=", "", "x")).subject).toBe("Café time");
  });

  it("handles a message with no body", () => {
    const parsed = parseEml("Subject: Only headers");
    expect(parsed.subject).toBe("Only headers");
    expect(parsed.body).toBe("");
  });
});

describe("parseEml bodies", () => {
  it("decodes a base64 body as UTF-8", () => {
    const parsed = parseEml(eml(
      "Content-Type: text/plain",
      "Content-Transfer-Encoding: base64",
      "",
      b64("Café ☕"),
    ));
    expect(parsed.body).toBe("Café ☕");
  });

  it("joins soft line breaks in a quoted-printable body", () => {
    const parsed = parseEml(eml(
      "Content-Type: text/plain",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "one =",
      "two =3D three",
    ));
    expect(parsed.body).toBe("one two = three");
  });

  const quotedPrintable = (contentType: string, ...body: string[]) => parseEml(eml(
    `Content-Type: ${contentType}`,
    "Content-Transfer-Encoding: quoted-printable",
    "",
    ...body,
  )).body;

  it("decodes multi-byte UTF-8 in a quoted-printable body", () => {
    expect(quotedPrintable("text/plain; charset=utf-8", "Caf=C3=A9")).toBe("Café");
  });

  it("assumes UTF-8 when a quoted-printable part names no charset", () => {
    expect(quotedPrintable("text/plain", "Caf=C3=A9")).toBe("Café");
  });

  it("decodes a character split across a soft line break", () => {
    expect(quotedPrintable("text/plain; charset=utf-8", "Caf=C3=", "=A9")).toBe("Café");
  });

  it("honours a non-UTF-8 charset in a quoted-printable body", () => {
    expect(quotedPrintable('text/plain; charset="iso-8859-1"', "Caf=E9")).toBe("Café");
  });

  it("falls back to UTF-8 for an unknown charset", () => {
    expect(quotedPrintable("text/plain; charset=not-a-charset", "Caf=C3=A9")).toBe("Café");
  });

  it("strips tags and decodes entities from an HTML body", () => {
    const parsed = parseEml(eml(
      "Content-Type: text/html",
      "",
      "<style>p{color:red}</style><p>Tom &amp; Jerry</p><ul><li>One</li><li>Two</li></ul>",
    ));
    expect(parsed.body).toBe("Tom & Jerry\n\n• One\n• Two");
  });

  it("prefers the plain part of a multipart message", () => {
    const parsed = parseEml(eml(
      'Content-Type: multipart/alternative; boundary="b1"',
      "",
      "--b1",
      "Content-Type: text/html",
      "",
      "<p>HTML version</p>",
      "--b1",
      "Content-Type: text/plain",
      "",
      "Plain version",
      "--b1--",
    ));
    expect(parsed.body).toBe("Plain version");
  });

  it("falls back to the HTML part when there is no plain part", () => {
    const parsed = parseEml(eml(
      "Content-Type: multipart/alternative; boundary=b1",
      "",
      "--b1",
      "Content-Type: text/html",
      "",
      "<p>HTML only</p>",
      "--b1--",
    ));
    expect(parsed.body).toBe("HTML only");
  });

  it("recurses into nested multipart parts", () => {
    const parsed = parseEml(eml(
      'Content-Type: multipart/mixed; boundary="outer"',
      "",
      "--outer",
      'Content-Type: multipart/alternative; boundary="inner"',
      "",
      "--inner",
      "Content-Type: text/plain",
      "",
      "Nested text",
      "--inner--",
      "--outer--",
    ));
    expect(parsed.body).toBe("Nested text");
  });

  it("returns an empty body for multipart without a boundary", () => {
    expect(parseEml(eml("Content-Type: multipart/mixed", "", "text")).body).toBe("");
  });
});

describe("emlToNoteContent", () => {
  it("lists present headers above the body", () => {
    const content = emlToNoteContent({ subject: "S", from: "a", to: "b", cc: "c", date: "d", body: "Body" });
    expect(content).toBe("**From:** a\n**To:** b\n**CC:** c\n**Date:** d\n\n---\n\nBody");
  });

  it("omits empty headers", () => {
    const content = emlToNoteContent({ subject: "S", from: "", to: "b", body: "Body" });
    expect(content).toBe("**To:** b\n\n---\n\nBody");
  });
});
