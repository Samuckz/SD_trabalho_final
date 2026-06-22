import { useEffect, useRef, useState } from 'react';
import { X, Search, UserMinus, UserPlus, LogOut, Pencil, Check } from 'lucide-react';
import type { Conversation, User } from '../types';
import { chatService } from '../services/chatService';
import { useChat } from '../contexts/ChatContext';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  conversation: Conversation;
  onClose: () => void;
}

type SearchState = 'idle' | 'loading' | 'found' | 'not-found';

export function GroupDetailsPanel({ conversation, onClose }: Props) {
  const { user: currentUser } = useAuth();
  const { renameGroup, addParticipants, removeParticipant, leaveGroup } = useChat();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(conversation.name || '');
  const [isSavingName, setIsSavingName] = useState(false);

  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<User[]>([]);
  const [addSearchState, setAddSearchState] = useState<SearchState>('idle');
  const [isAdding, setIsAdding] = useState<string | null>(null);

  const [isLeaving, setIsLeaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameInput(conversation.name || '');
  }, [conversation.name]);

  useEffect(() => {
    if (isEditingName) setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [isEditingName]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!addQuery.trim()) { setAddSearchState('idle'); setAddResults([]); return; }

    setAddSearchState('loading');
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await chatService.searchUsers(addQuery.trim());
        const participantIds = new Set(conversation.participants.map(p => p.id));
        const filtered = res.data.filter(u => !participantIds.has(u.id));
        setAddResults(filtered);
        setAddSearchState(filtered.length > 0 ? 'found' : 'not-found');
      } catch { setAddResults([]); setAddSearchState('not-found'); }
    }, 2000);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [addQuery, conversation.participants]);

  const handleSaveName = async () => {
    if (!nameInput.trim() || nameInput.trim() === conversation.name) {
      setIsEditingName(false);
      return;
    }
    setIsSavingName(true);
    try {
      await renameGroup(conversation.id, nameInput.trim());
      setIsEditingName(false);
    } catch (err) { console.error(err); }
    finally { setIsSavingName(false); }
  };

  const handleAddParticipant = async (user: User) => {
    setIsAdding(user.id);
    try {
      await addParticipants(conversation.id, [user.id]);
      setAddQuery('');
      setAddResults([]);
      setAddSearchState('idle');
    } catch (err) { console.error(err); }
    finally { setIsAdding(null); }
  };

  const handleRemoveParticipant = async (userId: string) => {
    setRemovingId(userId);
    try { await removeParticipant(conversation.id, userId); }
    catch (err) { console.error(err); }
    finally { setRemovingId(null); }
  };

  const handleLeave = async () => {
    setIsLeaving(true);
    try { await leaveGroup(conversation.id); onClose(); }
    catch (err) { console.error(err); }
    finally { setIsLeaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Detalhes do Grupo</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Group name */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Nome do grupo</p>
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setIsEditingName(false); }}
                  maxLength={80}
                  className="flex-1 px-3 py-1.5 bg-gray-100 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={handleSaveName} disabled={isSavingName} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50">
                  {isSavingName ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" /> : <Check className="w-4 h-4" />}
                </button>
                <button onClick={() => setIsEditingName(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">{conversation.name || 'Sem nome'}</span>
                <button onClick={() => setIsEditingName(true)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Members */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">
              Participantes · {conversation.participants.length}
            </p>
            <ul className="space-y-1">
              {conversation.participants.map(participant => (
                <li key={participant.id} className="flex items-center gap-3 py-1.5">
                  <img
                    src={participant.avatar || 'https://i.pravatar.cc/150?img=0'}
                    alt={participant.username}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                  <span className="flex-1 text-sm text-gray-900 truncate">
                    {participant.username}
                    {participant.id === currentUser?.id && (
                      <span className="ml-1 text-xs text-gray-400">(você)</span>
                    )}
                  </span>
                  {participant.id !== currentUser?.id && (
                    <button
                      onClick={() => handleRemoveParticipant(participant.id)}
                      disabled={removingId === participant.id}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Remover do grupo"
                    >
                      {removingId === participant.id
                        ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400" />
                        : <UserMinus className="w-4 h-4" />
                      }
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Add participants */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Adicionar participante</p>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={addQuery}
                onChange={e => setAddQuery(e.target.value)}
                placeholder="Buscar por nome ou e-mail..."
                className="w-full pl-9 pr-4 py-2 bg-gray-100 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {addSearchState === 'loading' && (
              <div className="flex justify-center py-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
              </div>
            )}
            {addSearchState === 'not-found' && (
              <p className="text-xs text-gray-400 text-center py-2">Nenhum usuário encontrado</p>
            )}
            {addSearchState === 'found' && (
              <ul className="space-y-1">
                {addResults.map(user => (
                  <li key={user.id} className="flex items-center gap-3 py-1.5">
                    <img src={user.avatar || 'https://i.pravatar.cc/150?img=0'} alt={user.username} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{user.username}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={() => handleAddParticipant(user)}
                      disabled={isAdding === user.id}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Adicionar ao grupo"
                    >
                      {isAdding === user.id
                        ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                        : <UserPlus className="w-4 h-4" />
                      }
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Leave group */}
        <div className="px-5 py-4 flex-shrink-0">
          <button
            onClick={handleLeave}
            disabled={isLeaving}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {isLeaving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600" /> : <LogOut className="w-4 h-4" />}
            Sair do grupo
          </button>
        </div>
      </div>
    </div>
  );
}
