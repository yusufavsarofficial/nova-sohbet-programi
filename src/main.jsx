import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Archive, ArchiveRestore, Bell, CornerUpLeft, CornerUpRight, FileText, Image, Lock, Mic, Moon, MoreVertical, Paperclip, Phone, Plus, Reply, Search, Send, Settings, ShieldCheck, Smile, Square, Sun, Trash2, UserRound, Video, X } from 'lucide-react';
import { io } from 'socket.io-client';
import './styles.css';

const defaultContacts = [];
const starterMessages = {};

const storageKeys = {
  user: 'nova:user',
  contacts: 'nova:contacts',
  messages: 'nova:messages',
  settings: 'nova:settings',
};

const legacyStorageKeys = {
  user: 'kaplumbaga:user',
  contacts: 'kaplumbaga:contacts',
  messages: 'kaplumbaga:messages',
  settings: 'kaplumbaga:settings',
};

const emojis = ['😀','😃','😄','😁','😂','🤣','😊','😍','😘','😎','😢','😭','😡','👍','👎','👏','🙏','💪','🔥','🎉','❤️','💚','💙','⭐','✅','❌','🐢','📷','🎤','📎','🚀','☕','👋','🤝','👀','🌟','💯','🎁','🎈','🎂','🍰','🍕','🍔','🍟','🌮','🌯','🍿','🥤','🍺','🍷','🍸','🥂','🍎','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🥝','🍑','🥭','🍍','🥥','🥑','🍆','🥔','🥕','🌽','🥦','🥬','🥒','🍄','🥜','🌰','🍞','🥐','🥖','🥨','🥯','🥞','🧇','🧀','🍖','🍗','🥩','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🥙','🧆','🥚','🍳','🥘','🍲','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🥤','🧃','🧉','🧊','🥢','🍽️','🍴','🥄','🔪','🏺','🌍','🌎','🌏','🌐','🗺️','🗾','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','♨️','🎠','🎡','🎢','💈','🎪','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🚚','🚛','🚜','🏎️','🏍️','🛵','🦽','🦼','🛺','🚲','🛴','🛹','🚏','🛣️','🛤️','🛢️','⛽','🚨','🚥','🚦','🛑','🚧','⚓','⛵','🛶','🚤','🛳️','⛴️','🛥️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🛎️','🧳','⌛','⏳','⌚','⏰','⏱️','⏲️','🕰️','🕛','🕧','🕐','🕜','🕑','🕝','🕒','🕞','🕓','🕟','🕔','🕠','🕕','🕡','🕖','🕢','🕗','🕣','🕘','🕤','🕙','🕥','🕚','🕦','🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘','🌙','🌚','🌛','🌜','🌡️','☀️','🌝','🌞','⭐','🌟','🌠','☁️','⛅','⛈️','🌤️','🌥️','🌦️','🌧️','🌨️','🌩️','🌪️','🌫️','🌬️','🌀','🌈','🌂','☂️','☔','⛱️','⚡','❄️','☃️','⛄','☄️','🔥','💧','🌊'];
const quickReplies = ['Tamamdır', 'Birazdan döneceğim', 'Konum atar mısın?', 'Şimdi müsait değilim'];
const languageNames = {
  tr: 'Türkçe', en: 'English', es: 'Español', th: 'ไทย', de: 'Deutsch', fr: 'Français',
  it: 'Italiano', pt: 'Português', ru: 'Русский', ar: 'العربية', ja: '日本語', ko: '한국어',
  zh: '中文', hi: 'हिन्दी', nl: 'Nederlands', pl: 'Polski', uk: 'Українська', el: 'Ελληνικά',
  fa: 'فارسی', vi: 'Tiếng Việt', id: 'Bahasa Indonesia',
};
const API_BASE_URL = (typeof window !== 'undefined' && window.localStorage.getItem('kaplumbaga:apiUrl')) || import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? window.location.origin : 'http://127.0.0.1:4000');
const SOCKET_ENABLED = import.meta.env.VITE_SOCKET_ENABLED === '1' || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
const TRANSLATE_URL = import.meta.env.VITE_TRANSLATE_URL || 'https://translate.googleapis.com/translate_a/single';
const translationDictionary = {
  'hello': { tr: 'merhaba', es: 'hola' },
  'how are you': { tr: 'nasılsın', es: 'cómo estás' },
  'thank you': { tr: 'teşekkür ederim', es: 'gracias' },
  'good night': { tr: 'iyi geceler', es: 'buenas noches' },
  'merhaba': { en: 'hello', es: 'hola' },
  'nasılsın': { en: 'how are you', es: 'cómo estás' },
  'teşekkür ederim': { en: 'thank you', es: 'gracias' },
  'iyi geceler': { en: 'good night', es: 'buenas noches' },
  'hola': { tr: 'merhaba', en: 'hello' },
  'gracias': { tr: 'teşekkür ederim', en: 'thank you' },
};

function readStoredValue(key, fallback, legacyKey) {
  try {
    const value = window.localStorage.getItem(key) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

const APP_VERSION = '2.0.0';
if (typeof window !== 'undefined' && window.localStorage.getItem('kaplumbaga:version') !== APP_VERSION) {
  // Clear stale demo/localStorage data when app version changes
  ['kaplumbaga:contacts', 'kaplumbaga:messages', 'nova:contacts', 'nova:messages'].forEach((k) => window.localStorage.removeItem(k));
  window.localStorage.setItem('kaplumbaga:version', APP_VERSION);
}

function App() {
  const [user, setUser] = useState(() => readStoredValue(storageKeys.user, null, legacyStorageKeys.user));
  const [authError, setAuthError] = useState('');
  const [contactList, setContactList] = useState([]);
  const [activeContactId, setActiveContactId] = useState(null);
  const [messages, setMessages] = useState({});
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [typingContactId, setTypingContactId] = useState(null);
  const [callBanner, setCallBanner] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [messageSearch, setMessageSearch] = useState('');
  const [isEmojiPanelOpen, setIsEmojiPanelOpen] = useState(false);
  const [isQuickPanelOpen, setIsQuickPanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [userStatuses, setUserStatuses] = useState({});
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [archivedContacts, setArchivedContacts] = useState(() => readStoredValue('nova:archived', []));
  const [showArchived, setShowArchived] = useState(false);
  const [messageActionId, setMessageActionId] = useState(null);
  const [settings, setSettings] = useState(() => readStoredValue(storageKeys.settings, { compactMode: false, soundEnabled: true, language: 'tr', autoTranslate: true, darkMode: false, notifications: true }, legacyStorageKeys.settings));
  const userLanguage = settings.language || 'tr';
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesEndRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);

  const activeContact = contactList.find((contact) => contact.id === activeContactId) ?? contactList[0] ?? {
    id: null,
    name: 'Henüz sohbet yok',
    avatar: '+',
    status: 'Yeni sohbet ekleyin',
    lastMessage: '',
    time: '',
    unread: 0,
  };
  
  const getContactStatus = (contactId) => {
    const status = userStatuses[contactId];
    if (!status) return contactList.find(c => c.id === contactId)?.status || 'bilinmiyor';
    if (status.status === 'online') return 'çevrimiçi';
    if (status.lastSeen) {
      const lastSeenDate = new Date(status.lastSeen);
      const now = new Date();
      const diffMinutes = Math.floor((now - lastSeenDate) / 60000);
      if (diffMinutes < 1) return 'az önce';
      if (diffMinutes < 60) return `${diffMinutes} dakika önce`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours} saat önce`;
      return lastSeenDate.toLocaleDateString('tr-TR');
    }
    return 'çevrimdışı';
  };
  const filteredContacts = useMemo(() => {
    return contactList
      .filter((contact) => showArchived ? archivedContacts.includes(contact.id) : !archivedContacts.includes(contact.id))
      .filter((contact) => contact.name.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')));
  }, [contactList, search, archivedContacts, showArchived]);
  const visibleMessages = useMemo(() => {
    const activeMessages = messages[activeContactId] ?? [];
    const query = messageSearch.trim().toLocaleLowerCase('tr');
    return query ? activeMessages.filter((message) => message.text.toLocaleLowerCase('tr').includes(query)) : activeMessages;
  }, [activeContactId, messageSearch, messages]);

  useEffect(() => {
    if (user) {
      window.localStorage.setItem(storageKeys.user, JSON.stringify(user));
    }
  }, [user]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.contacts, JSON.stringify(contactList));
  }, [contactList]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.messages, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.settings, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    window.localStorage.setItem('nova:archived', JSON.stringify(archivedContacts));
  }, [archivedContacts]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.darkMode ? 'dark' : 'light';
  }, [settings.darkMode]);

  useEffect(() => {
    if (settings.notifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [settings.notifications]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [visibleMessages, activeContactId]);

  useEffect(() => {
    if (user?.token) {
      loadConversations(user.token);
      const interval = setInterval(() => loadConversations(user.token), 8000);
      return () => clearInterval(interval);
    }
  }, [user?.token]);

  useEffect(() => {
    if (user?.token && activeContactId) {
      loadMessages(activeContactId, user.token);
      const interval = setInterval(() => loadMessages(activeContactId, user.token), 3000);
      return () => clearInterval(interval);
    }
  }, [user?.token, activeContactId]);

  useEffect(() => {
    if (user?.token && SOCKET_ENABLED) {
      socketRef.current = io(API_BASE_URL, {
        auth: { token: user.token },
        transports: ['websocket']
      });

      socketRef.current.on('connect', () => {
        console.log('Socket bağlantısı kuruldu');
      });

      socketRef.current.on('message:new', (message) => {
        const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const incomingMessage = buildMessage({
          id: message.id,
          from: 'them',
          text: message.text,
          time: now,
          status: 'read',
          attachment: message.attachment,
          replyTo: message.replyTo || null,
        });
        if (message.conversationId === activeContactId) {
          addMessageToConversation(activeContactId, incomingMessage);
        } else {
          setMessages((current) => ({
            ...current,
            [message.conversationId]: [...(current[message.conversationId] ?? []), incomingMessage],
          }));
          setContactList((current) => current.map((c) => (
            c.id === message.conversationId
              ? { ...c, lastMessage: message.text || '📎 Ek', time: now, unread: (c.unread || 0) + 1 }
              : c
          )));
        }
        if (settings.soundEnabled) playNotificationSound();
        if (settings.notifications && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          const contact = contactList.find((c) => c.id === message.conversationId);
          new Notification(contact?.name || 'Yeni mesaj', { body: message.text || '📎 Ek dosya', icon: '/icon.png' });
        }
      });

      socketRef.current.on('typing', ({ userId, isTyping }) => {
        if (userId !== activeContactId) return;
        setTypingContactId(isTyping ? activeContactId : null);
      });

      socketRef.current.on('call:signal', async ({ from, type, payload }) => {
        if (!peerConnectionRef.current) return;
        
        if (type === 'offer') {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload));
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          socketRef.current.emit('call:signal', {
            conversationId: activeContactId,
            type: 'answer',
            payload: answer
          });
        } else if (type === 'answer') {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload));
        } else if (type === 'ice-candidate') {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload));
        }
      });

      socketRef.current.on('conversation:read', ({ conversationId, userId }) => {
        if (conversationId === activeContactId) {
          setMessages((current) => ({
            ...current,
            [activeContactId]: (current[activeContactId] ?? []).map(m => 
              m.from === 'me' ? { ...m, status: 'read' } : m
            )
          }));
        }
      });

      socketRef.current.on('user:status', ({ userId, status, lastSeen }) => {
        setUserStatuses(current => ({
          ...current,
          [userId]: { status, lastSeen }
        }));
      });

      socketRef.current.emit('status:online');

      return () => {
        socketRef.current?.emit('status:offline');
        socketRef.current?.disconnect();
      };
    }
  }, [user?.token, activeContactId]);

  function formatMessageTime(value) {
    const date = value ? new Date(Number(value)) : new Date();
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  function normalizeConversation(conversation) {
    const isGroup = Boolean(conversation.is_group || conversation.isGroup);
    const otherUser = conversation.otherUser || conversation.other_user;
    const updatedAt = conversation.updated_at || conversation.updatedAt || Date.now();
    const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
    const unreadEntry = participants.find((participant) => (
      (participant.user_id || participant.userId || participant) === user?.id
    ));

    return {
      id: conversation.id,
      userId: otherUser?.id || null,
      name: isGroup ? (conversation.group_name || conversation.groupName || 'Grup') : (otherUser?.name || 'Sohbet'),
      avatar: isGroup ? '👥' : buildAvatar(otherUser?.name || 'S'),
      status: isGroup ? `${Math.max(participants.length, 1)} kişi` : (otherUser?.phone || 'çevrimiçi'),
      lastMessage: conversation.last_message || conversation.lastMessage || 'Yeni sohbet başlatıldı.',
      time: formatMessageTime(updatedAt),
      unread: Number(unreadEntry?.unread || 0),
      isGroup,
    };
  }

  function normalizeMessage(message) {
    const senderId = message.sender_id || message.senderId;
    const createdAt = message.created_at || message.createdAt || Date.now();

    return buildMessage({
      id: message.id,
      from: senderId === user?.id ? 'me' : 'them',
      text: message.text || '',
      time: formatMessageTime(createdAt),
      status: message.status || 'sent',
      attachment: message.attachment || null,
      editedAt: message.edited_at || message.editedAt || null,
    });
  }

  async function loadConversations(token = user?.token) {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'Sohbetler alınamadı.');

      const contacts = (result.conversations || []).map(normalizeConversation).filter((contact) => contact.id);
      setContactList(contacts);
      setActiveContactId((current) => current || contacts[0]?.id || null);
    } catch (error) {
      console.error('Sohbet yükleme hatası:', error);
    }
  }

  async function loadMessages(conversationId, token = user?.token) {
    if (!conversationId || !token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'Mesajlar alınamadı.');

      setMessages((current) => ({
        ...current,
        [conversationId]: (result.messages || []).map(normalizeMessage),
      }));
    } catch (error) {
      console.error('Mesaj yükleme hatası:', error);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setAuthError('');
    const formData = new FormData(event.currentTarget);
    const name = formData.get('name').trim();
    const contact = formData.get('contact').trim();
    const password = formData.get('password').trim();
    const key = formData.get('key').trim();

    if (!name || !contact || password.length < 6) {
      setAuthError('Ad, telefon ve en az 6 karakter şifre gerekli.');
      return;
    }

    const verifiedAt = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    try {
      let response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: contact, password }),
      });

      if (response.status === 401) {
        if (!key) {
          throw new Error('Yeni kayıt için kayıt anahtarı gerekli.');
        }
        response = await fetch(`${API_BASE_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone: contact, password, language: userLanguage, key }),
        });
      }

      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'Giriş başarısız.');

      setUser({ ...result.user, contact: result.user.phone, token: result.token, verifiedAt });
    } catch (error) {
      setAuthError(error.message || 'Canli API baglantisi kurulamadi. Lutfen tekrar deneyin.');
    }
  }

  function selectContact(contactId) {
    if (!contactId) return;
    setActiveContactId(contactId);
    setContactList((current) => current.map((contact) => (
      contact.id === contactId ? { ...contact, unread: 0 } : contact
    )));
    loadMessages(contactId);
    
    if (socketRef.current && user?.token) {
      socketRef.current.emit('conversation:join', { conversationId: contactId });
      fetch(`${API_BASE_URL}/api/conversations/${contactId}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${user.token}` }
      }).catch(console.error);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();

    if (!text || !activeContactId) {
      return;
    }

    const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const replySnapshot = replyToMessage ? { id: replyToMessage.id, text: replyToMessage.text, from: replyToMessage.from } : null;
    const outgoingMessage = buildMessage({ from: 'me', text, time: now, status: 'sent', replyTo: replySnapshot });

    addMessageToConversation(activeContactId, outgoingMessage);
    setContactList((current) => moveContactToTop(current.map((contact) => (
      contact.id === activeContactId
        ? { ...contact, lastMessage: text, time: now, unread: 0 }
        : contact
    )), activeContactId));
    setDraft('');
    setReplyToMessage(null);
    setTypingContactId(activeContactId);

    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations/${activeContactId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ text, replyTo: replySnapshot }),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'Mesaj gönderilemedi.');

      setMessages((current) => ({
        ...current,
        [activeContactId]: (current[activeContactId] ?? []).map((message) => (
          message.id === outgoingMessage.id
            ? { ...message, id: result.message.id, status: 'delivered' }
            : message
        )),
      }));
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [activeContactId]: (current[activeContactId] ?? []).map((message) => (
          message.id === outgoingMessage.id ? { ...message, status: 'failed' } : message
        )),
      }));
      setCallBanner(error.message || 'Mesaj gönderilemedi.');
      window.setTimeout(() => setCallBanner(''), 2500);
    } finally {
      setTypingContactId(null);
    }
  }

  function appendToDraft(value) {
    setDraft((current) => `${current}${current ? ' ' : ''}${value}`);
  }

  function addMessageToConversation(contactId, message) {
    setMessages((current) => ({
      ...current,
      [contactId]: [
        ...(current[contactId] ?? []),
        message,
      ],
    }));
    requestRealTranslation(message, contactId);
  }

  function attachPhoto() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file || !activeContactId) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${user.token}` },
        body: formData
      });
      
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'Dosya yüklenemedi.');
      
      const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');
      const text = isImage ? `📷 ${file.name}` : isAudio ? `🎤 ${file.name}` : `📎 ${file.name}`;
      const message = buildMessage({
        from: 'me',
        text,
        time: now,
        status: 'sent',
        attachment: {
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          url: `${API_BASE_URL}${result.file.url}`
        },
      });

      addMessageToConversation(activeContactId, message);
      await fetch(`${API_BASE_URL}/api/conversations/${activeContactId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ text, attachment: message.attachment }),
      });
      setContactList((current) => moveContactToTop(current.map((contact) => (
        contact.id === activeContactId
          ? { ...contact, lastMessage: text, time: now, unread: 0 }
          : contact
      )), activeContactId));
    } catch (error) {
      console.error('Dosya yükleme hatası:', error);
      setCallBanner('Dosya yüklenemedi.');
      window.setTimeout(() => setCallBanner(''), 2200);
    }
    event.target.value = '';
  }

  function attachDemoPhoto() {
    const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const text = '📷 Fotoğraf eklendi';

    addMessageToConversation(activeContactId, buildMessage({ from: 'me', text, time: now, status: 'sent', attachment: 'image' }));
    setContactList((current) => moveContactToTop(current.map((contact) => (
      contact.id === activeContactId
        ? { ...contact, lastMessage: text, time: now, unread: 0 }
        : contact
    )), activeContactId));
  }

  async function startCall(type) {
    if (!activeContactId) return;
    setCallBanner(`${activeContact.name} için ${type === 'video' ? 'görüntülü' : 'sesli'} arama başlatılıyor...`);
    let stream = null;
    let error = '';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      error = 'Tarayıcınız aramayı desteklemiyor.';
      setActiveCall({ type, contact: activeContact, startedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), muted: false, cameraOff: false, stream: null, error, remoteStream: null });
      window.setTimeout(() => setCallBanner(''), 3000);
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true });
      
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ]
      });
      
      peerConnectionRef.current = pc;
      
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
      
      pc.ontrack = (event) => {
        setActiveCall(current => {
          if (!current) return current;
          return { ...current, remoteStream: event.streams[0] };
        });
      };
      
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('call:signal', {
            conversationId: activeContactId,
            type: 'ice-candidate',
            payload: event.candidate
          });
        }
      };
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socketRef.current?.emit('call:signal', {
        conversationId: activeContactId,
        type: 'offer',
        payload: offer
      });
      
    } catch (err) {
      console.error('Call error:', err);
      if (err.name === 'NotAllowedError') {
        error = 'Kamera/mikrofon izni reddedildi.';
      } else if (err.name === 'NotFoundError') {
        error = 'Kamera veya mikrofon bulunamadı.';
      } else if (err.name === 'NotReadableError') {
        error = 'Kamera/mikrofon başka uygulama tarafından kullanılıyor.';
      } else {
        error = 'Arama başlatılamadı. HTTPS kullanın.';
      }
    }

    setActiveCall({ type, contact: activeContact, startedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), muted: false, cameraOff: false, stream, error, remoteStream: null });
    window.setTimeout(() => setCallBanner(''), 3000);
  }

  function endCall() {
    activeCall?.stream?.getTracks().forEach((track) => track.stop());
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    setActiveCall(null);
  }

  function toggleMute() {
    setActiveCall((current) => {
      if (!current) return current;
      current.stream?.getAudioTracks().forEach((track) => {
        track.enabled = current.muted;
      });
      return { ...current, muted: !current.muted };
    });
  }

  function toggleCamera() {
    setActiveCall((current) => {
      if (!current) return current;
      current.stream?.getVideoTracks().forEach((track) => {
        track.enabled = current.cameraOff;
      });
      return { ...current, cameraOff: !current.cameraOff };
    });
  }

  async function toggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCallBanner('Tarayıcınız ses kaydını desteklemiyor.');
      window.setTimeout(() => setCallBanner(''), 3000);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
          const message = buildMessage({
            from: 'me',
            text: '🎤 Ses kaydı',
            time: now,
            status: 'sent',
            attachment: {
              name: `ses-kaydi-${Date.now()}.webm`,
              type: blob.type,
              size: blob.size,
              dataUrl: reader.result,
            },
          });
          addMessageToConversation(activeContactId, message);
          setContactList((current) => moveContactToTop(current.map((contact) => (
            contact.id === activeContactId
              ? { ...contact, lastMessage: '🎤 Ses kaydı', time: now, unread: 0 }
              : contact
          )), activeContactId));
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Mikrofon hatası:', error);
      if (error.name === 'NotAllowedError') {
        setCallBanner('Mikrofon izni reddedildi. Tarayıcı ayarlarından izin verin.');
      } else if (error.name === 'NotFoundError') {
        setCallBanner('Mikrofon bulunamadı.');
      } else {
        setCallBanner('Mikrofon erişimi başarısız. HTTPS kullanın.');
      }
      window.setTimeout(() => setCallBanner(''), 4000);
    }
  }

  function saveProfile(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get('name').trim();
    const about = formData.get('about').trim();

    if (!name) {
      return;
    }

    setUser((current) => ({ ...current, name, about }));
    setIsEditingProfile(false);
  }

  async function addContact(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get('name').trim();
    const phone = formData.get('phone').trim();

    if (!name || !phone) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ phone, displayName: name })
      });
      const result = await response.json();
      if (result.ok) {
        const id = result.conversation.id;
        const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const newContact = {
          id,
          userId: result.contact.id,
          name: result.contact.displayName || result.contact.name,
          avatar: buildAvatar(result.contact.name),
          status: 'çevrimiçi',
          lastMessage: 'Yeni sohbet başlatıldı.',
          time,
          unread: 0,
        };

        setContactList((current) => [newContact, ...current]);
        setMessages((current) => ({
          ...current,
          [id]: [
            {
              id: Date.now() + 1,
              from: 'them',
              text: `${result.contact.name} kişisi Kaplumbağa rehberine eklendi.`,
              time,
              status: 'read',
            },
          ],
        }));
        setActiveContactId(id);
        loadMessages(id);
        setIsAddingContact(false);
        setSearch('');
      }
    } catch (error) {
      console.error('Kişi ekleme hatası:', error);
    }
  }

  async function createGroup(event) {
    event.preventDefault();
    const participantIds = selectedContacts
      .map((contactId) => contactList.find((contact) => contact.id === contactId)?.userId)
      .filter(Boolean);
    if (!groupName.trim() || participantIds.length < 1) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ name: groupName.trim(), participantIds })
      });
      const result = await response.json();
      if (result.ok) {
        const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const newGroup = {
          id: result.conversation.id,
          name: groupName.trim(),
          avatar: '👥',
          status: `${participantIds.length + 1} kişi`,
          lastMessage: 'Grup oluşturuldu.',
          time,
          unread: 0,
          isGroup: true,
        };

        setContactList((current) => [newGroup, ...current]);
        setMessages((current) => ({
          ...current,
          [newGroup.id]: [
            {
              id: Date.now() + 1,
              from: 'them',
              text: `${groupName} grubu oluşturuldu.`,
              time,
              status: 'read',
            },
          ],
        }));
        setActiveContactId(newGroup.id);
        setIsCreatingGroup(false);
        setGroupName('');
        setSelectedContacts([]);
      }
    } catch (error) {
      console.error('Grup oluşturma hatası:', error);
    }
  }

  function toggleContactSelection(contactId) {
    setSelectedContacts(current => 
      current.includes(contactId) 
        ? current.filter(id => id !== contactId)
        : [...current, contactId]
    );
  }

  function archiveContact(contactId) {
    setArchivedContacts((current) => current.includes(contactId) ? current.filter((id) => id !== contactId) : [...current, contactId]);
    setMessageActionId(null);
  }

  function deleteChat(contactId) {
    if (!window.confirm('Bu sohbeti tamamen silmek istediğinize emin misiniz?')) return;
    setContactList((current) => current.filter((c) => c.id !== contactId));
    setMessages((current) => {
      const next = { ...current };
      delete next[contactId];
      return next;
    });
    setArchivedContacts((current) => current.filter((id) => id !== contactId));
    if (activeContactId === contactId) setActiveContactId(null);
    setMessageActionId(null);
  }

  function startReply(message) {
    setReplyToMessage(message);
    setForwardingMessage(null);
    setMessageActionId(null);
  }

  function startForward(message) {
    setForwardingMessage(message);
    setMessageActionId(null);
  }

  async function forwardMessageTo(targetContactId) {
    if (!forwardingMessage || !targetContactId) return;
    const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const text = forwardingMessage.text;
    const message = buildMessage({ from: 'me', text, time: now, status: 'sent', forwarded: true, attachment: forwardingMessage.attachment || null });
    addMessageToConversation(targetContactId, message);
    setContactList((current) => moveContactToTop(current.map((contact) => (
      contact.id === targetContactId
        ? { ...contact, lastMessage: text || '📎 İletilen', time: now }
        : contact
    )), targetContactId));
    try {
      await fetch(`${API_BASE_URL}/api/conversations/${targetContactId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ text, attachment: forwardingMessage.attachment || null, forwarded: true }),
      });
    } catch (error) {
      console.error('İletme hatası:', error);
    }
    setForwardingMessage(null);
    setActiveContactId(targetContactId);
  }

  function logout() {
    window.localStorage.removeItem(storageKeys.user);
    window.localStorage.removeItem(legacyStorageKeys.user);
    setUser(null);
    setIsEditingProfile(false);
  }

  function clearConversation() {
    const clearedTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    setMessages((current) => ({ ...current, [activeContactId]: [] }));
    setContactList((current) => current.map((contact) => (
      contact.id === activeContactId
        ? { ...contact, lastMessage: 'Sohbet temizlendi.', time: clearedTime, unread: 0 }
        : contact
    )));
    setMessageSearch('');
  }

  async function deleteMessage(messageId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      if (response.ok) {
        setMessages((current) => ({
          ...current,
          [activeContactId]: (current[activeContactId] ?? []).filter(m => m.id !== messageId)
        }));
      }
    } catch (error) {
      console.error('Mesaj silme hatası:', error);
    }
  }

  function startEditingMessage(message) {
    setEditingMessageId(message.id);
    setEditDraft(message.text);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setEditDraft('');
  }

  async function saveEdit() {
    if (!editDraft.trim()) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/${editingMessageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ text: editDraft.trim() })
      });
      if (response.ok) {
        setMessages((current) => ({
          ...current,
          [activeContactId]: (current[activeContactId] ?? []).map(m => 
            m.id === editingMessageId ? { ...m, text: editDraft.trim(), editedAt: Date.now() } : m
          )
        }));
        cancelEdit();
      }
    } catch (error) {
      console.error('Mesaj düzenleme hatası:', error);
    }
  }

  function resetDemoData() {
    window.localStorage.removeItem(storageKeys.contacts);
    window.localStorage.removeItem(storageKeys.messages);
    window.localStorage.removeItem(legacyStorageKeys.contacts);
    window.localStorage.removeItem(legacyStorageKeys.messages);
    setContactList(defaultContacts);
    setMessages(starterMessages);
    setActiveContactId(null);
    setMessageSearch('');
  }

  function moveContactToTop(items, contactId) {
    const selected = items.find((contact) => contact.id === contactId);
    const rest = items.filter((contact) => contact.id !== contactId);
    return selected ? [selected, ...rest] : items;
  }

  function buildAvatar(name) {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase('tr');
  }

  function detectLanguageHeuristic(text) {
    if (!text) return userLanguage;
    if (/[\u0E00-\u0E7F]/.test(text)) return 'th';
    if (/[\u0600-\u06FF]/.test(text)) return 'ar';
    if (/[\u0590-\u05FF]/.test(text)) return 'he';
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
    if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
    if (/[\u0900-\u097F]/.test(text)) return 'hi';
    if (/[\u0400-\u04FF]/.test(text)) return 'ru';
    if (/[\u0370-\u03FF]/.test(text)) return 'el';
    if (/[ğüşıöçĞÜŞİÖÇ]/.test(text)) return 'tr';
    if (/[áéíóúñ¿¡]/i.test(text)) return 'es';
    if (/[äöüß]/i.test(text)) return 'de';
    if (/[àâçéèêëîïôûùüÿœæ]/i.test(text)) return 'fr';
    return 'en';
  }

  async function requestRealTranslation(message, contactId) {
    if (!settings.autoTranslate || !message.text) return;
    if (message.sourceLang && message.sourceLang === userLanguage) return;

    try {
      const url = `${TRANSLATE_URL}?client=gtx&sl=auto&tl=${encodeURIComponent(userLanguage)}&dt=t&q=${encodeURIComponent(message.text)}`;
      const response = await fetch(url);
      if (!response.ok) return;

      const result = await response.json();
      let translatedText = '';
      let detectedLang = message.sourceLang;

      if (Array.isArray(result) && Array.isArray(result[0])) {
        translatedText = result[0].map((segment) => segment?.[0] || '').join('');
        detectedLang = result[2] || detectedLang;
      } else if (result.translatedText) {
        translatedText = result.translatedText;
        detectedLang = result.detectedSourceLanguage || detectedLang;
      }

      if (!translatedText || translatedText === message.text) return;

      setMessages((current) => ({
        ...current,
        [contactId]: (current[contactId] ?? []).map((item) => (
          item.id === message.id
            ? { ...item, translatedText, sourceLang: detectedLang, translationProvider: 'google' }
            : item
        )),
      }));
    } catch {
    }
  }

  function playNotificationSound() {
    if (!settings.soundEnabled) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      gain.gain.setValueAtTime(0.001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch {
    }
  }

  function buildMessage(message) {
    const sourceLang = detectLanguageHeuristic(message.text);
    return {
      id: message.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      translatedText: null,
      sourceLang,
      ...message,
    };
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} authError={authError} />;
  }

  return (
    <main className={`app-shell ${settings.compactMode ? 'compact-mode' : ''}`}>
      <aside className="sidebar">
        <div className="profile-bar">
          <button className="avatar self" type="button" onClick={() => setIsEditingProfile(true)}>{user.name.slice(0, 2).toLocaleUpperCase('tr')}</button>
          <div className="app-identity">
            <span className="sidebar-logo">🐢</span>
            <span>Kaplumbağa</span>
          </div>
          <div>
            <strong>{user.name}</strong>
            <span>{user.about || `Doğrulandı: ${user.verifiedAt}`}</span>
          </div>
          <button className="menu-button" type="button" onClick={() => setIsSettingsOpen((current) => !current)} aria-label="Ayarlar"><Settings size={21} /></button>
        </div>

        {isSettingsOpen && (
          <section className="settings-panel">
            <strong>Kaplumbağa Ayarları</strong>
            <label>
              Dil
              <select value={userLanguage} onChange={(event) => setSettings((current) => ({ ...current, language: event.target.value }))}>
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="th">ไทย (Tayca)</option>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
                <option value="it">Italiano</option>
                <option value="pt">Português</option>
                <option value="ru">Русский</option>
                <option value="ar">العربية</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
                <option value="zh">中文</option>
                <option value="hi">हिन्दी</option>
                <option value="fa">فارسی</option>
                <option value="vi">Tiếng Việt</option>
                <option value="id">Bahasa Indonesia</option>
                <option value="el">Ελληνικά</option>
                <option value="nl">Nederlands</option>
                <option value="pl">Polski</option>
                <option value="uk">Українська</option>
              </select>
            </label>
            <label>
              <input type="checkbox" checked={settings.autoTranslate} onChange={(event) => setSettings((current) => ({ ...current, autoTranslate: event.target.checked }))} />
              Otomatik çeviri
            </label>
            <label>
              <input type="checkbox" checked={settings.compactMode} onChange={(event) => setSettings((current) => ({ ...current, compactMode: event.target.checked }))} />
              Kompakt görünüm
            </label>
            <label>
              <input type="checkbox" checked={settings.soundEnabled} onChange={(event) => setSettings((current) => ({ ...current, soundEnabled: event.target.checked }))} />
              Bildirim sesi
            </label>
            <label>
              <input type="checkbox" checked={settings.notifications} onChange={(event) => setSettings((current) => ({ ...current, notifications: event.target.checked }))} />
              Masaüstü bildirimleri
            </label>
            <label>
              <input type="checkbox" checked={settings.darkMode} onChange={(event) => setSettings((current) => ({ ...current, darkMode: event.target.checked }))} />
              {settings.darkMode ? <><Moon size={14}/> Karanlık mod</> : <><Sun size={14}/> Aydınlık mod</>}
            </label>
            <label>
              Sunucu (API) URL
              <input
                type="url"
                placeholder="https://kaplumbaga-api.onrender.com"
                defaultValue={window.localStorage.getItem('kaplumbaga:apiUrl') || ''}
                onBlur={(e) => {
                  const v = e.target.value.trim().replace(/\/$/, '');
                  if (v) window.localStorage.setItem('kaplumbaga:apiUrl', v);
                  else window.localStorage.removeItem('kaplumbaga:apiUrl');
                }}
              />
            </label>
            <button type="button" onClick={() => window.location.reload()}>Sunucuyu yeniden bağla</button>
            <button type="button" onClick={resetDemoData}>Demo verileri sıfırla</button>
            <button type="button" onClick={logout}>Çıkış yap</button>
          </section>
        )}

        {isEditingProfile && (
          <form className="profile-editor" onSubmit={saveProfile}>
            <label>
              <span>Profil adı</span>
              <input name="name" defaultValue={user.name} />
            </label>
            <label>
              <span>Hakkımda</span>
              <input name="about" defaultValue={user.about || ''} />
            </label>
            <div>
              <button type="button" onClick={() => setIsEditingProfile(false)}>Vazgeç</button>
              <button type="submit">Kaydet</button>
            </div>
          </form>
        )}

        <label className="search-box">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sohbetlerde ara" />
        </label>

        <button className="new-chat-button" type="button" onClick={() => setIsAddingContact((current) => !current)}>
          {isAddingContact ? <X size={18} /> : <Plus size={18} />}
          Yeni Sohbet
        </button>
        <button className="new-chat-button" type="button" onClick={() => setIsCreatingGroup((current) => !current)}>
          {isCreatingGroup ? <X size={18} /> : <Plus size={18} />}
          Yeni Grup
        </button>

        {isAddingContact && (
          <form className="profile-editor contact-editor" onSubmit={addContact}>
            <label>
              <span>Kişi adı</span>
              <input name="name" placeholder="Örn. Ali Veli" />
            </label>
            <label>
              <span>Telefon</span>
              <input name="phone" placeholder="+90 555 111 22 33" />
            </label>
            <div>
              <button type="button" onClick={() => setIsAddingContact(false)}>Vazgeç</button>
              <button type="submit">Ekle</button>
            </div>
          </form>
        )}

        {isCreatingGroup && (
          <form className="profile-editor contact-editor" onSubmit={createGroup}>
            <label>
              <span>Grup adı</span>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Örn. Aile Grubu" />
            </label>
            <label>
              <span>Katılımcılar seçin ({selectedContacts.length})</span>
              <div className="contact-selection">
                {contactList.map(contact => (
                  <button
                    key={contact.id}
                    type="button"
                    className={`contact-select-item ${selectedContacts.includes(contact.id) ? 'selected' : ''}`}
                    onClick={() => toggleContactSelection(contact.id)}
                  >
                    <div className="avatar">{contact.avatar}</div>
                    <span>{contact.name}</span>
                  </button>
                ))}
              </div>
            </label>
            <div>
              <button type="button" onClick={() => setIsCreatingGroup(false)}>Vazgeç</button>
              <button type="submit">Oluştur</button>
            </div>
          </form>
        )}

        <button className="archive-toggle" type="button" onClick={() => setShowArchived((current) => !current)}>
          {showArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          {showArchived ? `Aktif sohbetlere dön` : `Arşivlenmiş sohbetler (${archivedContacts.length})`}
        </button>

        <div className="contact-list">
          {filteredContacts.map((contact) => (
            <div className={`contact-card-wrapper ${contact.id === activeContactId ? 'active' : ''}`} key={contact.id}>
              <button
                className="contact-card"
                onClick={() => forwardingMessage ? forwardMessageTo(contact.id) : selectContact(contact.id)}
              >
                <div className="avatar">{contact.avatar}</div>
                <div className="contact-info">
                  <div className="contact-top">
                    <strong>{contact.name}</strong>
                    <span>{contact.time}</span>
                  </div>
                  <div className="contact-bottom">
                    <span>{contact.lastMessage}</span>
                    {contact.unread > 0 && <b>{contact.unread}</b>}
                  </div>
                </div>
              </button>
              <div className="contact-actions">
                <button type="button" onClick={() => archiveContact(contact.id)} aria-label={archivedContacts.includes(contact.id) ? 'Arşivden çıkar' : 'Arşivle'}>
                  {archivedContacts.includes(contact.id) ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                </button>
                <button type="button" onClick={() => deleteChat(contact.id)} aria-label="Sohbeti sil">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          {filteredContacts.length === 0 && (
            <div className="empty-contacts">
              {showArchived ? 'Arşivlenmiş sohbet yok.' : 'Henüz sohbet yok. "Yeni Sohbet" ile başlayın.'}
            </div>
          )}
        </div>

        {forwardingMessage && (
          <div className="forward-banner">
            <CornerUpRight size={16} />
            <span>Bir kişi seçin: "{forwardingMessage.text?.slice(0, 30)}..."</span>
            <button type="button" onClick={() => setForwardingMessage(null)} aria-label="İptal"><X size={14} /></button>
          </div>
        )}
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div className="avatar large">{activeContact.avatar}</div>
          <div>
            <strong>{activeContact.name}</strong>
            <span>{typingContactId === activeContactId ? 'yazıyor...' : getContactStatus(activeContact.id)}</span>
          </div>
          <div className="header-actions">
            <button type="button" onClick={() => startCall('video')} aria-label="Görüntülü ara"><Video size={21} /></button>
            <button type="button" onClick={() => startCall('audio')} aria-label="Sesli ara"><Phone size={20} /></button>
            <button type="button" onClick={clearConversation} aria-label="Sohbeti temizle"><Trash2 size={20} /></button>
          </div>
        </header>

        {callBanner && <div className="call-banner">{callBanner}</div>}

        {activeCall && (
          <div className="call-screen">
            <div className="call-card">
              <div className="turtle-logo call-logo">🐢</div>
              <h2>{activeCall.contact.name}</h2>
              <p>{activeCall.type === 'video' ? 'Görüntülü arama' : 'Sesli arama'} devam ediyor · {activeCall.startedAt}</p>
              {activeCall.error && <p className="call-error">{activeCall.error}</p>}
              {activeCall.type === 'video' && activeCall.stream && (
                <video
                  className="video-preview live-video"
                  autoPlay
                  muted
                  playsInline
                  ref={(video) => {
                    if (video && video.srcObject !== activeCall.stream) {
                      video.srcObject = activeCall.stream;
                    }
                  }}
                />
              )}
              {activeCall.type === 'video' && activeCall.remoteStream && (
                <video
                  className="video-preview remote-video"
                  autoPlay
                  playsInline
                  ref={(video) => {
                    if (video && video.srcObject !== activeCall.remoteStream) {
                      video.srcObject = activeCall.remoteStream;
                    }
                  }}
                />
              )}
              {activeCall.type === 'video' && !activeCall.stream && <div className="video-preview">Kamera önizlemesi bekleniyor</div>}
              <div className="call-controls">
                <button type="button" onClick={toggleMute}>{activeCall.muted ? 'Mikrofon Aç' : 'Sessize Al'}</button>
                {activeCall.type === 'video' && <button type="button" onClick={toggleCamera}>{activeCall.cameraOff ? 'Kamera Aç' : 'Kamera Kapat'}</button>}
                <button className="end-call" type="button" onClick={endCall}>Aramayı Bitir</button>
              </div>
            </div>
          </div>
        )}

        <div className="security-note">
          <ShieldCheck size={17} />
          Mesajlarınız bu demo arayüzde tarayıcı oturumu boyunca saklanır.
        </div>

        <label className="message-search">
          <Search size={17} />
          <input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Bu sohbette ara" />
          {messageSearch && <button type="button" onClick={() => setMessageSearch('')} aria-label="Aramayı temizle"><X size={16} /></button>}
        </label>

        <div className="messages">
          {visibleMessages.map((message) => (
            <div className={`message-row ${message.from}`} key={message.id}>
              <div className="message-bubble">
                {message.forwarded && (
                  <div className="forwarded-badge"><CornerUpRight size={12} /> İletildi</div>
                )}
                {message.replyTo && (
                  <div className="reply-preview-bubble">
                    <Reply size={12} />
                    <span className="reply-author">{message.replyTo.from === 'me' ? 'Siz' : activeContact.name}</span>
                    <span className="reply-text">{message.replyTo.text}</span>
                  </div>
                )}
                {editingMessageId === message.id ? (
                  <div className="edit-mode">
                    <input
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                      autoFocus
                    />
                    <div className="edit-actions">
                      <button type="button" onClick={cancelEdit} size={16}><X size={16} /></button>
                      <button type="button" onClick={saveEdit} size={16}><Send size={16} /></button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>{message.text}</p>
                    {message.editedAt && <span className="edited-badge">Düzenlendi</span>}
                  </>
                )}
                {message.attachment?.type?.startsWith('image/') && (
                  <img className="attachment-preview" src={message.attachment.url || message.attachment.dataUrl} alt={message.attachment.name} />
                )}
                {message.attachment?.type?.startsWith('audio/') && (
                  <audio className="audio-preview" src={message.attachment.url || message.attachment.dataUrl} controls />
                )}
                {message.attachment && !message.attachment.type?.startsWith('image/') && !message.attachment.type?.startsWith('audio/') && (
                  <a className="file-preview" href={message.attachment.url || message.attachment.dataUrl} download={message.attachment.name}>
                    <FileText size={18} />
                    {message.attachment.name}
                  </a>
                )}
                {message.translatedText && (
                  <p className="translated-text">
                    <span className="translated-label">{languageNames[message.sourceLang] || message.sourceLang || 'Otomatik'} → {languageNames[userLanguage] || userLanguage}</span>
                    {message.translatedText}
                  </p>
                )}
                <time>
                  {message.time} {message.from === 'me' && <span className={`message-status ${message.status}`}>{message.status === 'read' ? '✓✓' : message.status === 'delivered' ? '✓✓' : '✓'}</span>}
                  {editingMessageId !== message.id && (
                    <>
                      <button className="message-action" onClick={() => startReply(message)} title="Yanıtla"><CornerUpLeft size={14} /></button>
                      <button className="message-action" onClick={() => startForward(message)} title="İlet"><CornerUpRight size={14} /></button>
                      {message.from === 'me' && (
                        <>
                          <button className="message-action" onClick={() => startEditingMessage(message)} title="Düzenle"><Settings size={14} /></button>
                          <button className="message-action" onClick={() => deleteMessage(message.id)} title="Sil"><Trash2 size={14} /></button>
                        </>
                      )}
                    </>
                  )}
                </time>
              </div>
            </div>
          ))}
          {visibleMessages.length === 0 && (
            <div className="empty-chat">
              {messageSearch ? 'Aramanızla eşleşen mesaj bulunamadı.' : 'Henüz mesaj yok. İlk mesajı yazın.'}
            </div>
          )}
          {typingContactId === activeContactId && (
            <div className="message-row them">
              <div className="typing-bubble">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {replyToMessage && (
          <div className="reply-preview-bar">
            <Reply size={14} />
            <div className="reply-preview-info">
              <strong>{replyToMessage.from === 'me' ? 'Siz' : activeContact.name}</strong>
              <span>{replyToMessage.text}</span>
            </div>
            <button type="button" onClick={() => setReplyToMessage(null)} aria-label="İptal"><X size={14} /></button>
          </div>
        )}

        <form className="composer" onSubmit={sendMessage}>
          <input ref={fileInputRef} className="hidden-file-input" type="file" onChange={handleFileSelected} />
          {(isEmojiPanelOpen || isQuickPanelOpen) && (
            <div className="composer-panel">
              {isEmojiPanelOpen && emojis.map((emoji) => (
                <button type="button" key={emoji} onClick={() => appendToDraft(emoji)}>{emoji}</button>
              ))}
              {isQuickPanelOpen && quickReplies.map((reply) => (
                <button className="quick-reply" type="button" key={reply} onClick={() => appendToDraft(reply)}>{reply}</button>
              ))}
            </div>
          )}
          <button type="button" aria-label="Emoji" onClick={() => { setIsEmojiPanelOpen((current) => !current); setIsQuickPanelOpen(false); }}><Smile size={23} /></button>
          <button type="button" aria-label="Hızlı mesajlar" onClick={() => { setIsQuickPanelOpen((current) => !current); setIsEmojiPanelOpen(false); }}><MoreVertical size={22} /></button>
          <button type="button" aria-label="Fotoğraf veya dosya ekle" onClick={attachPhoto}><Image size={22} /></button>
          <button type="button" aria-label="Dosya ekle" onClick={attachPhoto}><Paperclip size={22} /></button>
          <button type="button" aria-label={isRecording ? 'Kaydı durdur' : 'Ses kaydı'} onClick={toggleRecording}>{isRecording ? <Square size={20} /> : <Mic size={22} />}</button>
          <button type="button" aria-label="Bildirim sesi testi" onClick={playNotificationSound}><Bell size={21} /></button>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Mesaj yazın" />
          <button className="send-button" type="submit" aria-label="Gönder"><Send size={20} /></button>
        </form>
      </section>
    </main>
  );
}

function LoginScreen({ onLogin, authError }) {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">
          <span className="turtle-logo">🐢</span>
        </div>
        <h1>Kaplumbağa</h1>
        <p>Telefon doğrulama hissi veren hızlı, sade ve modern Kaplumbağa sohbet deneyimine giriş yapın.</p>

        <form onSubmit={onLogin} className="login-form">
          <label>
            <span>Adınız</span>
            <div className="input-wrap">
              <UserRound size={19} />
              <input name="name" placeholder="" autoComplete="name" />
            </div>
          </label>

          <label>
            <span>Telefon numarası</span>
            <div className="input-wrap">
              <Lock size={18} />
              <input name="contact" placeholder="" autoComplete="tel" />
            </div>
          </label>

          <label>
            <span>Şifre</span>
            <div className="input-wrap">
              <Lock size={18} />
              <input name="password" type="password" placeholder="" autoComplete="current-password" />
            </div>
          </label>

          <label>
            <span>Kayıt Anahtarı</span>
            <div className="input-wrap">
              <ShieldCheck size={18} />
              <input name="key" type="password" placeholder="" autoComplete="off" />
            </div>
          </label>

          {authError && <div className="auth-error">{authError}</div>}

          <button type="submit">Doğrula ve Giriş Yap</button>
        </form>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
