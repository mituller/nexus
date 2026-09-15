/**
 * MDXEditor escapes a literal "[" when Lexical serializes back to markdown, so
 * "[[Page Title]]" round-trips as "\[\[Page Title]]" and stops matching the
 * wikilink pattern. Real markdown links round-trip as link nodes and never
 * arrive here escaped, so undoing bracket escapes is safe.
 *
 * Apply on the way out of the editor (before saving) and when rendering, so
 * content written by an older build still displays correctly.
 */
export function unescapeBrackets(md: string): string {
  return md.replace(/\\([[\]])/g, "$1");
}
