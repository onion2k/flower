import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../store';

/** A minimal in-memory Storage, so these tests do not depend on a DOM environment. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('store.mine / save / remove', () => {
  it('has nothing saved to start with', () => {
    expect(store.mine()).toEqual({});
    expect(store.mineNames()).toEqual([]);
  });

  it('saves a sketch and reads it back', () => {
    store.save('rosette', 'form f { }');
    expect(store.mine()).toEqual({ rosette: 'form f { }' });
  });

  it('lists saved names sorted alphabetically', () => {
    store.save('zeta', 'a');
    store.save('alpha', 'b');
    expect(store.mineNames()).toEqual(['alpha', 'zeta']);
  });

  it('overwrites a sketch saved again under the same name', () => {
    store.save('rosette', 'v1');
    store.save('rosette', 'v2');
    expect(store.mine().rosette).toBe('v2');
  });

  it('removes a saved sketch, leaving the rest untouched', () => {
    store.save('a', '1');
    store.save('b', '2');
    store.remove('a');
    expect(store.mine()).toEqual({ b: '2' });
  });

  it('removing the only sketch clears the underlying key rather than leaving an empty object', () => {
    store.save('a', '1');
    store.remove('a');
    expect(localStorage.getItem('artshape.sketches')).toBeNull();
  });
});

describe('store.draft / setDraft', () => {
  it('has no draft for a name that was never set', () => {
    expect(store.draft('rosette')).toBeUndefined();
  });

  it('sets and reads back a draft', () => {
    store.setDraft('rosette', 'edited text');
    expect(store.draft('rosette')).toBe('edited text');
  });

  it('clears a draft when set to undefined', () => {
    store.setDraft('rosette', 'edited text');
    store.setDraft('rosette', undefined);
    expect(store.draft('rosette')).toBeUndefined();
  });

  it('keeps drafts independent per name', () => {
    store.setDraft('a', 'draft a');
    store.setDraft('b', 'draft b');
    expect(store.draft('a')).toBe('draft a');
    expect(store.draft('b')).toBe('draft b');
  });
});

describe('store.subject', () => {
  it('is null before anything is set', () => {
    expect(store.subject()).toBeNull();
  });

  it('remembers the last subject set', () => {
    store.setSubject('Sketches:rosette');
    expect(store.subject()).toBe('Sketches:rosette');
    store.setSubject('Mine:my flower');
    expect(store.subject()).toBe('Mine:my flower');
  });
});

describe('store.editorHeight', () => {
  it('is null before anything is set', () => {
    expect(store.editorHeight()).toBeNull();
  });

  it('remembers a set height as a number', () => {
    store.setEditorHeight(420);
    expect(store.editorHeight()).toBe(420);
  });

  it('clears the height when set to null', () => {
    store.setEditorHeight(420);
    store.setEditorHeight(null);
    expect(store.editorHeight()).toBeNull();
  });

  it('treats a stored 0 the same as unset (falsy), by design', () => {
    // setEditorHeight(0) does not write a value at all, since `if (px)` is
    // false for 0 — a zero-height editor is not a real state to remember
    store.setEditorHeight(0);
    expect(store.editorHeight()).toBeNull();
  });
});

describe('store: swallows storage errors rather than throwing', () => {
  it('save() does not throw when localStorage.setItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded'); },
      removeItem: () => {},
    } as unknown as Storage);
    expect(() => store.save('a', 'b')).not.toThrow();
  });

  it('mine() does not throw and returns {} when localStorage.getItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => {},
      removeItem: () => {},
    } as unknown as Storage);
    expect(() => store.mine()).not.toThrow();
    expect(store.mine()).toEqual({});
  });

  it('subject() returns null rather than throwing when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
    } as unknown as Storage);
    expect(store.subject()).toBeNull();
  });
});

describe('store: tolerates corrupt JSON already in storage', () => {
  it('mine() falls back to {} rather than throwing on invalid JSON', () => {
    localStorage.setItem('artshape.sketches', '{not valid json');
    expect(store.mine()).toEqual({});
  });

  it('mine() falls back to {} when the stored value is valid JSON but not an object', () => {
    localStorage.setItem('artshape.sketches', '"just a string"');
    expect(store.mine()).toEqual({});
  });
});
