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
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const REGISTRATION_KEY = process.env.REGISTRATION_KEY || '';
const REQUIRE_REGISTRATION_KEY = process.env.REQUIRE_REGISTRATION_KEY === '1';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const MAX_UPLOAD_SIZE_MB = 10;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (IS_PRODUCTION && JWT_SECRET === 'change-this-secret-before-production') {
  throw new Error('JWT_SECRET production ortamında güvenli bir değer olmalı.');
}

function sanitizeFileName(value) {
  const base = path.basename(String(value || 'dosya')).replace(/[^\p{L}\p{N}._ -]/gu, '_').trim();
  return base || 'dosya';
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(sanitizeFileName(file.originalname)).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|csv|xls|xlsx|mp3|wav|ogg|m4a|mp4|webm|zip/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /^(image|audio|video)\//.test(file.mimetype)
      || /pdf|msword|officedocument|plain|csv|excel|spreadsheet|zip/.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    const error = new Error('Desteklenmeyen dosya türü.');
    error.code = 'UNSUPPORTED_FILE_TYPE';
    cb(error);
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

function normalizeTranslateLanguage(value) {
  const language = String(value || 'auto').trim().toLowerCase();
  return /^[a-z]{2,5}(-[a-z]{2,5})?$/.test(language) || language === 'auto' ? language : 'auto';
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
  if (IS_PRODUCTION && raw === '*') {
    throw new Error('CORS_ORIGIN production ortamında "*" olamaz.');
  }
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

  app.post('/api/translate', authMiddleware, async (req, res) => {
    const text = String(req.body?.text || '').trim();
    const from = normalizeTranslateLanguage(req.body?.from);
    const to = normalizeTranslateLanguage(req.body?.to || 'tr');
    if (!text) return res.status(400).json({ ok: false, error: 'Metin gerekli.' });
    if (to === 'auto') return res.status(400).json({ ok: false, error: 'Hedef dil gerekli.' });

    try {
      const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
      const googleResponse = await fetch(googleUrl);
      if (googleResponse.ok) {
        const data = await googleResponse.json();
        const translated = Array.isArray(data?.[0]) ? data[0].map((part) => part?.[0] || '').join('') : '';
        if (translated) {
          return res.json({ ok: true, translated, original: text, from: data?.[2] || from, to, provider: 'google' });
        }
      }

      if (from !== 'auto') {
        const memoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`${from}|${to}`)}`;
        const memoryResponse = await fetch(memoryUrl);
        if (memoryResponse.ok) {
          const data = await memoryResponse.json();
          const translated = data.responseData?.translatedText;
          if (translated) {
            return res.json({ ok: true, translated, original: text, from, to, provider: 'mymemory' });
          }
        }
      }

      return res.json({ ok: true, translated: text, original: text, from, to, provider: 'none' });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'Çeviri hatası.' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      const phone = normalizePhone(req.body?.phone);
      const password = String(req.body?.password || '').trim();
      const language = String(req.body?.language || 'tr').trim();
      const key = String(req.body?.key || '').trim();

      if (!name) return res.status(400).json({ ok: false, error: 'Ad gerekli.' });
      if (!phone) return res.status(400).json({ ok: false, error: 'Telefon gerekli.' });
      if (password.length < 6) return res.status(400).json({ ok: false, error: 'Şifre en az 6 karakter olmalı.' });

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
    } catch (error) {
      if (error?.code === '23505') {
        return res.status(409).json({ ok: false, error: 'Bu telefon zaten kayıtlı.' });
      }
      console.error('Kayıt hatası:', error);
      res.status(500).json({ ok: false, error: 'Kayıt işlemi tamamlanamadı.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const phone = normalizePhone(req.body?.phone);
      const password = String(req.body?.password || '').trim();

      if (!phone) return res.status(400).json({ ok: false, error: 'Telefon gerekli.' });
      if (!password) return res.status(400).json({ ok: false, error: 'Şifre gerekli.' });

      const user = await getUserByPhoneInput(phone);
      if (!user) {
        return res.status(404).json({ ok: false, error: 'Bu telefon kayıtlı değil.' });
      }

      const passwordHash = user.password_hash || user.passwordHash || '';
      const passwordMatches = passwordHash ? await bcrypt.compare(password, passwordHash) : false;
      if (!passwordMatches) {
        return res.status(401).json({ ok: false, error: 'Telefon veya şifre hatalı.' });
      }

      res.json({ ok: true, token: signToken(user), user: publicUser(user) });
    } catch (error) {
      console.error('Giriş hatası:', error);
      res.status(500).json({ ok: false, error: 'Giriş işlemi tamamlanamadı.' });
    }
  });

  app.get('/api/me', authMiddleware, async (req, res) => {
    try {
      const user = await db.getUserById(req.auth.sub);
      if (!user) return res.status(404).json({ ok: false, error: 'Kullanıcı bulunamadı.' });
      res.json({ ok: true, user: publicUser(user) });
    } catch (error) {
      console.error('Oturum kontrol hatası:', error);
      res.status(500).json({ ok: false, error: 'Oturum kontrol edilemedi.' });
    }
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
    try {
      const phone = normalizePhone(req.body?.phone);
      const displayName = String(req.body?.displayName || '').trim();
      const owner = await db.getUserById(req.auth.sub);

      if (!phone) return res.status(400).json({ ok: false, error: 'Telefon gerekli.' });
      if (!owner) return res.status(404).json({ ok: false, error: 'Kullanıcı bulunamadı.' });

      const target = await getUserByPhoneInput(phone);
      if (!target) return res.status(404).json({ ok: false, error: 'Bu telefon henüz Kaplumbağa hesabı değil. Karşı taraf önce kayıt olmalı.' });
      if (target.id === owner.id) return res.status(400).json({ ok: false, error: 'Kendinizi ekleyemezsiniz.' });

      const existingContacts = await db.getContacts(owner.id);
      const existingContact = existingContacts.find((contact) => String(contact.user_id || contact.userId) === String(target.id));
      const alreadyExists = Boolean(existingContact);

      if (!alreadyExists) {
        await db.addContact(owner.id, target.id, displayName);
      }
      const conversation = await db.findOrCreateConversation(owner.id, target.id);

      res.json({
        ok: true,
        alreadyExists,
        contact: { ...publicUser(target), displayName: existingContact?.display_name || existingContact?.displayName || displayName || target.name },
        conversation,
      });
    } catch (error) {
      console.error('Kişi ekleme hatası:', error);
      res.status(500).json({ ok: false, error: 'Kişi eklenemedi. Lütfen tekrar deneyin.' });
    }
  });

  app.get('/api/conversations', authMiddleware, async (req, res) => {
    const conversations = await db.getConversations(req.auth.sub);
    
    const enrichedConversations = await Promise.all(conversations.map(async (conv) => {
      if (conv.is_group || conv.isGroup) {
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
    try {
      const conversation = await db.getConversations(req.auth.sub);
      const conv = conversation.find(c => c.id === req.params.conversationId);
      if (!conv) {
        return res.status(404).json({ ok: false, error: 'Sohbet bulunamadı.' });
      }

      const messages = await db.getMessages(req.params.conversationId);
      res.json({ ok: true, messages });
    } catch (error) {
      console.error('Mesaj listeleme hatası:', error);
      res.status(500).json({ ok: false, error: 'Mesajlar alınamadı.' });
    }
  });

  app.post('/api/conversations/:conversationId/messages', authMiddleware, async (req, res) => {
    try {
      const conversation = await db.getConversations(req.auth.sub);
      const conv = conversation.find(c => c.id === req.params.conversationId);
      const text = String(req.body?.text || '').trim();
      const attachment = req.body?.attachment || null;
      const replyTo = req.body?.replyTo || req.body?.reply_to || null;
      const forwarded = Boolean(req.body?.forwarded);

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
        replyTo,
        forwarded,
        createdAt: Date.now(),
        status: 'sent',
      };

      await db.createMessage(message);

      io.to(`conversation:${req.params.conversationId}`).emit('message:new', message);
      try {
        const participants = await db.getGroupParticipants(req.params.conversationId);
        participants.forEach((pid) => {
          if (pid !== req.auth.sub) {
            io.to(`user:${pid}`).emit('message:new', message);
          }
        });
      } catch (e) { /* ignore */ }
      res.json({ ok: true, message });
    } catch (error) {
      console.error('Mesaj gönderme hatası:', error);
      res.status(500).json({ ok: false, error: 'Mesaj gönderilemedi.' });
    }
  });

  app.delete('/api/conversations/:conversationId', authMiddleware, async (req, res) => {
    try {
      const participants = await db.getGroupParticipants(req.params.conversationId).catch(() => []);
      await db.deleteConversation(req.params.conversationId, req.auth.sub);
      const deletion = { conversationId: req.params.conversationId };
      io.to(`conversation:${req.params.conversationId}`).emit('conversation:deleted', deletion);
      participants.forEach((pid) => io.to(`user:${pid}`).emit('conversation:deleted', deletion));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.patch('/api/messages/:messageId', authMiddleware, async (req, res) => {
    try {
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
      try {
        const participants = await db.getGroupParticipants(conversationId);
        participants.forEach((pid) => io.to(`user:${pid}`).emit('message:updated', message));
      } catch (e) { /* ignore */ }
      res.json({ ok: true, message });
    } catch (error) {
      console.error('Mesaj düzenleme hatası:', error);
      res.status(500).json({ ok: false, error: 'Mesaj düzenlenemedi.' });
    }
  });

  app.delete('/api/messages/:messageId', authMiddleware, async (req, res) => {
    try {
      const msg = await db.getMessageById(req.params.messageId);
      
      if (!msg) {
        return res.status(404).json({ ok: false, error: 'Mesaj bulunamadı.' });
      }

      if ((msg.sender_id || msg.senderId) !== req.auth.sub) {
        return res.status(403).json({ ok: false, error: 'Sadece kendi mesajlarınızı silebilirsiniz.' });
      }

      await db.deleteMessage(req.params.messageId);
      const conversationId = msg.conversation_id || msg.conversationId;
      const deletion = { conversationId, messageId: req.params.messageId };
      io.to(`conversation:${conversationId}`).emit('message:deleted', deletion);
      try {
        const participants = await db.getGroupParticipants(conversationId);
        participants.forEach((pid) => io.to(`user:${pid}`).emit('message:deleted', deletion));
      } catch (e) { /* ignore */ }
      res.json({ ok: true });
    } catch (error) {
      console.error('Mesaj silme hatası:', error);
      res.status(500).json({ ok: false, error: 'Mesaj silinemedi.' });
    }
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
        name: sanitizeFileName(req.file.originalname),
        type: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`
      }
    });
  });

  app.post('/api/groups', authMiddleware, async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      const participantIds = Array.isArray(req.body?.participantIds)
        ? [...new Set(req.body.participantIds.map((id) => String(id)).filter((id) => id && id !== req.auth.sub))]
        : [];

      if (!name) {
        return res.status(400).json({ ok: false, error: 'Grup adı gerekli.' });
      }
      if (participantIds.length < 2) {
        return res.status(400).json({ ok: false, error: 'Grup için en az 2 katılımcı seçin.' });
      }

      const conversation = await db.createGroupConversation(name, req.auth.sub, participantIds);
      res.json({ ok: true, conversation });
    } catch (error) {
      console.error('Grup oluşturma hatası:', error);
      res.status(500).json({ ok: false, error: 'Grup oluşturulamadı.' });
    }
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
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ ok: false, error: 'Sadece resim dosyaları yüklenebilir.' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;
    await db.updateUser(req.auth.sub, { avatar: avatarUrl });
    
    res.json({ ok: true, avatar: avatarUrl });
  });

  app.use((error, req, res, next) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ ok: false, error: `Dosya en fazla ${MAX_UPLOAD_SIZE_MB} MB olabilir.` });
    }
    if (error.code === 'UNSUPPORTED_FILE_TYPE') {
      return res.status(400).json({ ok: false, error: 'Desteklenmeyen dosya türü.' });
    }
    res.status(400).json({ ok: false, error: error.message || 'İstek işlenemedi.' });
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
      try {
        const conversations = await db.getConversations(socket.data.auth.sub);
        const conversation = conversations.find(c => c.id === conversationId);
        if (conversation) {
          socket.join(`conversation:${conversationId}`);
          await db.markAsRead(conversationId, socket.data.auth.sub);
        }
      } catch (error) {
        socket.emit('socket:error', { error: 'Sohbet bağlantısı kurulamadı.' });
      }
    });

    socket.on('status:online', async () => {
      try {
        await db.updateUser(userId, { lastSeen: null });
        io.emit('user:status', { userId, status: 'online' });
      } catch (error) { /* ignore */ }
    });

    socket.on('status:offline', async () => {
      try {
        const lastSeen = Date.now();
        await db.updateUser(userId, { lastSeen });
        io.emit('user:status', { userId, status: 'offline', lastSeen });
      } catch (error) { /* ignore */ }
    });

    socket.on('disconnect', async () => {
      try {
        const lastSeen = Date.now();
        await db.updateUser(userId, { lastSeen });
        io.emit('user:status', { userId, status: 'offline', lastSeen });
      } catch (error) { /* ignore */ }
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
