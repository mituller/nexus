export interface ParsedEmail {
  subject: string;
  from: string;
  to: string;
  cc?: string;
  date?: string;
  body: string;
}

// ─── Encoding helpers ────────────────────────────────────────────────────────

function decodeBase64Utf8(b64: string): string {
  try {
    const clean = b64.replace(/\s/g, "");
    const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    try { return atob(b64.replace(/\s/g, "")); } catch { return b64; }
  }
}

function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_: string, h: string) => String.fromCharCode(parseInt(h, 16)));
}

// Decode RFC 2047 encoded words =?UTF-8?B?...?= or =?UTF-8?Q?...?=
function decodeEncodedWord(str: string): string {
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_f: string, _cs: string, enc: string, text: string) => {
    try {
      return enc.toUpperCase() === "B"
        ? decodeBase64Utf8(text)
        : decodeURIComponent(text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m: string, h: string) => "%" + h));
    } catch { return text; }
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}

// ─── MIME parsing ─────────────────────────────────────────────────────────────

function parseHeaderBlock(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  // Unfold RFC 2822 folded headers (continuation lines start with whitespace)
  const unfolded = text.replace(/\n([ \t]+)/g, " ");
  for (const line of unfolded.split("\n")) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const val = line.slice(colon + 1).trim();
    if (key) headers[key] = decodeEncodedWord(val);
  }
  return headers;
}

function parseMimePart(raw: string): { headers: Record<string, string>; body: string } {
  // Normalize to \n-only for consistent splitting
  const text = raw.replace(/\r\n/g, "\n");
  const sepIdx = text.indexOf("\n\n");
  if (sepIdx < 0) return { headers: parseHeaderBlock(text), body: "" };
  return {
    headers: parseHeaderBlock(text.slice(0, sepIdx)),
    body: text.slice(sepIdx + 2),
  };
}

function decodePart(headers: Record<string, string>, body: string): string {
  const cte = (headers["content-transfer-encoding"] ?? "").toLowerCase().trim();
  if (cte === "base64") return decodeBase64Utf8(body);
  if (cte === "quoted-printable") return decodeQuotedPrintable(body);
  return body;
}

function extractText(headers: Record<string, string>, body: string): string {
  const ct = headers["content-type"] ?? "";

  // Multipart: recurse into parts
  if (ct.includes("multipart/")) {
    const boundaryMatch = ct.match(/boundary=["']?([^"';\r\n]+)["']?/i);
    if (!boundaryMatch) return "";
    const boundary = "--" + boundaryMatch[1].trim();

    const parts = body.split(new RegExp("^" + escapeRegex(boundary) + "-{0,2}\\s*$", "m"))
      .slice(1)
      .filter((p) => p.trim() && !p.startsWith("--"));

    let plain = "", html = "";
    for (const part of parts) {
      const { headers: ph, body: pb } = parseMimePart(part.trim());
      const pct = ph["content-type"] ?? "";
      if (pct.includes("multipart/")) {
        const nested = extractText(ph, pb);
        if (nested && !plain) plain = nested;
      } else if (pct.includes("text/plain") && !plain) {
        plain = decodePart(ph, pb);
      } else if (pct.includes("text/html") && !html) {
        html = stripHtml(decodePart(ph, pb));
      }
    }
    return plain || html;
  }

  // Decode the body
  const decoded = decodePart(headers, body);

  // Handle HTML
  if (ct.includes("text/html")) return stripHtml(decoded);

  // Detect if the decoded body is itself a nested MIME part (starts with headers)
  const trimmed = decoded.trimStart();
  if (/^content-type:/i.test(trimmed) || /^content-transfer-encoding:/i.test(trimmed)) {
    const { headers: nh, body: nb } = parseMimePart(trimmed);
    if (nh["content-type"] || nh["content-transfer-encoding"]) {
      return extractText(nh, nb);
    }
  }

  return decoded;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseEml(raw: string): ParsedEmail {
  const { headers, body } = parseMimePart(raw);

  return {
    subject: headers["subject"] ?? "(No subject)",
    from: headers["from"] ?? "",
    to: headers["to"] ?? "",
    cc: headers["cc"],
    date: headers["date"],
    body: extractText(headers, body).trim(),
  };
}

export function emlToNoteContent(email: ParsedEmail): string {
  const lines: string[] = [];
  if (email.from) lines.push(`**From:** ${email.from}`);
  if (email.to) lines.push(`**To:** ${email.to}`);
  if (email.cc) lines.push(`**CC:** ${email.cc}`);
  if (email.date) lines.push(`**Date:** ${email.date}`);
  lines.push("", "---", "", email.body);
  return lines.join("\n");
}
