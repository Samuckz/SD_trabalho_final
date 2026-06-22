import { useState } from 'react';
import { MoreVertical, Phone, Video, Users } from 'lucide-react';
import { ConversationList } from '../components/ConversationList';
import { MessageList } from '../components/MessageList';
import { MessageInput } from '../components/MessageInput';
import { GroupDetailsPanel } from '../components/GroupDetailsPanel';
import { useChat } from '../contexts/ChatContext';
import { useAuth } from '../contexts/AuthContext';

export function ChatPage() {
  const { currentConversation } = useChat();
  const { user: currentUser } = useAuth();
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);

  const getOtherParticipant = () => {
    if (!currentConversation) return null;
    return currentConversation.participants.find(p => p.id !== currentUser?.id) ?? null;
  };

  const getConversationName = () => {
    if (!currentConversation) return '';
    if (currentConversation.type === 'group') {
      return currentConversation.name || 'Grupo';
    }
    return getOtherParticipant()?.username || 'Usuário';
  };

  const getParticipantCount = () => {
    if (!currentConversation || currentConversation.type !== 'group') return null;
    return `${currentConversation.participants.length} participantes`;
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar - Conversation List */}
      <div className="w-full md:w-96 flex-shrink-0">
        <ConversationList />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {currentConversation ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div
                  className={`flex items-center gap-3 ${currentConversation.type === 'group' ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                  onClick={() => currentConversation.type === 'group' && setGroupPanelOpen(true)}
                  title={currentConversation.type === 'group' ? 'Ver detalhes do grupo' : undefined}
                >
                  {currentConversation.type === 'group' && !currentConversation.avatar ? (
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                  ) : (
                    <img
                      src={
                        currentConversation.type === 'group'
                          ? currentConversation.avatar
                          : getOtherParticipant()?.avatar || 'https://i.pravatar.cc/150?img=0'
                      }
                      alt={getConversationName()}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <h2 className="font-semibold text-gray-900">{getConversationName()}</h2>
                    <p className="text-xs text-gray-500">
                      {getParticipantCount() || (
                        getOtherParticipant()?.status === 'online'
                          ? 'Online'
                          : 'Offline'
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <Phone className="w-5 h-5" />
                  </button>
                  <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <Video className="w-5 h-5" />
                  </button>
                  <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <MessageList />

            {/* Message Input */}
            <MessageInput />

            {groupPanelOpen && currentConversation.type === 'group' && (
              <GroupDetailsPanel
                conversation={currentConversation}
                onClose={() => setGroupPanelOpen(false)}
              />
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center text-gray-500">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Bem-vindo ao Chat!</h3>
              <p className="text-sm">Selecione uma conversa para começar a conversar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageSquare({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
