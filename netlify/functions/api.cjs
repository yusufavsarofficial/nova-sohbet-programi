const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { connectLambda, getStore } = require('@netlify/blobs');

const STORE_NAME = 'kaplumbaga-api';
const STATE_KEY = 'state';
const LOCAL_STATE_FILE = process.env.NETLIFY_LOCAL_STATE_FILE || path.join(__dirname, '..', '..', 'data', 'netlify-state.json');
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-production';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const REGISTRATION_KEY = process.env.REGISTRATION_KEY || '123456789';

function createInitialState() {
  return {
    users: [],
    contacts: [],
    conversations: [],
    messages: [],
  };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
  } catch {
    return {};
  }
}

function normalizePhone(value) {
  let phone = String(value || '').trim().replace(/[\s()-]/g, '');
  if (phone.startsWith('00')) {
    phone = `+${phone.slice(2)}`;
  }
  return phone;
}

function phoneLookupCandidates(value) {
  const normalized = normalizePhone(value);
  const candidates = new Set([String(value || '').trim(), normalized]);
  if (normalized.startsWith('+')) {
    candidates.add(normalized.slice(1));
  } else if (normalized) {
    candidates.add(`+${normalized}`);
  }
  return [...candidates].filter(Boolean);
}

function findUserByPhone(state, value) {
  const candidates = phoneLookupCandidates(value);
  return state.users.find((user) => candidates.includes(user.phone)) || null;
}

function getRoute(event) {
  const rawPath = event.path || new URL(event.rawUrl).pathname;
  let route = rawPath
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '');

  if (!route.startsWith('/')) route = `/${route}`;
  return route;
}

function getToken(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    language: user.language || 'tr',
    about: user.about || 'Kaplumbağa kullanıyorum.',
    avatar: user.avatar || null,
    lastSeen: user.lastSeen || null,
    createdAt: user.createdAt,
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
}

async function withStore(event) {
  const hasBlobsContext = Boolean(event.blobs || process.env.NETLIFY_BLOBS_CONTEXT || globalThis.netlifyBlobsContext);
  if (hasBlobsContext) {
    connectLambda(event);
    const store = getStore(STORE_NAME);
    return {
      read: async () => (await store.get(STATE_KEY, { type: 'json' })) || createInitialState(),
      write: async (state) => store.setJSON(STATE_KEY, state),
    };
  }

  return {
    read: async () => {
      fs.mkdirSync(path.dirname(LOCAL_STATE_FILE), { recursive: true });
      if (!fs.existsSync(LOCAL_STATE_FILE)) {
        fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify(createInitialState(), null, 2));
      }
      return JSON.parse(fs.readFileSync(LOCAL_STATE_FILE, 'utf8'));
    },
    write: async (state) => {
      fs.mkdirSync(path.dirname(LOCAL_STATE_FILE), { recursive: true });
      fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify(state, null, 2));
    },
  };
}

async function requireAuth(event, state) {
  const token = getToken(event);
  if (!token) return { error: json(401, { ok: false, error: 'Oturum gerekli.' }) };

  try {
    const auth = jwt.verify(token, JWT_SECRET);
    const user = state.users.find((record) => record.id === auth.sub);
    if (!user) return { error: json(404, { ok: false, error: 'Kullanici bulunamadi.' }) };
    return { auth, user };
  } catch {
    return { error: json(401, { ok: false, error: 'Gecersiz oturum.' }) };
  }
}

function findOrCreateConversation(state, userA, userB) {
  const existing = state.conversations.find((conversation) => (
    conversation.participants.includes(userA) && conversation.participants.includes(userB)
  ));

  if (existing) return existing;

  const conversation = {
    id: crypto.randomUUID(),
    participants: [userA, userB],
    lastMessage: '',
    updatedAt: Date.now(),
    unread: {},
  };
  state.conversations.push(conversation);
  return conversation;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  const route = getRoute(event);
  const body = parseBody(event);
  const store = await withStore(event);
  const state = await store.read();

  try {
    if (event.httpMethod === 'GET' && route === '/health') {
      return json(200, { ok: true, app: 'Kaplumbağa', timestamp: Date.now(), users: state.users.length });
    }

    if (event.httpMethod === 'POST' && route === '/auth/register') {
      const name = String(body.name || '').trim();
      const phone = normalizePhone(body.phone);
      const password = String(body.password || '').trim();
      const language = String(body.language || 'tr').trim();
      const key = String(body.key || '').trim();

      if (!name || !phone || password.length < 6) {
        return json(400, { ok: false, error: 'Ad, telefon ve en az 6 karakter sifre gerekli.' });
      }

      if (key !== REGISTRATION_KEY) {
        return json(403, { ok: false, error: 'Gecersiz kayit anahtari.' });
      }

      if (findUserByPhone(state, phone)) {
        return json(409, { ok: false, error: 'Bu telefon zaten kayitli.' });
      }

      const user = {
        id: crypto.randomUUID(),
        name,
        phone,
        passwordHash: await bcrypt.hash(password, 12),
        language,
        about: 'Kaplumbağa kullanıyorum.',
        createdAt: Date.now(),
      };

      state.users.push(user);
      await store.write(state);

      return json(200, { ok: true, token: signToken(user), user: publicUser(user) });
    }

    if (event.httpMethod === 'POST' && route === '/auth/login') {
      const phone = normalizePhone(body.phone);
      const password = String(body.password || '').trim();
      const user = findUserByPhone(state, phone);

      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return json(401, { ok: false, error: 'Telefon veya sifre hatali.' });
      }

      return json(200, { ok: true, token: signToken(user), user: publicUser(user) });
    }

    if (event.httpMethod === 'GET' && route === '/me') {
      const session = await requireAuth(event, state);
      if (session.error) return session.error;
      return json(200, { ok: true, user: publicUser(session.user) });
    }

    if (event.httpMethod === 'PATCH' && route === '/me') {
      const session = await requireAuth(event, state);
      if (session.error) return session.error;

      session.user.name = String(body.name || session.user.name).trim();
      session.user.about = String(body.about || session.user.about || '').trim();
      session.user.language = String(body.language || session.user.language || 'tr').trim();
      await store.write(state);

      return json(200, { ok: true, user: publicUser(session.user) });
    }

    if (event.httpMethod === 'POST' && route === '/contacts') {
      const session = await requireAuth(event, state);
      if (session.error) return session.error;

      const phone = normalizePhone(body.phone);
      const displayName = String(body.displayName || '').trim();
      const target = findUserByPhone(state, phone);

      if (!target) return json(404, { ok: false, error: 'Bu telefonla kayitli kullanici yok.' });
      if (target.id === session.user.id) return json(400, { ok: false, error: 'Kendinizi ekleyemezsiniz.' });

      const exists = state.contacts.some((contact) => contact.ownerId === session.user.id && contact.userId === target.id);
      if (!exists) {
        state.contacts.push({ id: crypto.randomUUID(), ownerId: session.user.id, userId: target.id, displayName, createdAt: Date.now() });
      }

      const conversation = findOrCreateConversation(state, session.user.id, target.id);
      await store.write(state);

      return json(200, { ok: true, contact: { ...publicUser(target), displayName: displayName || target.name }, conversation });
    }

    if (event.httpMethod === 'GET' && route === '/conversations') {
      const session = await requireAuth(event, state);
      if (session.error) return session.error;

      const conversations = state.conversations
        .filter((conversation) => conversation.participants.includes(session.user.id))
        .map((conversation) => {
          const otherId = conversation.participants.find((id) => id !== session.user.id);
          const otherUser = state.users.find((user) => user.id === otherId);
          return { ...conversation, otherUser: otherUser ? publicUser(otherUser) : null };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt);

      return json(200, { ok: true, conversations });
    }

    const messagesMatch = route.match(/^\/conversations\/([^/]+)\/messages$/);
    if (messagesMatch) {
      const session = await requireAuth(event, state);
      if (session.error) return session.error;

      const conversation = state.conversations.find((record) => record.id === messagesMatch[1]);
      if (!conversation || !conversation.participants.includes(session.user.id)) {
        return json(404, { ok: false, error: 'Sohbet bulunamadi.' });
      }

      if (event.httpMethod === 'GET') {
        const messages = state.messages
          .filter((message) => message.conversationId === conversation.id)
          .sort((a, b) => a.createdAt - b.createdAt);

        return json(200, { ok: true, messages });
      }

      if (event.httpMethod === 'POST') {
        const text = String(body.text || '').trim();
        const attachment = body.attachment || null;

        if (!text && !attachment) {
          return json(400, { ok: false, error: 'Mesaj veya dosya gerekli.' });
        }

        const message = {
          id: crypto.randomUUID(),
          conversationId: conversation.id,
          senderId: session.user.id,
          senderName: session.user.name || 'Kaplumbağa Kullanıcısı',
          text,
          attachment,
          createdAt: Date.now(),
          status: 'sent',
        };

        state.messages.push(message);
        conversation.lastMessage = text || 'Dosya';
        conversation.updatedAt = message.createdAt;
        for (const participant of conversation.participants) {
          if (participant !== session.user.id) conversation.unread[participant] = (conversation.unread[participant] || 0) + 1;
        }
        await store.write(state);

        return json(200, { ok: true, message });
      }
    }

    // === Group conversations ===
    if (event.httpMethod === 'POST' && route === '/groups') {
      const session = await requireAuth(event, state);
      if (session.error) return session.error;
      const name = String(body.name || '').trim();
      const participantIds = Array.isArray(body.participantIds) ? body.participantIds : [];
      if (!name || participantIds.length < 1) {
        return json(400, { ok: false, error: 'Grup adı ve en az bir katılımcı gerekli.' });
      }
      const conversation = {
        id: crypto.randomUUID(),
        isGroup: true,
        groupName: name,
        createdBy: session.user.id,
        participants: [session.user.id, ...participantIds.filter((id) => id !== session.user.id)],
        lastMessage: '',
        updatedAt: Date.now(),
        unread: {},
      };
      state.conversations.push(conversation);
      await store.write(state);
      return json(200, { ok: true, conversation });
    }

    // === Edit message ===
    const editMatch = route.match(/^\/messages\/([^/]+)$/);
    if (editMatch && (event.httpMethod === 'PATCH' || event.httpMethod === 'DELETE')) {
      const session = await requireAuth(event, state);
      if (session.error) return session.error;
      const messageId = editMatch[1];
      const message = state.messages.find((m) => m.id === messageId);
      if (!message) return json(404, { ok: false, error: 'Mesaj bulunamadı.' });
      if (message.senderId !== session.user.id) return json(403, { ok: false, error: 'Sadece kendi mesajınızı düzenleyebilirsiniz.' });
      if (event.httpMethod === 'DELETE') {
        state.messages = state.messages.filter((m) => m.id !== messageId);
        await store.write(state);
        return json(200, { ok: true });
      }
      const newText = String(body.text || '').trim();
      if (!newText) return json(400, { ok: false, error: 'Boş mesaj kabul edilmez.' });
      message.text = newText;
      message.editedAt = Date.now();
      await store.write(state);
      return json(200, { ok: true, message });
    }

    // === Read receipt ===
    const readMatch = route.match(/^\/conversations\/([^/]+)\/read$/);
    if (readMatch && event.httpMethod === 'POST') {
      const session = await requireAuth(event, state);
      if (session.error) return session.error;
      const conversation = state.conversations.find((c) => c.id === readMatch[1]);
      if (conversation) {
        conversation.unread[session.user.id] = 0;
        await store.write(state);
      }
      return json(200, { ok: true });
    }

    const deleteConversationMatch = route.match(/^\/conversations\/([^/]+)$/);
    if (deleteConversationMatch && event.httpMethod === 'DELETE') {
      const session = await requireAuth(event, state);
      if (session.error) return session.error;
      const conversationId = deleteConversationMatch[1];
      const conversation = state.conversations.find((c) => c.id === conversationId);
      if (!conversation || !conversation.participants.includes(session.user.id)) {
        return json(403, { ok: false, error: 'Yetkisiz silme.' });
      }
      state.conversations = state.conversations.filter((c) => c.id !== conversationId);
      state.messages = state.messages.filter((m) => m.conversationId !== conversationId);
      await store.write(state);
      return json(200, { ok: true });
    }

    // === Contacts list ===
    if (event.httpMethod === 'GET' && route === '/contacts') {
      const session = await requireAuth(event, state);
      if (session.error) return session.error;
      const contacts = state.contacts
        .filter((c) => c.ownerId === session.user.id)
        .map((c) => {
          const target = state.users.find((u) => u.id === c.userId);
          return target ? { ...publicUser(target), displayName: c.displayName || target.name } : null;
        })
        .filter(Boolean);
      return json(200, { ok: true, contacts });
    }

    return json(404, { ok: false, error: 'Endpoint bulunamadi.', route });
  } catch (error) {
    return json(500, { ok: false, error: error.message || 'Sunucu hatasi.' });
  }
};
