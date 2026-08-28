import { ThreadListPrimitive, ThreadListItemPrimitive } from '@assistant-ui/react';
import { ArchiveBoxIcon, TrashIcon } from '../icons.js';

function ThreadListItem() {
  return (
    <ThreadListItemPrimitive.Root className="group flex items-center gap-1 rounded-md px-1 data-[active]:bg-gray-100">
      <ThreadListItemPrimitive.Trigger className="flex-1 truncate px-2 py-1.5 text-left text-sm text-gray-700 data-[active]:font-medium data-[active]:text-gray-900">
        <ThreadListItemPrimitive.Title fallback="New chat" />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemPrimitive.Archive
        className="hidden shrink-0 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 group-hover:block"
        aria-label="Archive chat"
      >
        <ArchiveBoxIcon className="h-3.5 w-3.5" />
      </ThreadListItemPrimitive.Archive>
      <ThreadListItemPrimitive.Delete
        className="hidden shrink-0 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-red-600 group-hover:block"
        aria-label="Delete chat"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </ThreadListItemPrimitive.Delete>
    </ThreadListItemPrimitive.Root>
  );
}

/** The thread-list rail for the standalone `/automation/chats` page. The workspace panel uses a
 * compact `<select>` switcher instead (Q19), not this. */
export function ThreadList() {
  return (
    <ThreadListPrimitive.Root className="flex h-full flex-col gap-0.5 overflow-y-auto p-2">
      <ThreadListPrimitive.Items components={{ ThreadListItem }} />
      <p className="mt-3 px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Archived</p>
      <ThreadListPrimitive.Items archived components={{ ThreadListItem }} />
    </ThreadListPrimitive.Root>
  );
}
