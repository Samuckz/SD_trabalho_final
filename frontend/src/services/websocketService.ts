import type {
  Message,
  WebSocketMessage,
  TypingEvent,
  StatusEvent,
  ReadEvent
} from '../types';

type WebSocketEventHandler = (data: unknown) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private readonly wsUrl = import.meta.env.VITE_WS_URL ?? 'ws://localhost/ws';
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private eventHandlers: Map<string, WebSocketEventHandler[]> = new Map();
  private isMockMode = false;
  private currentUserId: string | null = null;

  connect(token: string, userId: string): void {
    this.currentUserId = userId;
    if (this.isMockMode) {
      this.connectMock();
      return;
    }

    try {
      this.ws = new WebSocket(`${this.wsUrl}?token=${token}`);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.emit('connected', {});
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected', event.code);
        this.emit('disconnected', {});
        if (event.code === 4001) {
          // Token inválido/expirado — limpa sessão e redireciona
          localStorage.removeItem('chat_auth_token');
          localStorage.removeItem('chat_user');
          window.location.href = '/login';
          return;
        }
        this.attemptReconnect(token);
      };
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      this.attemptReconnect(token);
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.eventHandlers.clear();
  }

  /**
   * Send message through WebSocket
   */
  send(type: string, payload: unknown): void {
    if (this.isMockMode) {
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected');
      return;
    }

    const message: WebSocketMessage = { type: type as any, payload };
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Subscribe to specific event type
   */
  on(event: string, handler: WebSocketEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Unsubscribe from event
   */
  off(event: string, handler: WebSocketEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Send typing indicator
   */
  sendTyping(conversationId: string, isTyping: boolean): void {
    if (!this.currentUserId) return;
    const event: TypingEvent = {
      conversationId,
      userId: this.currentUserId,
      isTyping
    };
    this.send('typing', event);
  }

  sendReadReceipt(conversationId: string, messageId: string): void {
    if (!this.currentUserId) return;
    const event: ReadEvent = {
      conversationId,
      messageId,
      userId: this.currentUserId
    };
    this.send('read', event);
  }

  // ==================== PRIVATE METHODS ====================

  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'message': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = message.payload as any;
        this.emit('message', {
          ...raw,
          timestamp: raw.timestamp ? new Date(raw.timestamp) : new Date(),
        } as Message);
        break;
      }
      case 'typing':
        this.emit('typing', message.payload as TypingEvent);
        break;
      case 'status':
        this.emit('status', message.payload as StatusEvent);
        break;
      case 'read':
        this.emit('read', message.payload as ReadEvent);
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  private attemptReconnect(token: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('reconnect_failed', {});
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect(token, this.currentUserId ?? '');
    }, delay);
  }

  // ==================== MOCK MODE ====================

  private connectMock(): void {
    console.log('WebSocket running in MOCK mode');
    setTimeout(() => {
      this.emit('connected', {});
    }, 500);

    // Simulate incoming messages every 30 seconds
    setInterval(() => {
      this.simulateIncomingMessage();
    }, 30000);
  }

  private simulateIncomingMessage(): void {
    const mockMessages = [
      { conversationId: 'conv_1', senderId: '2', content: 'Oi! Como está indo?' },
      { conversationId: 'conv_3', senderId: '3', content: 'Reunião confirmada para as 15h!' },
      { conversationId: 'conv_2', senderId: '3', content: 'Você viu o último update?' }
    ];

    const randomMessage = mockMessages[Math.floor(Math.random() * mockMessages.length)];

    const message: Message = {
      id: `msg_${Date.now()}`,
      conversationId: randomMessage.conversationId,
      senderId: randomMessage.senderId,
      content: randomMessage.content,
      timestamp: new Date(),
      status: 'delivered',
      type: 'text'
    };

    this.emit('message', message);
  }
}

export const websocketService = new WebSocketService();
