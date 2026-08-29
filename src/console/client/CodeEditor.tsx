/**
 * A CodeJar-backed code input — used in place of a plain `<textarea>` wherever the console edits
 * source text a person actually reads as code (currently: the `website` domain's `globalCss`
 * setting, see `field-renderers` wiring in `fields.tsx`). CodeJar (github.com/antonmedv/codejar)
 * turns a `contenteditable` `<div>` into an editor with sane Tab/Enter/auto-indent behavior,
 * driven entirely by re-rendering `innerHTML` from a `highlight()` callback on every keystroke —
 * it owns cursor save/restore around that call, so `highlight()` below only has to worry about
 * turning plain text into marked-up HTML, never selection math.
 *
 * `highlight()` is a small hand-rolled tokenizer, not a real language grammar: comments, quoted
 * strings, and CSS-shaped `selector {` / `property:` identifiers get a `cj-*` span (styled in
 * `styles.css`), everything else passes through escaped and unstyled. That's enough to make CSS
 * (the concrete use case) readable without pulling in a full highlighting library — it degrades
 * gracefully (just unstyled text) for anything that isn't CSS-shaped.
 *
 * `codejar` itself is imported dynamically inside the mount effect, not at module top level: its
 * module body reads the global `window` unconditionally, which throws under `bun test` (no DOM) —
 * `fields.tsx` (and anything that imports it, e.g. `custom-forms.test.ts`) is exercised there
 * without ever mounting this component, so a static import would break those tests for a library
 * this file never actually calls outside a real browser.
 */
import { useEffect, useRef } from 'react';
import type { CodeJar } from 'codejar';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// One token per iteration: a /* */ comment, a quoted string, or a bare identifier immediately
// followed by `:` or `{` (a CSS property or selector) — everything else is left for the loop
// below to copy through verbatim (escaped, unstyled).
const TOKEN_RE = /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[.#&]?[a-zA-Z_-][\w-]*(?=\s*[:{])/g;

function highlight(editor: HTMLElement): void {
  const code = editor.textContent ?? '';
  let out = '';
  let lastIndex = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(code))) {
    out += escapeHtml(code.slice(lastIndex, m.index));
    const token = m[0];
    const followedByBrace = code.slice(TOKEN_RE.lastIndex).startsWith('{');
    let cls: string;
    if (token.startsWith('/*')) cls = 'cj-comment';
    else if (token[0] === '"' || token[0] === "'") cls = 'cj-string';
    else cls = followedByBrace ? 'cj-selector' : 'cj-property';
    out += `<span class="${cls}">${escapeHtml(token)}</span>`;
    lastIndex = TOKEN_RE.lastIndex;
  }
  out += escapeHtml(code.slice(lastIndex));
  editor.innerHTML = out;
}

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function CodeEditor({ value, onChange, placeholder }: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const jarRef = useRef<ReturnType<typeof CodeJar> | null>(null);
  // read inside `onUpdate`/the initial `updateCode` without retriggering the setup effect (or
  // waiting on the dynamic import) on every parent re-render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    let cancelled = false;
    void import('codejar').then(({ CodeJar }) => {
      if (cancelled) return;
      const jar = CodeJar(editor, highlight, { tab: '  ', indentOn: /[{(]$/ });
      jar.updateCode(valueRef.current);
      jar.onUpdate((code) => onChangeRef.current(code));
      jarRef.current = jar;
    });
    return () => {
      cancelled = true;
      jarRef.current?.destroy();
      jarRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the editor in sync with an externally-changed `value` (e.g. the form reloading after
  // save) without fighting the jar on every local keystroke — only when they've actually diverged.
  useEffect(() => {
    if (jarRef.current && jarRef.current.toString() !== value) jarRef.current.updateCode(value);
  }, [value]);

  return <div ref={editorRef} className="cj-editor" data-placeholder={placeholder} spellCheck={false} />;
}
