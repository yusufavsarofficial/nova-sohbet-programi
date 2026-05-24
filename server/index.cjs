const crypto = require('crypto');
require('dotenv').config();
const fs = require('fs');
const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { Server } = require('socket.io');
const db = require('./database.cjs');

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-production';
const REGISTRATION_KEY = process.env.REGISTRATION_KEY || '';
const REQUIRE_REGISTRATION_KEY = process.env.REQUIRE_REGISTRATION_KEY === '1';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|mp3|mp4|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Desteklenmeyen dosya türü.'));
  }
});

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

async function getUserByPhoneInput(value) {
  for (const candidate of phoneLookupCandidates(value)) {
    const user = await db.getUserByPhone(candidate);
    if (user) return user;
  }
  return null;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    language: user.language || 'tr',
    about: user.about || 'Kaplumbağa kullanıyorum.',
    avatar: user.avatar || null,
    createdAt: user.created_at || user.createdAt,
    lastSeen: user.last_seen || user.lastSeen,
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Oturum gerekli.' });
  }

  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Geçersiz oturum.' });
  }
}


function parseAllowedOrigins() {
  const raw = process.env.CORS_ORIGIN || '*';
  if (raw === '*') return '*';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function createApp() {
  const app = express();
  const server = http.createServer(app);
  const allowedOrigins = parseAllowedOrigins();
  const corsOptions = {
    origin: allowedOrigins === '*' ? true : allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
  };
  const io = new Server(server, { cors: corsOptions });

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('tiny'));
  app.use('/uploads', express.static(UPLOAD_DIR));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { ok: false, error: 'Çok fazla giriş denemesi.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/auth/', authLimiter);

  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    message: { ok: false, error: 'Çok fazla istek, lütfen bekleyin.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', generalLimiter);

  app.get('/', (req, res) => {
    res.json({ ok: true, app: 'Kaplumbağa API', version: '1.0.0' });
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true, app: 'Kaplumbağa', timestamp: Date.now(), db: db.usePostgres() ? 'postgres' : 'json' });
  });

  app.post('/api/auth/register', async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '').trim();
    const language = String(req.body?.language || 'tr').trim();
    const key = String(req.body?.key || '').trim();

    if (!name || !phone || password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Ad, telefon ve en az 6 karakter şifre gerekli.' });
    }

    if (REQUIRE_REGISTRATION_KEY && key !== REGISTRATION_KEY) {
      return res.status(403).json({ ok: false, error: 'Geçersiz kayıt anahtarı.' });
    }

    const existing = await getUserByPhoneInput(phone);
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Bu telefon zaten kayıtlı.' });
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

    await db.createUser(user);

    res.json({ ok: true, token: signToken(user), user: publicUser(user) });
  });

  app.post('/api/auth/login', async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '').trim();
    const user = await getUserByPhoneInput(phone);

    if (!user || !(await bcrypt.compare(password, user.password_hash || user.passwordHash))) {
      return res.status(401).json({ ok: false, error: 'Telefon veya şifre hatalı.' });
    }

    res.json({ ok: true, token: signToken(user), user: publicUser(user) });
  });

  app.get('/api/me', authMiddleware, async (req, res) => {
    const user = await db.getUserById(req.auth.sub);
    if (!user) return res.status(404).json({ ok: false, error: 'Kullanıcı bulunamadı.' });
    res.json({ ok: true, user: publicUser(user) });
  });

  app.patch('/api/me', authMiddleware, async (req, res) => {
    const updates = {};
    if (req.body?.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body?.about !== undefined) updates.about = String(req.body.about || '').trim();
    if (req.body?.language !== undefined) updates.language = String(req.body.language || 'tr').trim();

    const user = await db.updateUser(req.auth.sub, updates);
    if (!user) return res.status(404).json({ ok: false, error: 'Kullanıcı bulunamadı.' });

    res.json({ ok: true, user: publicUser(user) });
  });

  app.post('/api/contacts', authMiddleware, async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const displayName = String(req.body?.displayName || '').trim();
    const owner = await db.getUserById(req.auth.sub);
    const target = await getUserByPhoneInput(phone);

    if (!owner) return res.status(404).json({ ok: false, error: 'Kullanıcı bulunamadı.' });
    if (!target) return res.status(404).json({ ok: false, error: 'Bu telefon henüz Kaplumbağa hesabı değil. Karşı taraf önce kayıt olmalı.' });
    if (target.id === owner.id) return res.status(400).json({ ok: false, error: 'Kendinizi ekleyemezsiniz.' });

    await db.addContact(owner.id, target.id, displayName);
    const conversation = await db.findOrCreateConversation(owner.id, target.id);

    res.json({ ok: true, contact: { ...publicUser(target), displayName: displayName || target.name }, conversation });
  });

  app.get('/api/conversations', authMiddleware, async (req, res) => {
    const conversations = await db.getConversations(req.auth.sub);
    
    const enrichedConversations = await Promise.all(conversations.map(async (conv) => {
      if (conv.is_group) {
        return { ...conv, otherUser: null };
      }
      const otherId = conv.participants.find(p => p.user_id !== req.auth.sub)?.user_id;
      if (!otherId) return { ...conv, otherUser: null };
      const otherUser = await db.getUserById(otherId);
      return { ...conv, otherUser: otherUser ? publicUser(otherUser) : null };
    }));

    res.json({ ok: true, conversations: enrichedConversations });
  });

  app.get('/api/conversations/:conversationId/messages', authMiddleware, async (req, res) => {
    const conversation = await db.getConversations(req.auth.sub);
    const conv = conversation.find(c => c.id === req.params.conversationId);
    if (!conv) {
      return res.status(404).json({ ok: false, error: 'Sohbet bulunamadı.' });
    }

    const messages = await db.getMessages(req.params.conversationId);
    res.json({ ok: true, messages });
  });

  app.post('/api/conversations/:conversationId/messages', authMiddleware, async (req, res) => {
    const conversation = await db.getConversations(req.auth.sub);
    const conv = conversation.find(c => c.id === req.params.conversationId);
    const text = String(req.body?.text || '').trim();
    const attachment = req.body?.attachment || null;

    if (!conv) {
      return res.status(404).json({ ok: false, error: 'Sohbet bulunamadı.' });
    }
    if (!text && !attachment) {
      return res.status(400).json({ ok: false, error: 'Mesaj veya dosya gerekli.' });
    }

    const sender = await db.getUserById(req.auth.sub);
    const message = {
      id: crypto.randomUUID(),
      conversationId: req.params.conversationId,
      senderId: req.auth.sub,
      senderName: sender?.name || 'Kaplumbağa Kullanıcısı',
      text,
      attachment,
      createdAt: Date.now(),
      status: 'sent',
    };

    await db.createMessage(message);

    io.to(`conversation:${req.params.conversationId}`).emit('message:new', message);
    // Also notify all participants individually so they update conversation list
    try {
      const participants = await db.getGroupParticipants(req.params.conversationId);
      participants.forEach((pid) => {
        if (pid !== req.auth.sub) {
          io.to(`user:${pid}`).emit('message:new', message);
        }
      });
    } catch (e) { /* ignore */ }
    res.json({ ok: true, message });
  });

  app.delete('/api/conversations/:conversationId', authMiddleware, async (req, res) => {
    try {
      await db.deleteConversation(req.params.conversationId, req.auth.sub);
      io.to(`conversation:${req.params.conversationId}`).emit('conversation:deleted', { conversationId: req.params.conversationId });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.patch('/api/messages/:messageId', authMiddleware, async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ ok: false, error: 'Mesaj metni gerekli.' });
    }

    const existing = await db.getMessageById(req.params.messageId);
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Mesaj bulunamadı.' });
    }

    if ((existing.sender_id || existing.senderId) !== req.auth.sub) {
      return res.status(403).json({ ok: false, error: 'Sadece kendi mesajlarınızı düzenleyebilirsiniz.' });
    }

    const message = await db.updateMessage(req.params.messageId, { text, edited_at: Date.now() });
    const conversationId = message.conversation_id || message.conversationId;
    io.to(`conversation:${conversationId}`).emit('message:updated', message);
    res.json({ ok: true, message });
  });

  app.delete('/api/messages/:messageId', authMiddleware, async (req, res) => {
    const msg = await db.getMessageById(req.params.messageId);
    
    if (!msg) {
      return res.status(404).json({ ok: false, error: 'Mesaj bulunamadı.' });
    }

    if ((msg.sender_id || msg.senderId) !== req.auth.sub) {
      return res.status(403).json({ ok: false, error: 'Sadece kendi mesajlarınızı silebilirsiniz.' });
    }

    await db.deleteMessage(req.params.messageId);
    io.to(`conversation:${msg.conversation_id || msg.conversationId}`).emit('message:deleted', { messageId: req.params.messageId });
    res.json({ ok: true });
  });

  app.post('/api/conversations/:conversationId/read', authMiddleware, async (req, res) => {
    const conversations = await db.getConversations(req.auth.sub);
    const conv = conversations.find(c => c.id === req.params.conversationId);
    
    if (!conv) {
      return res.status(404).json({ ok: false, error: 'Sohbet bulunamadı.' });
    }

    await db.markAsRead(req.params.conversationId, req.auth.sub);
    io.to(`conversation:${req.params.conversationId}`).emit('conversation:read', {
      conversationId: req.params.conversationId,
      userId: req.auth.sub
    });
    res.json({ ok: true });
  });

  app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Dosya gerekli.' });
    }
    res.json({
      ok: true,
      file: {
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`
      }
    });
  });

  app.post('/api/groups', authMiddleware, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const participantIds = Array.isArray(req.body?.participantIds) ? req.body.participantIds : [];

    if (!name || participantIds.length < 1) {
      return res.status(400).json({ ok: false, error: 'Grup adı ve en az bir katılımcı gerekli.' });
    }

    const conversation = await db.createGroupConversation(name, req.auth.sub, participantIds);
    res.json({ ok: true, conversation });
  });

  app.post('/api/groups/:conversationId/participants', authMiddleware, async (req, res) => {
    const userId = req.body?.userId;
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'Kullanıcı ID gerekli.' });
    }

    await db.addParticipantToGroup(req.params.conversationId, userId);
    res.json({ ok: true });
  });

  app.get('/api/groups/:conversationId/participants', authMiddleware, async (req, res) => {
    const participants = await db.getGroupParticipants(req.params.conversationId);
    const users = await Promise.all(participants.map(id => db.getUserById(id)));
    res.json({ ok: true, participants: users.filter(Boolean).map(publicUser) });
  });

  app.post('/api/users/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Dosya gerekli.' });
    }
    
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ ok: false, error: 'Sadece resim dosyaları yüklenebilir.' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;
    await db.updateUser(req.auth.sub, { avatar: avatarUrl });
    
    res.json({ ok: true, avatar: avatarUrl });
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      socket.data.auth = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.auth.sub;
    socket.join(`user:${userId}`);
    
    socket.on('conversation:join', async ({ conversationId }) => {
      const conversations = await db.getConversations(socket.data.auth.sub);
      const conversation = conversations.find(c => c.id === conversationId);
      if (conversation) {
        socket.join(`conversation:${conversationId}`);
        await db.markAsRead(conversationId, socket.data.auth.sub);
      }
    });

    socket.on('status:online', async () => {
      await db.updateUser(userId, { lastSeen: null });
      io.emit('user:status', { userId, status: 'online' });
    });

    socket.on('status:offline', async () => {
      const lastSeen = Date.now();
      await db.updateUser(userId, { lastSeen });
      io.emit('user:status', { userId, status: 'offline', lastSeen });
    });

    socket.on('disconnect', async () => {
      const lastSeen = Date.now();
      await db.updateUser(userId, { lastSeen });
      io.emit('user:status', { userId, status: 'offline', lastSeen });
    });

    socket.on('typing', ({ conversationId, isTyping }) => {
      socket.to(`conversation:${conversationId}`).emit('typing', {
        conversationId,
        userId: socket.data.auth.sub,
        isTyping: Boolean(isTyping),
      });
    });

    socket.on('call:signal', async ({ conversationId, type, payload }) => {
      const data = {
        conversationId,
        from: socket.data.auth.sub,
        type,
        payload,
        createdAt: Date.now(),
      };
      // Send to conversation room (active participants)
      socket.to(`conversation:${conversationId}`).emit('call:signal', data);
      // Also notify all participants on their personal channel (for incoming call UI)
      try {
        const participants = await db.getGroupParticipants(conversationId);
        participants.forEach((pid) => {
          if (pid !== socket.data.auth.sub) {
            io.to(`user:${pid}`).emit('call:signal', data);
          }
        });
      } catch (e) { /* ignore */ }
    });

    socket.on('call:end', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('call:end', { from: socket.data.auth.sub, conversationId });
    });
  });

  return { app, server };
}

if (require.main === module) {
  (async () => {
    await db.initDatabase();
    const { server } = createApp();
    server.listen(PORT, HOST, () => {
      console.log(`Kaplumbağa API çalışıyor: http://${HOST}:${PORT}`);
      console.log(`Veritabanı: ${db.usePostgres() ? 'PostgreSQL' : 'JSON dosyası'}`);
    });

    process.on('SIGINT', async () => {
      await db.closeDatabase();
      process.exit(0);
    });
  })();
}

module.exports = { createApp };
