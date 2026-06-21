// ==================== USER TYPES ====================
export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
  createdAt: Date;
  lastSeen?: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// ==================== MESSAGE TYPES ====================
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read';
  type: 'text' | 'image' | 'file';
}

export interface SendMessageDTO {
  conversationId: string;
  content: string;
  type?: 'text' | 'image' | 'file';
}

// ==================== CONVERSATION TYPES ====================
export interface Conversation {
  id: string;
  type: 'private' | 'group';
  participants: User[];
  lastMessage?: Message;
  unreadCount: number;
  createdAt: Date;
  name?: string; // For group chats
  avatar?: string; // For group chats
}

export interface CreateConversationDTO {
  type: 'private' | 'group';
  participantIds: string[];
  name?: string; // Required for group chats
}

// ==================== WEBSOCKET TYPES ====================
export interface WebSocketMessage {
  type: 'message' | 'typing' | 'status' | 'read';
  payload: unknown;
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface StatusEvent {
  userId: string;
  status: 'online' | 'offline' | 'away';
}

export interface ReadEvent {
  conversationId: string;
  messageId: string;
  userId: string;
}

// ==================== API RESPONSE TYPES ====================
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  message: string;
  code: string;
  details?: unknown;
}
