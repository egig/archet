import { useNavigate } from 'react-router';
import { ChatEmptyStateView } from './ChatEmptyStateView.js';

export function ChatEmptyState() {
  const navigate = useNavigate();
  return <ChatEmptyStateView onCreated={(chatId) => navigate(`/chat/${chatId}`)} />;
}
