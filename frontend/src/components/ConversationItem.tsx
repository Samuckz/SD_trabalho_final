import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { Users } from 'lucide-react';
import type { Conversation } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

export function ConversationItem({ conversation, isActive, onClick }: ConversationItemProps) {
  const { user: currentUser } = useAuth();

  const getDisplayName = () => {
    if (conversation.type === 'group') {
      return conversation.name || 'Grupo sem nome';
    }
    const otherUser = conversation.participants.find(p => p.id !== currentUser?.id);
    return otherUser?.username || 'Usuário';
  };

  const getAvatar = () => {
    if (conversation.type === 'group') {
      return conversation.avatar;
    }
    const otherUser = conversation.participants.find(p => p.id !== currentUser?.id);
    return otherUser?.avatar;
  };

  const getStatus = () => {
    if (conversation.type === 'group') return null;
    const otherUser = conversation.participants.find(p => p.id !== currentUser?.id);
    return otherUser?.status;
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return format(date, 'HH:mm');
    } else if (diffInHours < 24 * 7) {
      return format(date, 'EEE', { locale: ptBR });
    }
    return format(date, 'dd/MM/yy');
  };

  const status = getStatus();

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 p-4 cursor-pointer transition-colors ${
        isActive ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-gray-50'
      }`}
    >
      <div className="relative flex-shrink-0">
        {conversation.type === 'group' && !conversation.avatar ? (
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
        ) : (
          <img
            src={getAvatar() || 'https://i.pravatar.cc/150?img=0'}
            alt={getDisplayName()}
            className="w-12 h-12 rounded-full object-cover"
          />
        )}
        {status === 'online' && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
        )}
        {status === 'away' && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-yellow-500 border-2 border-white rounded-full"></div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900 truncate">{getDisplayName()}</h3>
          {conversation.lastMessage && (
            <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
              {formatTime(conversation.lastMessage.timestamp)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 truncate">
            {conversation.lastMessage?.content || 'Nenhuma mensagem'}
          </p>
          {conversation.unreadCount > 0 && (
            <span className="flex-shrink-0 ml-2 bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded-full min-w-[20px] text-center">
              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
