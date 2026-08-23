/**
 * Lightweight XML tokenizer used for DITA syntax highlighting.
 *
 * Produces a flat list of tokens covering EVERY character of the input
 * (no characters are dropped), so the same token stream can be rendered
 * both in a read-only `<pre>` and in the overlay layer of an editable
 * highlighted textarea without misalignment.
 */

export type XmlTokenType =
  | 'text' // plain text content / whitespace
  | 'tag' // `<`, `>`, `</`, `/>`, `=`
  | 'tagName' // element name
  | 'attrName' // attribute name
  | 'attrValue' // quoted attribute value (including quotes)
  | 'comment' // <!-- ... -->
  | 'cdata' // <![CDATA[ ... ]]>
  | 'doctype' // <!DOCTYPE ... > / <!ENTITY ... > / generic declaration
  | 'pi' // <? ... ?>
  | 'entity'; // &amp; &lt; &#123; ...

export interface XmlToken {
  type: XmlTokenType;
  value: string;
}

const NAME_CHAR = /[A-Za-z0-9_:.\-]/;

export function tokenizeXml(input: string): XmlToken[] {
  const tokens: XmlToken[] = [];
  let i = 0;
  const n = input.length;

  const push = (type: XmlTokenType, value: string) => {
    if (value.length === 0) return;
    tokens.push({ type, value });
  };

  while (i < n) {
    // Comment: <!-- ... -->
    if (input.startsWith('<!--', i)) {
      const end = input.indexOf('-->', i + 4);
      const stop = end === -1 ? n : end + 3;
      push('comment', input.slice(i, stop));
      i = stop;
      continue;
    }

    // CDATA: <![CDATA[ ... ]]>
    if (input.startsWith('<![CDATA[', i)) {
      const end = input.indexOf(']]>', i + 9);
      const stop = end === -1 ? n : end + 3;
      push('cdata', input.slice(i, stop));
      i = stop;
      continue;
    }

    // DOCTYPE: <!DOCTYPE ... >
    if (input.startsWith('<!DOCTYPE', i) || input.startsWith('<!doctype', i)) {
      const end = input.indexOf('>', i);
      const stop = end === -1 ? n : end + 1;
      push('doctype', input.slice(i, stop));
      i = stop;
      continue;
    }

    // Other declarations: <!ENTITY ... >, <!ELEMENT ... >, etc.
    if (input.startsWith('<!', i)) {
      const end = input.indexOf('>', i);
      const stop = end === -1 ? n : end + 1;
      push('doctype', input.slice(i, stop));
      i = stop;
      continue;
    }

    // Processing instruction: <? ... ?>
    if (input.startsWith('<?', i)) {
      const end = input.indexOf('?>', i + 2);
      const stop = end === -1 ? n : end + 2;
      push('pi', input.slice(i, stop));
      i = stop;
      continue;
    }

    // Tags
    if (input[i] === '<') {
      // Closing tag: </name ...>
      if (input[i + 1] === '/') {
        push('tag', '</');
        i += 2;
        const nameStart = i;
        while (i < n && NAME_CHAR.test(input[i])) i++;
        push('tagName', input.slice(nameStart, i));
        while (i < n && /\s/.test(input[i])) {
          push('text', input[i]);
          i++;
        }
        if (i < n && input[i] === '>') {
          push('tag', '>');
          i++;
        }
        continue;
      }

      // Opening tag: <name attr="value" ...>
      push('tag', '<');
      i++;
      const nameStart = i;
      while (i < n && NAME_CHAR.test(input[i])) i++;
      push('tagName', input.slice(nameStart, i));

      // Attributes
      while (i < n) {
        if (/\s/.test(input[i])) {
          push('text', input[i]);
          i++;
          continue;
        }
        if (input[i] === '/' && input[i + 1] === '>') {
          push('tag', '/>');
          i += 2;
          break;
        }
        if (input[i] === '>') {
          push('tag', '>');
          i++;
          break;
        }
        // Attribute name
        const attrStart = i;
        while (i < n && NAME_CHAR.test(input[i])) i++;
        const attrName = input.slice(attrStart, i);
        if (attrName) {
          push('attrName', attrName);
        } else {
          // Unexpected character inside a tag — emit as text to avoid an
          // infinite loop (e.g. malformed markup).
          push('text', input[i]);
          i++;
          continue;
        }
        // Whitespace before '='
        while (i < n && /\s/.test(input[i])) {
          push('text', input[i]);
          i++;
        }
        if (i < n && input[i] === '=') {
          push('tag', '=');
          i++;
          while (i < n && /\s/.test(input[i])) {
            push('text', input[i]);
            i++;
          }
          // Quoted attribute value
          if (i < n && (input[i] === '"' || input[i] === "'")) {
            const quote = input[i];
            const valStart = i;
            i++;
            while (i < n && input[i] !== quote) i++;
            if (i < n) i++; // closing quote
            push('attrValue', input.slice(valStart, i));
          }
        }
      }
      continue;
    }

    // Entity: &name; / &#123;
    if (input[i] === '&') {
      const semi = input.indexOf(';', i);
      if (semi !== -1 && semi - i <= 12) {
        push('entity', input.slice(i, semi + 1));
        i = semi + 1;
        continue;
      }
      // Not a valid entity — treat as plain text.
      push('text', input[i]);
      i++;
      continue;
    }

    // Plain text content
    const textStart = i;
    while (i < n && input[i] !== '<' && input[i] !== '&') i++;
    push('text', input.slice(textStart, i));
  }

  return tokens;
}