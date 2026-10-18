import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('style.css', () => {
  const css = readFileSync('public/style.css', 'utf8');

  it('wraps the filter chips with a mouse, where a sideways row cannot be swiped', () => {
    const rule = /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.chips \{([^}]*)\}/.exec(css);
    assert.ok(rule, 'missing mouse-only rule for .chips');
    assert.match(rule[1] ?? '', /flex-wrap: wrap;/);
    assert.match(rule[1] ?? '', /overflow-x: visible;/);
  });
});
