import { useEffect, useRef, useState } from 'react';
import { X, Search, Users } from 'lucide-react';
import type { User } from '../types';
import { chatService } from '../services/chatService';
import { useChat } from '../contexts/ChatContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type SearchState = 'idle' | 'loading' | 'found' | 'not-found';
type Tab = 'private' | 'group';

export function NewConversationModal({ isOpen, onClose }: Props) {
  const { createConversation, createGroup } = useChat();
  const [activeTab, setActiveTab] = useState<Tab>('private');

  // Private tab
  const [privateQuery, setPrivateQuery] = useState('');
  const [privateResults, setPrivateResults] = useState<User[]>([]);
  const [privateSearchState, setPrivateSearchState] = useState<SearchState>('idle');

  // Group tab
  const [groupName, setGroupName] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [groupResults, setGroupResults] = useState<User[]>([]);
  const [groupSearchState, setGroupSearchState] = useState<SearchState>('idle');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

  const [isCreating, setIsCreating] = useState(false);
  const privateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const privateInputRef = useRef<HTMLInputElement>(null);
  const groupNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('private');
      setPrivateQuery(''); setPrivateResults([]); setPrivateSearchState('idle');
      setGroupName(''); setGroupQuery(''); setGroupResults([]); setGroupSearchState('idle');
      setSelectedUsers([]);
      setTimeout(() => privateInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => {
      if (activeTab === 'private') privateInputRef.current?.focus();
      else groupNameRef.current?.focus();
    }, 50);
  }, [activeTab, isOpen]);

  useEffect(() => {
    if (privateDebounceRef.current) clearTimeout(privateDebounceRef.current);
    if (!privateQuery.trim()) { setPrivateSearchState('idle'); setPrivateResults([]); return; }
    setPrivateSearchState('loading');
    privateDebounceRef.current = setTimeout(async () => {
      try {
        const res = await chatService.searchUsers(privateQuery.trim());
        setPrivateResults(res.data);
        setPrivateSearchState(res.data.length > 0 ? 'found' : 'not-found');
      } catch { setPrivateResults([]); setPrivateSearchState('not-found'); }
    }, 2000);
    return () => { if (privateDebounceRef.current) clearTimeout(privateDebounceRef.current); };
  }, [privateQuery]);

  useEffect(() => {
    if (groupDebounceRef.current) clearTimeout(groupDebounceRef.current);
    if (!groupQuery.trim()) { setGroupSearchState('idle'); setGroupResults([]); return; }
    setGroupSearchState('loading');
    groupDebounceRef.current = setTimeout(async () => {
      try {
        const res = await chatService.searchUsers(groupQuery.trim());
        const filtered = res.data.filter(u => !selectedUsers.some(s => s.id === u.id));
        setGroupResults(filtered);
        setGroupSearchState(filtered.length > 0 ? 'found' : 'not-found');
      } catch { setGroupResults([]); setGroupSearchState('not-found'); }
    }, 2000);
    return () => { if (groupDebounceRef.current) clearTimeout(groupDebounceRef.current); };
  }, [groupQuery, selectedUsers]);

  const handleSelectPrivateUser = async (user: User) => {
    if (isCreating) return;
    setIsCreating(true);
    try { await createConversation(user.id); onClose(); }
    catch (err) { console.error(err); }
    finally { setIsCreating(false); }
  };

  const handleAddToGroup = (user: User) => {
    if (selectedUsers.length >= 50) return;
    setSelectedUsers(prev => [...prev, user]);
    setGroupResults(prev => prev.filter(u => u.id !== user.id));
    setGroupQuery('');
    setGroupSearchState('idle');
  };

  const handleRemoveFromGroup = (userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId));
  };

  const handleCreateGroup = async () => {
    if (isCreating || !groupName.trim() || selectedUsers.length < 2) return;
    setIsCreating(true);
    try { await createGroup(groupName.trim(), selectedUsers.map(u => u.id)); onClose(); }
    catch (err) { console.error(err); }
    finally { setIsCreating(false); }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) return null;

  const canCreateGroup = groupName.trim().length > 0 && selectedUsers.length >= 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Nova Conversa</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {(['private', 'group'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'private' ? 'Conversa Privada' : 'Grupo'}
            </button>
          ))}
        </div>

        {/* ── Conversa Privada ── */}
        {activeTab === 'private' && (
          <>
            <div className="px-5 py-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={privateInputRef}
                  type="text"
                  value={privateQuery}
                  onChange={e => setPrivateQuery(e.target.value)}
                  placeholder="Buscar por nome ou e-mail..."
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-100 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="px-5 pb-5 min-h-[120px]">
              <SearchResults
                state={privateSearchState}
                results={privateResults}
                onSelect={handleSelectPrivateUser}
                disabled={isCreating}
              />
            </div>
          </>
        )}

        {/* ── Grupo ── */}
        {activeTab === 'group' && (
          <div className="px-5 py-4 flex flex-col gap-3">
            <input
              ref={groupNameRef}
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Nome do grupo"
              maxLength={80}
              className="w-full px-4 py-2.5 bg-gray-100 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedUsers.map(u => (
                  <span key={u.id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full">
                    {u.username}
                    <button onClick={() => handleRemoveFromGroup(u.id)} className="text-blue-400 hover:text-blue-700">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {selectedUsers.length < 50 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={groupQuery}
                  onChange={e => setGroupQuery(e.target.value)}
                  placeholder="Adicionar participantes..."
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-100 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="min-h-[80px]">
              {groupSearchState === 'idle' && selectedUsers.length === 0 && (
                <p className="text-sm text-gray-400 text-center pt-4">Busque e adicione pelo menos 2 participantes</p>
              )}
              {groupSearchState === 'idle' && selectedUsers.length > 0 && selectedUsers.length < 2 && (
                <p className="text-sm text-gray-400 text-center pt-4">Adicione pelo menos mais 1 participante</p>
              )}
              <SearchResults
                state={groupSearchState}
                results={groupResults}
                onSelect={handleAddToGroup}
                disabled={false}
              />
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <span className="text-xs text-gray-400">{selectedUsers.length}/50 participantes</span>
              <button
                onClick={handleCreateGroup}
                disabled={!canCreateGroup || isCreating}
                className="flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isCreating
                  ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  : <Users className="w-4 h-4" />
                }
                Criar Grupo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchResults({
  state, results, onSelect, disabled,
}: {
  state: SearchState;
  results: User[];
  onSelect: (u: User) => void;
  disabled: boolean;
}) {
  if (state === 'loading') return (
    <div className="flex items-center justify-center pt-6">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
    </div>
  );
  if (state === 'not-found') return (
    <p className="text-sm text-gray-400 text-center pt-6">Nenhum usuário encontrado</p>
  );
  if (state === 'found') return (
    <ul className="space-y-1">
      {results.map(user => (
        <li key={user.id}>
          <button
            onClick={() => onSelect(user)}
            disabled={disabled}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-left"
          >
            <img src={user.avatar || 'https://i.pravatar.cc/150?img=0'} alt={user.username} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.username}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
  return null;
}
