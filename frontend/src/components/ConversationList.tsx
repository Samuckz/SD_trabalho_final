import { useState } from 'react';
import { Search, Plus, LogOut } from 'lucide-react';
import { ConversationItem } from './ConversationItem';
import { NewConversationModal } from './NewConversationModal';
import { useChat } from '../contexts/ChatContext';
import { useAuth } from '../contexts/AuthContext';

const STATUS_LABEL: Record<string, string> = {
  online: 'Online',
  offline: 'Offline',
  away: 'Ausente',
};

export function ConversationList() {
  const { conversations, currentConversation, selectConversation, isLoadingConversations } = useChat();
  const { user, logout } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (conv.type === 'group') return (conv.name || '').toLowerCase().includes(q);
    const other = conv.participants.find(p => p.id !== user?.id);
    return (other?.username || '').toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <img
              src={user?.avatar || 'https://i.pravatar.cc/150?img=0'}
              alt={user?.username}
              className="w-10 h-10 rounded-full object-cover"
            />
            <div>
              <h2 className="font-semibold text-gray-900">{user?.username}</h2>
              <p className="text-xs text-gray-500">{STATUS_LABEL[user?.status ?? ''] ?? 'Offline'}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Sair"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar conversas..."
            className="w-full pl-10 pr-4 py-2 bg-gray-100 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingConversations ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchQuery.trim() ? (
              <p className="text-sm">Nenhuma conversa encontrada</p>
            ) : (
              <>
                <p className="mb-2">Nenhuma conversa ainda</p>
                <p className="text-sm">Clique em + para iniciar</p>
              </>
            )}
          </div>
        ) : (
          filteredConversations.map(conversation => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isActive={currentConversation?.id === conversation.id}
              onClick={() => selectConversation(conversation.id)}
            />
          ))
        )}
      </div>

      {/* New Chat Button */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={() => setModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nova Conversa
        </button>
      </div>

      <NewConversationModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
