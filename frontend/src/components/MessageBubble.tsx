import { format } from 'date-fns';
import { Check, CheckCheck } from 'lucide-react';
import type { Message } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface MessageBubbleProps {
  message: Message;
  showAvatar?: boolean;
  senderName?: string;
  senderAvatar?: string;
}

export function MessageBubble({ message, showAvatar, senderName, senderAvatar }: MessageBubbleProps) {
  const { user } = useAuth();
  const isSent = message.senderId === user?.id;

  return (
    <div className={`flex gap-2 mb-4 ${isSent ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {showAvatar && !isSent && (
        <img
          src={senderAvatar || 'https://i.pravatar.cc/150?img=0'}
          alt={senderName}
          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
        />
      )}
      {showAvatar && isSent && <div className="w-8" />}

      {/* Message Content */}
      <div className={`flex flex-col max-w-[70%] ${isSent ? 'items-end' : 'items-start'}`}>
        {showAvatar && !isSent && senderName && (
          <span className="text-xs text-gray-600 mb-1 px-3">{senderName}</span>
        )}

        <div
          className={`rounded-2xl px-4 py-2 ${
            isSent
              ? 'bg-blue-600 text-white rounded-tr-sm'
              : 'bg-gray-200 text-gray-900 rounded-tl-sm'
          }`}
        >
          <p className="break-words whitespace-pre-wrap">{message.content}</p>
        </div>

        <div className={`flex items-center gap-1 mt-1 px-2 ${isSent ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-xs text-gray-500">
            {format(message.timestamp, 'HH:mm')}
          </span>

          {isSent && (
            <div className="text-gray-500">
              {message.status === 'read' ? (
                <CheckCheck className="w-4 h-4 text-blue-600" />
              ) : message.status === 'delivered' ? (
                <CheckCheck className="w-4 h-4" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </div>
          )}
        </div>
      </div>

      {!showAvatar && !isSent && <div className="w-8" />}
    </div>
  );
}
