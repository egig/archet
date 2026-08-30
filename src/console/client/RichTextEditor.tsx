/**
 * A Quill-backed rich-text input — used in place of a plain `<textarea>` for any
 * `field.custom('richtext', …)` field (currently the `website` domain's `Page.body`). Produces an
 * HTML string; the server re-sanitizes it on every write (`src/website/pipeline.ts`'s
 * `sanitizeBody`), so this component doesn't need to be the security boundary — its job is just a
 * comfortable editor whose output is a subset of HTML.
 *
 * `quill` is imported dynamically inside the mount effect, not at module top level: its module
 * body touches `document` on load, which throws under `bun test` (no DOM). `fields.tsx` — and
 * everything that imports it, e.g. `custom-forms.test.ts` — is exercised there without ever
 * mounting this component, so a static import would break those tests for a library this file
 * never calls outside a real browser. Mirrors `CodeEditor.tsx`'s handling of `codejar`.
 *
 * Quill's own `snow` theme CSS is vendored at `quill.snow.css` and pulled into the console bundle
 * through `styles.css` (`@import`) — a runtime `import 'quill/dist/quill.snow.css'` here would
 * emit a stray CSS file the Tailwind-built console stylesheet never references.
 */
import { useEffect, useRef } from 'react';
import type Quill from 'quill';

const TOOLBAR = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'link'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'code-block'],
  ['clean'],
];

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    void import('quill').then(({ default: QuillCtor }) => {
      if (cancelled || !hostRef.current) return;
      const quill = new QuillCtor(hostRef.current, {
        theme: 'snow',
        placeholder,
        modules: { toolbar: TOOLBAR },
      });
      if (valueRef.current) quill.clipboard.dangerouslyPasteHTML(valueRef.current);
      quill.on('text-change', () => {
        const html = quill.root.innerHTML;
        // Quill represents "empty" as `<p><br></p>` — normalise it to '' so a required-field
        // check on the form sees an actual empty value.
        onChangeRef.current(html === '<p><br></p>' ? '' : html);
      });
      quillRef.current = quill;
    });
    return () => {
      cancelled = true;
      quillRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync an externally-changed `value` (e.g. the form reloading after save) without fighting the
  // editor on every local keystroke — only when they've genuinely diverged.
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;
    const current = quill.root.innerHTML;
    const normalizedCurrent = current === '<p><br></p>' ? '' : current;
    if (normalizedCurrent !== value) {
      quill.clipboard.dangerouslyPasteHTML(value || '');
    }
  }, [value]);

  return (
    <div className="rt-editor rounded border border-gray-300">
      <div ref={hostRef} />
    </div>
  );
}
