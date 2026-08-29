/**
 * The `website` built-in domain's block editor — reached from a `Page`'s own edit form
 * (`website/models/page.form.tsx`'s "Edit content →" button). Manages that page's `Block` rows
 * directly through the generic `/api/blocks` REST route (`createRow`/`updateRow`/`removeRow`),
 * the same way any other console screen would, rather than through `Page`'s `blocks`
 * `referenceToMany` field — the block editor's job is building new block rows and ordering them,
 * not picking among rows that already exist (see `page.model.ts`'s doc comment).
 *
 * Ordered list of block cards, each with an inline per-type editor and move-up/move-down/delete —
 * no drag-and-drop, no live inline preview; the header's "View live" link opens the actual public
 * route in a new tab instead.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { createRow, getRow, listRows, removeRow, updateRow } from './api.js';
import type { FilterClause } from './FilterBar.js';
import { queryKeys } from './query-keys.js';

interface BlockRow {
  id: string;
  type: string;
  content: Record<string, unknown> | null;
  htmlContent: string | null;
  order: number;
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  heading: 'Heading',
  text: 'Text',
  image: 'Image',
  button: 'Button',
  html: 'HTML',
  spacer: 'Spacer',
};

function defaultContentFor(type: string): Record<string, unknown> {
  switch (type) {
    case 'heading':
      return { text: 'New heading' };
    case 'text':
      return { text: '' };
    case 'image':
      return { url: '', alt: '' };
    case 'button':
      return { label: 'Learn more', href: '' };
    default:
      return {};
  }
}

function summarize(block: BlockRow): string {
  const content = block.content ?? {};
  switch (block.type) {
    case 'heading':
    case 'text':
      return typeof content.text === 'string' && content.text.length > 0 ? content.text : '(empty)';
    case 'image':
      return typeof content.url === 'string' && content.url.length > 0 ? content.url : '(no url yet)';
    case 'button':
      return typeof content.label === 'string' ? content.label : '';
    case 'html':
      return block.htmlContent ? `${block.htmlContent.slice(0, 60)}${block.htmlContent.length > 60 ? '…' : ''}` : '(empty)';
    default:
      return '';
  }
}

const inputClass = 'w-full rounded border border-gray-300 px-2 py-1.5 text-sm';

function BlockEditor({ block, onChange }: { block: BlockRow; onChange: (patch: Record<string, unknown>) => void }) {
  const content = block.content ?? {};
  switch (block.type) {
    case 'heading':
      return (
        <input
          className={inputClass}
          value={(content.text as string) ?? ''}
          onChange={(e) => onChange({ content: { ...content, text: e.target.value } })}
          placeholder="Heading text"
        />
      );
    case 'text':
      return (
        <textarea
          className={`${inputClass} min-h-24`}
          value={(content.text as string) ?? ''}
          onChange={(e) => onChange({ content: { ...content, text: e.target.value } })}
          placeholder="Markdown — **bold**, *italic*, [label](url)"
        />
      );
    case 'image':
      return (
        <div className="space-y-2">
          <input
            className={inputClass}
            value={(content.url as string) ?? ''}
            onChange={(e) => onChange({ content: { ...content, url: e.target.value } })}
            placeholder="Image URL"
          />
          <input
            className={inputClass}
            value={(content.alt as string) ?? ''}
            onChange={(e) => onChange({ content: { ...content, alt: e.target.value } })}
            placeholder="Alt text"
          />
        </div>
      );
    case 'button':
      return (
        <div className="space-y-2">
          <input
            className={inputClass}
            value={(content.label as string) ?? ''}
            onChange={(e) => onChange({ content: { ...content, label: e.target.value } })}
            placeholder="Button label"
          />
          <input
            className={inputClass}
            value={(content.href as string) ?? ''}
            onChange={(e) => onChange({ content: { ...content, href: e.target.value } })}
            placeholder="Link (/a-page, https://…, mailto:…)"
          />
        </div>
      );
    case 'html':
      return (
        <textarea
          className={`${inputClass} min-h-32 font-mono`}
          value={block.htmlContent ?? ''}
          onChange={(e) => onChange({ htmlContent: e.target.value })}
          placeholder="<div>raw HTML — rendered unescaped</div>"
        />
      );
    case 'spacer':
      return <p className="text-xs text-gray-500">A fixed-height gap — nothing to configure.</p>;
    default:
      return null;
  }
}

export function PageBuilderPage() {
  const { pageId } = useParams<{ pageId: string }>();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const pageQuery = useQuery({
    queryKey: queryKeys.row('pages', pageId ?? ''),
    queryFn: () => getRow('pages', pageId!),
    enabled: !!pageId,
  });

  const listParams = useMemo(
    () => ({ limit: 200, offset: 0, filters: (pageId ? [['pageId', '=', pageId]] : []) as FilterClause[], sort: 'order' }),
    [pageId],
  );
  const blocksQuery = useQuery({
    queryKey: queryKeys.rows('blocks', listParams),
    queryFn: () => listRows('blocks', listParams),
    enabled: !!pageId,
  });
  const blocks = ((blocksQuery.data?.rows as unknown as BlockRow[] | undefined) ?? []).slice().sort((a, b) => a.order - b.order);

  function invalidateBlocks() {
    return queryClient.invalidateQueries({ queryKey: queryKeys.rows('blocks'), exact: false });
  }

  const addBlockMutation = useMutation({
    mutationFn: (type: string) =>
      createRow('blocks', {
        pageId,
        type,
        order: blocks.length === 0 ? 0 : Math.max(...blocks.map((b) => b.order)) + 1,
        content: defaultContentFor(type),
      }),
    onSuccess: () => void invalidateBlocks(),
  });

  const updateBlockMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => updateRow('blocks', id, patch),
    onSuccess: () => void invalidateBlocks(),
  });

  const removeBlockMutation = useMutation({
    mutationFn: (id: string) => removeRow('blocks', id),
    onSuccess: () => void invalidateBlocks(),
  });

  const reorderMutation = useMutation({
    mutationFn: (ordered: BlockRow[]) => Promise.all(ordered.map((b, i) => (b.order === i ? null : updateRow('blocks', b.id, { order: i })))),
    onSuccess: () => void invalidateBlocks(),
  });

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const reordered = blocks.slice();
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    void reorderMutation.mutateAsync(reordered);
  }

  if (!pageId) return null;
  const page = pageQuery.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/pages" className="text-xs text-gray-500 hover:text-gray-700">
            ← Pages
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">{(page?.title as string) ?? 'Page content'}</h1>
        </div>
        {page && (
          <a
            href={page.isHome ? '/' : `/${page.slug as string}`}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            View live ↗
          </a>
        )}
      </div>

      <div className="space-y-3">
        {blocks.map((block, index) => (
          <div key={block.id} className="rounded border border-gray-200 bg-white">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {BLOCK_TYPE_LABELS[block.type] ?? block.type}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-500">{summarize(block)}</span>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30">
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === blocks.length - 1}
                className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => setExpanded((prev) => ({ ...prev, [block.id]: !prev[block.id] }))}
                className="text-xs text-gray-500 hover:text-gray-900"
              >
                {expanded[block.id] ? 'Close' : 'Edit'}
              </button>
              <button
                type="button"
                onClick={() => void removeBlockMutation.mutateAsync(block.id)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </div>
            {expanded[block.id] && (
              <div className="border-t border-gray-100 p-3">
                <BlockEditor block={block} onChange={(patch) => void updateBlockMutation.mutateAsync({ id: block.id, patch })} />
              </div>
            )}
          </div>
        ))}
        {blocks.length === 0 && <p className="text-sm text-gray-500">No blocks yet — add one below.</p>}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
        {Object.entries(BLOCK_TYPE_LABELS).map(([type, label]) => (
          <button
            key={type}
            type="button"
            onClick={() => void addBlockMutation.mutateAsync(type)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            + {label}
          </button>
        ))}
      </div>
    </div>
  );
}
