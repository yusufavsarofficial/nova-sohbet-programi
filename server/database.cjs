const pg = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { Pool } = pg;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'kaplumbaga.json');
const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;
let usePostgres = false;

function createInitialState() {
  return {
    users: [],
    contacts: [],
    conversations: [],
    messages: [],
  };
}

function readState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createInitialState(), null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

async function initDatabase() {
  if (DATABASE_URL) {
    try {
      pool = new Pool({ connectionString: DATABASE_URL });
      await pool.query('SELECT NOW()');
      usePostgres = true;
      console.log('PostgreSQL bağlantısı başarılı.');
      await createTables();
    } catch (error) {
      console.error('PostgreSQL bağlantı hatası, JSON dosyasına geçiliyor:', error.message);
      usePostgres = false;
      pool = null;
    }
  } else {
    console.log('DATABASE_URL ayarlanmamış, JSON dosyası kullanılacak.');
    usePostgres = false;
  }
}

async function createTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        language VARCHAR(10) DEFAULT 'tr',
        avatar TEXT,
        last_seen BIGINT,
        about TEXT DEFAULT 'Kaplumbağa kullanıyorum.',
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
      )
    `);

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen BIGINT;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        display_name VARCHAR(255),
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
        UNIQUE(owner_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        is_group BOOLEAN DEFAULT FALSE,
        group_name VARCHAR(255),
        created_by UUID REFERENCES users(id),
        last_message TEXT,
        updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_participants (
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        unread INTEGER DEFAULT 0,
        joined_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
        PRIMARY KEY (conversation_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
        sender_name VARCHAR(255),
        text TEXT,
        attachment JSONB,
        status VARCHAR(20) DEFAULT 'sent',
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
        deleted_at BIGINT,
        edited_at BIGINT
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
      CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    `);

    console.log('PostgreSQL tabloları oluşturuldu.');
  } finally {
    client.release();
  }
}

async function getUserByPhone(phone) {
  if (usePostgres) {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    return result.rows[0] || null;
  }
  const state = readState();
  return state.users.find(u => u.phone === phone) || null;
}

async function getUserById(id) {
  if (usePostgres) {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  }
  const state = readState();
  return state.users.find(u => u.id === id) || null;
}

async function createUser(user) {
  if (usePostgres) {
    const result = await pool.query(
      'INSERT INTO users (id, name, phone, password_hash, language, about, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [user.id, user.name, user.phone, user.passwordHash, user.language, user.about, user.createdAt]
    );
    return result.rows[0];
  }
  const state = readState();
  state.users.push(user);
  writeState(state);
  return user;
}

async function updateUser(id, updates) {
  if (usePostgres) {
    const fields = [];
    const values = [];
    let idx = 1;
    
    if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
    if (updates.about !== undefined) { fields.push(`about = $${idx++}`); values.push(updates.about); }
    if (updates.language !== undefined) { fields.push(`language = $${idx++}`); values.push(updates.language); }
    if (updates.avatar !== undefined) { fields.push(`avatar = $${idx++}`); values.push(updates.avatar); }
    if (updates.lastSeen !== undefined) { fields.push(`last_seen = $${idx++}`); values.push(updates.lastSeen); }
    
    if (fields.length === 0) return await getUserById(id);
    
    values.push(id);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }
  const state = readState();
  const user = state.users.find(u => u.id === id);
  if (!user) return null;
  if (updates.name !== undefined) user.name = updates.name;
  if (updates.about !== undefined) user.about = updates.about;
  if (updates.language !== undefined) user.language = updates.language;
  if (updates.avatar !== undefined) user.avatar = updates.avatar;
  if (updates.lastSeen !== undefined) user.lastSeen = updates.lastSeen;
  writeState(state);
  return user;
}

async function getContacts(ownerId) {
  if (usePostgres) {
    const result = await pool.query(`
      SELECT c.id, c.display_name, u.id as user_id, u.name, u.phone, u.language, u.about, u.avatar, u.last_seen, u.created_at
      FROM contacts c
      JOIN users u ON c.user_id = u.id
      WHERE c.owner_id = $1
    `, [ownerId]);
    return result.rows;
  }
  const state = readState();
  return state.contacts.filter(c => c.ownerId === ownerId).map(c => {
    const user = state.users.find(u => u.id === c.userId);
    return { ...c, user_id: c.userId, name: user?.name, phone: user?.phone, language: user?.language, about: user?.about, avatar: user?.avatar, last_seen: user?.lastSeen };
  });
}

async function addContact(ownerId, userId, displayName) {
  if (usePostgres) {
    const result = await pool.query(
      'INSERT INTO contacts (owner_id, user_id, display_name) VALUES ($1, $2, $3) ON CONFLICT (owner_id, user_id) DO UPDATE SET display_name = $3 RETURNING *',
      [ownerId, userId, displayName]
    );
    return result.rows[0];
  }
  const state = readState();
  const existing = state.contacts.find(c => c.ownerId === ownerId && c.userId === userId);
  if (existing) {
    existing.displayName = displayName;
    writeState(state);
    return existing;
  }
  const contact = { id: crypto.randomUUID(), ownerId, userId, displayName, createdAt: Date.now() };
  state.contacts.push(contact);
  writeState(state);
  return contact;
}

async function getConversations(userId) {
  if (usePostgres) {
    const result = await pool.query(`
      SELECT c.id, c.is_group, c.group_name, c.last_message, c.updated_at,
             COALESCE(json_agg(json_build_object('user_id', cp.user_id, 'unread', cp.unread)) FILTER (WHERE cp.user_id IS NOT NULL), '[]') as participants
      FROM conversations c
      JOIN conversation_participants cp ON c.id = cp.conversation_id
      WHERE cp.user_id = $1
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `, [userId]);
    return result.rows;
  }
  const state = readState();
  return state.conversations
    .filter(c => c.participants.includes(userId))
    .map(c => ({
      ...c,
      participants: c.participants.map(p => ({ user_id: p, unread: c.unread[p] || 0 }))
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

async function findOrCreateConversation(userA, userB) {
  if (usePostgres) {
    const existing = await pool.query(`
      SELECT c.id, c.is_group, c.group_name, c.last_message, c.updated_at
      FROM conversations c
      JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
      JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
      WHERE cp1.user_id = $1 AND cp2.user_id = $2 AND c.is_group = FALSE
    `, [userA, userB]);
    
    if (existing.rows.length > 0) {
      return existing.rows[0];
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const convResult = await client.query(
        'INSERT INTO conversations (is_group, last_message, updated_at) VALUES (FALSE, \'\', $1) RETURNING *',
        [Date.now()]
      );
      const conversation = convResult.rows[0];
      
      await client.query(
        'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
        [conversation.id, userA, userB]
      );
      
      await client.query('COMMIT');
      return conversation;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  const state = readState();
  const existing = state.conversations.find(c => 
    c.participants.includes(userA) && c.participants.includes(userB) && !c.isGroup
  );
  if (existing) return existing;
  
  const conversation = {
    id: crypto.randomUUID(),
    isGroup: false,
    participants: [userA, userB],
    lastMessage: '',
    updatedAt: Date.now(),
    unread: {}
  };
  state.conversations.push(conversation);
  writeState(state);
  return conversation;
}

async function getMessages(conversationId) {
  if (usePostgres) {
    const result = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC',
      [conversationId]
    );
    return result.rows;
  }
  const state = readState();
  return state.messages
    .filter(m => m.conversationId === conversationId && !m.deletedAt)
    .sort((a, b) => a.createdAt - b.createdAt);
}

async function createMessage(message) {
  if (usePostgres) {
    const result = await pool.query(
      `INSERT INTO messages (id, conversation_id, sender_id, sender_name, text, attachment, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [message.id, message.conversationId, message.senderId, message.senderName, message.text, JSON.stringify(message.attachment), message.status, message.createdAt]
    );
    
    await pool.query(
      'UPDATE conversations SET last_message = $1, updated_at = $2 WHERE id = $3',
      [message.text || 'Dosya', message.createdAt, message.conversationId]
    );
    
    await pool.query(
      `UPDATE conversation_participants SET unread = unread + 1 
       WHERE conversation_id = $1 AND user_id != $2`,
      [message.conversationId, message.senderId]
    );
    
    return result.rows[0];
  }
  const state = readState();
  state.messages.push(message);
  
  const conversation = state.conversations.find(c => c.id === message.conversationId);
  if (conversation) {
    conversation.lastMessage = message.text || 'Dosya';
    conversation.updatedAt = message.createdAt;
    for (const participant of conversation.participants) {
      if (participant !== message.senderId) {
        conversation.unread[participant] = (conversation.unread[participant] || 0) + 1;
      }
    }
  }
  writeState(state);
  return message;
}

async function updateMessage(messageId, updates) {
  if (usePostgres) {
    const fields = [];
    const values = [];
    let idx = 1;
    
    if (updates.text !== undefined) { fields.push(`text = $${idx++}`); values.push(updates.text); }
    if (updates.edited_at !== undefined) { fields.push(`edited_at = $${idx++}`); values.push(updates.edited_at); }
    
    if (fields.length === 0) return null;
    
    values.push(messageId);
    const query = `UPDATE messages SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }
  const state = readState();
  const message = state.messages.find(m => m.id === messageId);
  if (!message) return null;
  if (updates.text !== undefined) message.text = updates.text;
  if (updates.edited_at !== undefined) message.editedAt = updates.editedAt;
  writeState(state);
  return message;
}

async function getMessageById(messageId) {
  if (usePostgres) {
    const result = await pool.query('SELECT * FROM messages WHERE id = $1 AND deleted_at IS NULL', [messageId]);
    return result.rows[0] || null;
  }
  const state = readState();
  return state.messages.find(m => m.id === messageId && !m.deletedAt) || null;
}

async function deleteMessage(messageId) {
  if (usePostgres) {
    await pool.query('UPDATE messages SET deleted_at = $1 WHERE id = $2', [Date.now(), messageId]);
    return true;
  }
  const state = readState();
  const message = state.messages.find(m => m.id === messageId);
  if (message) {
    message.deletedAt = Date.now();
    writeState(state);
  }
  return true;
}

async function markAsRead(conversationId, userId) {
  if (usePostgres) {
    await pool.query(
      'UPDATE conversation_participants SET unread = 0 WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    return true;
  }
  const state = readState();
  const conversation = state.conversations.find(c => c.id === conversationId);
  if (conversation) {
    conversation.unread[userId] = 0;
    writeState(state);
  }
  return true;
}

async function createGroupConversation(name, createdBy, participantIds) {
  if (usePostgres) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const convResult = await client.query(
        'INSERT INTO conversations (is_group, group_name, created_by, last_message, updated_at) VALUES (TRUE, $1, $2, \'\', $3) RETURNING *',
        [name, createdBy, Date.now()]
      );
      const conversation = convResult.rows[0];
      
      const allParticipants = [createdBy, ...participantIds];
      for (const userId of allParticipants) {
        await client.query(
          'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2)',
          [conversation.id, userId]
        );
      }
      
      await client.query('COMMIT');
      return conversation;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  const state = readState();
  const conversation = {
    id: crypto.randomUUID(),
    isGroup: true,
    groupName: name,
    createdBy,
    participants: [createdBy, ...participantIds],
    lastMessage: '',
    updatedAt: Date.now(),
    unread: {}
  };
  state.conversations.push(conversation);
  writeState(state);
  return conversation;
}

async function addParticipantToGroup(conversationId, userId) {
  if (usePostgres) {
    await pool.query(
      'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [conversationId, userId]
    );
    return true;
  }
  const state = readState();
  const conversation = state.conversations.find(c => c.id === conversationId);
  if (conversation && !conversation.participants.includes(userId)) {
    conversation.participants.push(userId);
    writeState(state);
  }
  return true;
}

async function getGroupParticipants(conversationId) {
  if (usePostgres) {
    const result = await pool.query(
      'SELECT user_id FROM conversation_participants WHERE conversation_id = $1',
      [conversationId]
    );
    return result.rows.map(r => r.user_id);
  }
  const state = readState();
  const conversation = state.conversations.find(c => c.id === conversationId);
  return conversation?.participants || [];
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    console.log('PostgreSQL bağlantısı kapatıldı.');
  }
}

module.exports = {
  initDatabase,
  getUserByPhone,
  getUserById,
  createUser,
  updateUser,
  getContacts,
  addContact,
  getConversations,
  findOrCreateConversation,
  getMessages,
  getMessageById,
  createMessage,
  updateMessage,
  deleteMessage,
  markAsRead,
  createGroupConversation,
  addParticipantToGroup,
  getGroupParticipants,
  closeDatabase,
  usePostgres: () => usePostgres
};
