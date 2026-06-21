import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import type { Conversation, Message } from '../types';
import { chatService } from '../services/chatService';
import { websocketService } from '../services/websocketService';
import { useAuth } from './AuthContext';

interface ChatContextType {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  selectConversation: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  loadConversations: () => Promise<void>;
  createConversation: (participantId: string) => Promise<void>;
  typingUsers: Set<string>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  // Ref para sempre ter o valor atual dentro de callbacks registrados uma única vez no WS
  const currentConversationRef = useRef<Conversation | null>(null);
  useEffect(() => {
    currentConversationRef.current = currentConversation;
  }, [currentConversation]);

  const handleIncomingMessage = useCallback((message: unknown) => {
    const newMessage = message as Message;
    const activeCon = currentConversationRef.current;

    if (activeCon?.id === newMessage.conversationId) {
      setMessages(prev => [...prev, newMessage]);
      chatService.markAsRead(newMessage.id);
    }

    setConversations(prev => {
      const updated = prev.map(conv => {
        if (conv.id === newMessage.conversationId) {
          return {
            ...conv,
            lastMessage: newMessage,
            unreadCount: activeCon?.id === newMessage.conversationId
              ? 0
              : conv.unreadCount + 1
          };
        }
        return conv;
      });

      return updated.sort((a, b) => {
        const aTime = a.lastMessage?.timestamp.getTime() || 0;
        const bTime = b.lastMessage?.timestamp.getTime() || 0;
        return bTime - aTime;
      });
    });
  }, []);

  const handleTypingEvent = useCallback((event: unknown) => {
    const typingEvent = event as { conversationId: string; userId: string; isTyping: boolean };

    if (typingEvent.conversationId === currentConversationRef.current?.id) {
      setTypingUsers(prev => {
        const updated = new Set(prev);
        if (typingEvent.isTyping) {
          updated.add(typingEvent.userId);
        } else {
          updated.delete(typingEvent.userId);
        }
        return updated;
      });

      if (typingEvent.isTyping) {
        setTimeout(() => {
          setTypingUsers(prev => {
            const updated = new Set(prev);
            updated.delete(typingEvent.userId);
            return updated;
          });
        }, 3000);
      }
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadConversations();
      websocketService.on('message', handleIncomingMessage);
      websocketService.on('typing', handleTypingEvent);
    }

    return () => {
      websocketService.off('message', handleIncomingMessage);
      websocketService.off('typing', handleTypingEvent);
    };
  }, [isAuthenticated, handleIncomingMessage, handleTypingEvent]);

  const loadConversations = async () => {
    setIsLoadingConversations(true);
    try {
      const response = await chatService.getConversations();
      setConversations(response.data);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const selectConversation = async (conversationId: string) => {
    setIsLoadingMessages(true);
    try {
      const [convResponse, messagesResponse] = await Promise.all([
        chatService.getConversation(conversationId),
        chatService.getMessages(conversationId)
      ]);

      setCurrentConversation(convResponse.data);
      setMessages(messagesResponse.data);

      // Mark as read
      await chatService.markConversationAsRead(conversationId);

      // Update unread count in conversations list
      setConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
        )
      );
    } catch (error) {
      console.error('Error selecting conversation:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const createConversation = async (participantId: string) => {
    const response = await chatService.createConversation({
      type: 'private',
      participantIds: [participantId],
    });
    const newConversation = response.data;
    setConversations(prev => {
      const exists = prev.some(c => c.id === newConversation.id);
      if (exists) return prev;
      return [newConversation, ...prev];
    });
    await selectConversation(newConversation.id);
  };

  const sendMessage = async (content: string) => {
    if (!currentConversation || !content.trim()) return;

    try {
      const response = await chatService.sendMessage({
        conversationId: currentConversation.id,
        content: content.trim(),
        type: 'text'
      });

      // Add message optimistically
      setMessages(prev => [...prev, response.data]);

      // Update conversation's last message
      setConversations(prev =>
        prev.map(conv =>
          conv.id === currentConversation.id
            ? { ...conv, lastMessage: response.data }
            : conv
        )
      );
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  return (
    <ChatContext.Provider
      value={{
        conversations,
        currentConversation,
        messages,
        isLoadingConversations,
        isLoadingMessages,
        selectConversation,
        sendMessage,
        loadConversations,
        createConversation,
        typingUsers
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within ChatProvider');
  }
  return context;
}
