import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { literalAt } from '../scrub';

const at = (doc: string, needle: string, offset = 0) => {
  const pos = doc.indexOf(needle) + offset;
  return literalAt(EditorState.create({ doc }), pos);
};

describe('literalAt: finds the number under the cursor', () => {
  it('finds a plain integer', () => {
    const lit = at('length: 34', '34', 1);
    expect(lit).toMatchObject({ value: 34, decimals: 0, unit: '' });
  });

  it('finds a decimal and infers its decimal count', () => {
    const lit = at('thickness: 1.1', '1.1', 1);
    expect(lit).toMatchObject({ value: 1.1, decimals: 1 });
  });

  it('finds a number with a unit suffix and keeps it separate from the value', () => {
    const lit = at('turn 30deg', '30deg', 1);
    expect(lit).toMatchObject({ value: 30, unit: 'deg' });
  });

  it('returns null when the cursor sits on a word, not a number', () => {
    expect(at('shape: ovate', 'ovate', 1)).toBeNull();
  });

  it('returns null at a position touching neither number', () => {
    const doc = 'a: 1, b: 2';
    const pos = doc.indexOf(' b') + 1; // the space right before "b:"
    expect(literalAt(EditorState.create({ doc }), pos)).toBeNull();
  });

  it('a position right after a number still counts as touching it', () => {
    // this is what lets the cursor sit at the end of a just-typed literal
    const doc = 'a: 1, b: 2';
    const pos = doc.indexOf(',');
    expect(literalAt(EditorState.create({ doc }), pos)?.value).toBe(1);
  });
});

describe('literalAt: negative sign disambiguation', () => {
  it('treats a leading minus after a colon as a sign', () => {
    const lit = at('turn -29deg', '-29deg', 1);
    expect(lit?.value).toBe(-29);
  });

  it('treats a leading minus inside a point as a sign', () => {
    const lit = at('at (-5, 0, 0)', '-5', 1);
    expect(lit?.value).toBe(-5);
  });

  it('treats a minus after an operator as a sign', () => {
    const lit = at('width: 10 * -2', '-2', 1);
    expect(lit?.value).toBe(-2);
  });

  it('treats a minus between two numbers as subtraction, not a sign', () => {
    const lit = at('width: 10 - 2', '2', 0);
    expect(lit?.value).toBe(2);
    expect(lit?.from).toBe('width: 10 - '.length);
  });

  it('treats a minus straight after a bare word as a sign, matching "turn -29deg"', () => {
    // deliberate, per the source comment: "turn -29deg" is the pattern this
    // exists for, and it too has an identifier immediately before the minus
    const doc = 'let n = width -2';
    const pos = doc.lastIndexOf('2');
    const lit = literalAt(EditorState.create({ doc }), pos);
    expect(lit?.value).toBe(-2);
  });
});

describe('literalAt: span and formatting fields', () => {
  it('reports the exact character span of the literal, unit included', () => {
    const doc = 'radius: 30deg';
    const lit = literalAt(EditorState.create({ doc }), doc.indexOf('30deg') + 2);
    expect(doc.slice(lit!.from, lit!.to)).toBe('30deg');
  });

  it('counts decimals from the digits alone, not the unit', () => {
    const lit = at('sag: 0.25turns', '0.25', 1);
    expect(lit?.decimals).toBe(2);
  });

  it('operates on whichever line the position falls in', () => {
    const doc = 'part a = leaf(length: 20)\npart b = leaf(length: 40)';
    const pos = doc.indexOf('40') + 1;
    const lit = literalAt(EditorState.create({ doc }), pos);
    expect(lit?.value).toBe(40);
  });
});
