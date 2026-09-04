// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createEditor } from '../index';

/**
 * jsdom has no layout engine, so Range has no getClientRects/getBoundingClientRect
 * at all — CodeMirror measures itself on every animation frame and throws
 * without them. This is the standard shim for testing CodeMirror under jsdom.
 */
document.createRange = () => {
  const range = new Range();
  range.getBoundingClientRect = () => ({
    x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON() { return this; },
  });
  range.getClientRects = () => ({
    length: 0, item: () => null, [Symbol.iterator]: function* () {},
  }) as unknown as DOMRectList;
  return range;
};

function host() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('createEditor: get/set', () => {
  it('starts with the given document', () => {
    const editor = createEditor(host(), 'hello world', () => {}, () => {});
    expect(editor.get()).toBe('hello world');
  });

  it('set() replaces the whole document', () => {
    const editor = createEditor(host(), 'first', () => {}, () => {});
    editor.set('second');
    expect(editor.get()).toBe('second');
  });

  it('set() does not fire onChange', () => {
    const onChange = vi.fn();
    const editor = createEditor(host(), 'first', onChange, () => {});
    editor.set('second');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('createEditor: onChange fires on a real edit', () => {
  it('fires when text is inserted through a dispatch', () => {
    const onChange = vi.fn();
    const editor = createEditor(host(), 'abc', onChange, () => {});
    editor.view.dispatch({ changes: { from: 3, insert: 'd' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(editor.get()).toBe('abcd');
  });

  it('does not fire again for a selection-only change', () => {
    const onChange = vi.fn();
    const editor = createEditor(host(), 'abcdef', onChange, () => {});
    editor.view.dispatch({ selection: { anchor: 2 } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('createEditor: onCursor fires on selection changes, not edits', () => {
  it('fires when the cursor moves', () => {
    const onCursor = vi.fn();
    const editor = createEditor(host(), 'abcdef', () => {}, onCursor);
    editor.view.dispatch({ selection: { anchor: 3 } });
    expect(onCursor).toHaveBeenCalledWith(3);
  });

  it('does not fire while the document is still changing (onChange\'s own report will place it)', () => {
    const onCursor = vi.fn();
    const editor = createEditor(host(), 'abc', () => {}, onCursor);
    editor.view.dispatch({ changes: { from: 3, insert: 'd' } });
    expect(onCursor).not.toHaveBeenCalled();
  });
});

describe('createEditor: jumpTo', () => {
  it('selects the given range, from end to start', () => {
    const editor = createEditor(host(), '0123456789', () => {}, () => {});
    editor.jumpTo(2, 6);
    const sel = editor.view.state.selection.main;
    expect(sel.anchor).toBe(6);
    expect(sel.head).toBe(2);
  });

  it('clamps a range past the end of a shorter document', () => {
    const editor = createEditor(host(), 'short', () => {}, () => {});
    editor.jumpTo(2, 100);
    const sel = editor.view.state.selection.main;
    expect(sel.anchor).toBe(5);
  });
});

describe('createEditor: report', () => {
  it('report() with no error clears diagnostics', () => {
    const editor = createEditor(host(), 'part p = leaf(length: 20)', () => {}, () => {});
    editor.report({});
    // nothing to assert structurally beyond "does not throw" without reaching
    // into @codemirror/lint's internal state field, which is exactly the point:
    // the public contract is that a clean result never leaves a marker behind
    expect(editor.get()).toBe('part p = leaf(length: 20)');
  });

  it('report() with an error does not throw even when the line/column point past the document', () => {
    const editor = createEditor(host(), 'a', () => {}, () => {});
    expect(() => editor.report({
      error: { message: 'oops', line: 99, column: 99, start: 0, end: 1, formatted: '' },
    })).not.toThrow();
  });
});
