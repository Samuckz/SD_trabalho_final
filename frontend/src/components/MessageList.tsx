import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { useChat } from '../contexts/ChatContext';
import { useAuth } from '../contexts/AuthContext';

export function MessageList() {
  const { messages, currentConversation, isLoadingMessages, typingUsers } = useChat();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const shouldShowAvatar = (index: number) => {
    if (index === messages.length - 1) return true;
    const currentMsg = messages[index];
    const nextMsg = messages[index + 1];
    return currentMsg.senderId !== nextMsg.senderId;
  };

  const getSenderInfo = (senderId: string) => {
    const sender = currentConversation?.participants.find(p => p.id === senderId);
    return {
      name: sender?.username || 'Usuário',
      avatar: sender?.avatar
    };
  };

  if (isLoadingMessages) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando mensagens...</p>
        </div>
      </div>
    );
  }

  if (!currentConversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500">
          <p className="text-lg mb-2">Selecione uma conversa</p>
          <p className="text-sm">Escolha uma conversa da lista para começar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-gray-500">
            <p className="text-lg mb-2">Nenhuma mensagem ainda</p>
            <p className="text-sm">Seja o primeiro a enviar uma mensagem!</p>
          </div>
        </div>
      ) : (
        <>
          {messages.map((message, index) => {
            const senderInfo = getSenderInfo(message.senderId);
            return (
              <MessageBubble
                key={message.id}
                message={message}
                showAvatar={shouldShowAvatar(index)}
                senderName={currentConversation.type === 'group' ? senderInfo.name : undefined}
                senderAvatar={senderInfo.avatar}
              />
            );
          })}

          {typingUsers.size > 0 && (
            <div className="flex gap-2 mb-4">
              <div className="bg-gray-200 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
}
