-- Unescape markdown escape sequences introduced by MDXEditor when it processed
-- notes containing inline HTML (e.g. <span> timestamp tags from transcript imports).
-- MDXEditor serialized these back with backslash-escaped characters which marked
-- then rendered as literal text rather than markdown.
UPDATE notes SET content =
  replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(content, '\*', '*'),
                '\#', '#'),
              '\<', '<'),
            '\>', '>'),
          '\_', '_'),
        '\=', '='),
      '\!', '!'),
    '\[', '['),
  '\]', ']')
WHERE content LIKE '%\*%'
   OR content LIKE '%\#%'
   OR content LIKE '%\<%'
   OR content LIKE '%\>%';
