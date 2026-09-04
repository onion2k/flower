import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { callAt } from '../help';

const call = (doc: string, needle: string, offset = 0) => {
  const pos = doc.indexOf(needle) + offset;
  return callAt(EditorState.create({ doc }), pos);
};

describe('callAt: finds the innermost builtin call around the cursor', () => {
  it('finds a simple call by its callee name', () => {
    const c = call('part p = leaf(length: 20, width: 10)', 'length', 3);
    expect(c?.callee).toBe('leaf');
  });

  it('returns null outside of any call', () => {
    expect(call('material gold polished', 'gold', 1)).toBeNull();
  });

  it('returns null for a call to something that is not a known builtin', () => {
    expect(call('part p = bogus(length: 20)', 'length', 1)).toBeNull();
  });

  it('finds the innermost call when calls are nested', () => {
    const doc = 'part w = wire(path: spiral(start: 1, turns: 2), radius: 1)';
    const c = call(doc, 'start', 2);
    expect(c?.callee).toBe('spiral');
  });

  it('finds the outer call once past the nested call\'s closing paren', () => {
    const doc = 'part w = wire(path: spiral(start: 1, turns: 2), radius: 1)';
    const c = call(doc, 'radius', 2);
    expect(c?.callee).toBe('wire');
  });
});

describe('callAt: arguments', () => {
  it('lists positional arguments without a name', () => {
    const c = call('form f { place leaf(30, 12) }', '30', 1)!;
    expect(c.args.map((a) => a.name)).toEqual([undefined, undefined]);
  });

  it('lists named arguments with their name', () => {
    const c = call('part p = leaf(length: 20, width: 10)', 'width', 1)!;
    expect(c.args.map((a) => a.name)).toEqual(['length', 'width']);
  });

  it('identifies which argument index the cursor is inside', () => {
    const doc = 'part p = leaf(length: 20, width: 10)';
    const c = call(doc, 'width', 1)!;
    expect(c.current).toBe(1);
  });

  it('reports current as an in-progress argument even mid-word', () => {
    const doc = 'part p = leaf(length: 20, wid';
    const c = callAt(EditorState.create({ doc }), doc.length)!;
    expect(c.current).toBe(1);
    expect(c.args[1].text).toBe('wid');
  });

  it('does not count a comment\'s brackets as call structure', () => {
    // brackets inside a comment or string are blanked before scanning
    const doc = '# a note (with parens)\npart p = leaf(length: 20)';
    const c = call(doc, 'length', 1)!;
    expect(c?.callee).toBe('leaf');
  });

  it('ignores nested points when finding argument boundaries', () => {
    // a point literal nested inside another call's arguments has commas of
    // its own; this checks they do not get mistaken for argument separators
    // of the outer call
    const doc = 'part w = blade(path: bezier(a: (0,0,0), b: (1,1,1), c: (2,2,2), d: (3,3,3)), width: 4)';
    const c = call(doc, 'width', 1)!;
    expect(c?.callee).toBe('blade');
    expect(c.args.map((a) => a.name)).toEqual(['path', 'width']);
  });
});

describe('callAt: an unclosed call still resolves while being typed', () => {
  it('treats the rest of the line as open arguments', () => {
    const doc = 'part p = leaf(length: 20, ';
    const c = callAt(EditorState.create({ doc }), doc.length)!;
    expect(c?.callee).toBe('leaf');
  });

  it('bounds the argument list at a blank line even when still "inside" the unclosed call', () => {
    // callAt's backward search for the matching "(" has no distance limit, so
    // a cursor far past an unclosed call — even past a blank line — is still
    // found to be inside it. What the blank-line rule actually bounds is the
    // forward scan for arguments and the close position, not membership itself.
    const doc = 'part p = leaf(length: 20\n\nform f { place p }';
    const c = call(doc, 'form', 1);
    expect(c?.callee).toBe('leaf');
    expect(c?.args).toEqual([{ from: 14, to: 24, name: 'length', text: 'length: 20' }]);
    expect(doc.slice(0, c!.close)).not.toContain('form');
  });

  it('bounds the first unclosed call\'s argument list at the next statement keyword', () => {
    const doc = 'part p = leaf(length: 20\npart q = leaf(length: 10)';
    const c = call(doc, 'length: 20', 1)!;
    // "part" on the next line ends the first call's argument scan, so its
    // close sits before the second declaration, not swallowing it
    expect(doc.slice(c.open, c.close)).not.toContain('part q');
    // the cursor on the second part's own call still resolves to that call
    const secondCall = call(doc, 'length: 10', 1);
    expect(secondCall?.callee).toBe('leaf');
  });
});
