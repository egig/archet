import { useParams } from 'react-router';
import { ChatThreadView } from './ChatThreadView.js';

export function ChatThread() {
  const { chatId } = useParams<{ chatId: string }>();
  if (!chatId) return null;
  return <ChatThreadView chatId={chatId} />;
}
