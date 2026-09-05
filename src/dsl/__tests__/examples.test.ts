import { describe, expect, it } from 'vitest';
import { compile } from '../index';
import { exampleGroups, exampleNames, examples } from '../examples';

// Every sketch shipped with the editor compiles, builds something, and is
// listed in a group. A sketch that fails here fails in the picker, where
// the user sees an error instead of the piece it promises.
describe('examples', () => {
  for (const name of exampleNames) {
    it(`${name} compiles to a piece with parts in it`, () => {
      const result = compile(examples[name]);
      expect(result.error?.formatted).toBeUndefined();
      const stats = result.sketch!.assembly.stats();
      expect(stats.instances).toBeGreaterThan(1);
    });
  }

  it('every example is in a named group, and no group names a sketch that does not exist', () => {
    const grouped = exampleGroups.flatMap(([, names]) => names);
    for (const name of grouped) expect(exampleNames).toContain(name);
    expect(exampleGroups.find(([g]) => g === 'Other')).toBeUndefined();
  });
});
