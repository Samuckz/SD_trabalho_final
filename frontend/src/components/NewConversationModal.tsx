import { useEffect, useRef, useState } from 'react';
import { X, Search } from 'lucide-react';
import type { User } from '../types';
import { chatService } from '../services/chatService';
import { useChat } from '../contexts/ChatContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type SearchState = 'idle' | 'loading' | 'found' | 'not-found';

export function NewConversationModal({ isOpen, onClose }: Props) {
  const { createConversation } = useChat();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [isCreating, setIsCreating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSearchState('idle');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setSearchState('idle');
      setResults([]);
      return;
    }

    setSearchState('loading');
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await chatService.searchUsers(query.trim());
        setResults(response.data);
        setSearchState(response.data.length > 0 ? 'found' : 'not-found');
      } catch {
        setResults([]);
        setSearchState('not-found');
      }
    }, 2000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSelectUser = async (user: User) => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      await createConversation(user.id);
      onClose();
    } catch (err) {
      console.error('Erro ao criar conversa:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Nova Conversa</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input */}
        <div className="px-5 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Results area */}
        <div className="px-5 pb-5 min-h-[120px]">
          {searchState === 'idle' && (
            <p className="text-sm text-gray-400 text-center pt-6">
              Digite um nome ou e-mail para buscar
            </p>
          )}

          {searchState === 'loading' && (
            <div className="flex items-center justify-center pt-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          )}

          {searchState === 'not-found' && (
            <p className="text-sm text-gray-400 text-center pt-6">
              Nenhum usuário encontrado com esse termo
            </p>
          )}

          {searchState === 'found' && (
            <ul className="space-y-1">
              {results.map(user => (
                <li key={user.id}>
                  <button
                    onClick={() => handleSelectUser(user)}
                    disabled={isCreating}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-left"
                  >
                    <img
                      src={user.avatar || 'https://i.pravatar.cc/150?img=0'}
                      alt={user.username}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{user.username}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
