-- MDXEditor escapes literal "[" when serializing Lexical nodes back to markdown,
-- so opening a wiki page in Edit mode rewrote every "[[Page Title]]" wikilink as
-- "\[\[Page Title]]". Those no longer match the wikilink pattern and render as
-- literal text. Undo the bracket escapes; genuine markdown links are unaffected
-- because they serialize as link nodes and are never stored escaped.
UPDATE wiki_pages SET content = replace(replace(content, '\[', '['), '\]', ']')
WHERE content LIKE '%\[%' OR content LIKE '%\]%';
