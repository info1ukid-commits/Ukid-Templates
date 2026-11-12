const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { promisify } = require('node:util');
const { createDatabase } = require('./lib/database');

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'snippet_session';
const DEFAULT_SESSION_HOURS = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return ['', ''];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([name]) => name));
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function sendError(response, status, message) {
  return response.status(status).json({ error: message });
}

function createApp(options = {}) {
  const root = __dirname;
  const dataFile = options.dataFile || process.env.DATA_FILE || path.join(root, 'data', 'store.json');
  const database = createDatabase(dataFile);
  const subscribers = new Map();
  const app = express();
  const sessionHours = Math.max(1, Number(process.env.SESSION_HOURS) || DEFAULT_SESSION_HOURS);
  const sessionSeconds = sessionHours * 60 * 60;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  function setSessionCookie(response, token) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionSeconds}${secure}`);
  }

  function clearSessionCookie(response) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  }

  function findSession(request, state = database.read()) {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const tokenHash = hashToken(token);
    const session = state.sessions.find((item) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > Date.now());
    if (!session) return null;
    const user = state.users.find((item) => item.id === session.userId);
    return user ? { session, user, state } : null;
  }

  function requireAuth(request, response, next) {
    const identity = findSession(request);
    if (!identity) return sendError(response, 401, 'Authentication required.');
    request.auth = identity;
    return next();
  }

  async function createSession(response, user) {
    const token = crypto.randomBytes(32).toString('base64url');
    const state = database.read();
    state.sessions = state.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
    state.sessions.push({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + sessionSeconds * 1000).toISOString()
    });
    database.write(state);
    setSessionCookie(response, token);
  }

  async function makePasswordHash(password) {
    const salt = crypto.randomBytes(16);
    const derivedKey = await scrypt(password, salt, 64);
    return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
  }

  async function verifyPassword(password, storedHash) {
    const [algorithm, saltHex, keyHex] = String(storedHash || '').split('$');
    if (algorithm !== 'scrypt' || !saltHex || !keyHex) return false;
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  function publishEvent(eventName, payload) {
    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    subscribers.forEach((subscriber, response) => {
      if (payload.public !== false || subscriber.userId === payload.authorId) response.write(message);
    });
  }

  app.get('/api/health', (request, response) => response.json({ status: 'ok' }));

  app.post('/api/auth/register', async (request, response, next) => {
    try {
      const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
      const password = typeof request.body?.password === 'string' ? request.body.password : '';
      if (name.length < 2 || name.length > 80) return sendError(response, 400, 'Enter a name between 2 and 80 characters.');
      if (!EMAIL_PATTERN.test(email) || email.length > 254) return sendError(response, 400, 'Enter a valid email address.');
      if (password.length < 10 || password.length > 256) return sendError(response, 400, 'Password must be at least 10 characters.');

      const state = database.read();
      if (state.users.some((user) => user.email.toLowerCase() === email)) return sendError(response, 409, 'An account with that email already exists.');
      const user = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash: await makePasswordHash(password),
        createdAt: new Date().toISOString()
      };
      state.users.push(user);
      database.write(state);
      await createSession(response, user);
      return response.status(201).json({ user: publicUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/login', async (request, response, next) => {
    try {
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
      const password = typeof request.body?.password === 'string' ? request.body.password : '';
      const user = database.read().users.find((item) => item.email.toLowerCase() === email);
      if (!user || !(await verifyPassword(password, user.passwordHash))) return sendError(response, 401, 'Email or password is incorrect.');
      await createSession(response, user);
      return response.json({ user: publicUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/me', requireAuth, (request, response) => response.json({ user: publicUser(request.auth.user) }));

  app.post('/api/auth/logout', (request, response) => {
    const identity = findSession(request);
    if (identity) {
      identity.state.sessions = identity.state.sessions.filter((session) => session.tokenHash !== identity.session.tokenHash);
      database.write(identity.state);
    }
    clearSessionCookie(response);
    return response.status(204).end();
  });

  app.get('/api/templates', requireAuth, (request, response) => {
    const state = database.read();
    const templates = state.templates
      .filter((template) => template.authorId == null || template.public === true || template.authorId === request.auth.user.id)
      .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
    return response.json({ templates });
  });

  app.post('/api/templates', requireAuth, (request, response) => {
    const title = typeof request.body?.title === 'string' ? request.body.title.trim() : '';
    const category = typeof request.body?.category === 'string' ? request.body.category.trim().toLowerCase() : '';
    const description = typeof request.body?.description === 'string' ? request.body.description.trim() : '';
    const code = typeof request.body?.code === 'string' ? request.body.code : '';
    if (!title || title.length > 120 || !category || category.length > 40 || !code.trim() || code.length > 100000) {
      return sendError(response, 400, 'Provide a title, category, and code within the allowed limits.');
    }

    const state = database.read();
    const template = {
      id: crypto.randomUUID(),
      title,
      category,
      description: description.slice(0, 500),
      code,
      author: request.auth.user.name,
      authorId: request.auth.user.id,
      public: request.body.public !== false,
      createdAt: new Date().toISOString()
    };
    state.templates.push(template);
    database.write(state);
    publishEvent('template-published', template);
    return response.status(201).json({ template });
  });

  app.patch('/api/templates/:id', requireAuth, (request, response) => {
    const state = database.read();
    const template = state.templates.find((item) => item.id === request.params.id);
    if (!template) return sendError(response, 404, 'Template not found.');
    if (template.authorId !== request.auth.user.id) return sendError(response, 403, 'You can only edit your own templates.');

    const updates = request.body || {};
    if (typeof updates.title === 'string' && updates.title.trim()) template.title = updates.title.trim().slice(0, 120);
    if (typeof updates.category === 'string' && updates.category.trim()) template.category = updates.category.trim().toLowerCase().slice(0, 40);
    if (typeof updates.description === 'string') template.description = updates.description.trim().slice(0, 500);
    if (typeof updates.code === 'string' && updates.code.trim()) template.code = updates.code.slice(0, 100000);
    if (typeof updates.public === 'boolean') template.public = updates.public;
    template.updatedAt = new Date().toISOString();
    database.write(state);
    publishEvent('template-updated', template);
    return response.json({ template });
  });

  app.delete('/api/templates/:id', requireAuth, (request, response) => {
    const state = database.read();
    const index = state.templates.findIndex((item) => item.id === request.params.id);
    if (index < 0) return sendError(response, 404, 'Template not found.');
    if (state.templates[index].authorId !== request.auth.user.id) return sendError(response, 403, 'You can only delete your own templates.');
    const [template] = state.templates.splice(index, 1);
    database.write(state);
    publishEvent('template-deleted', { id: template.id, authorId: template.authorId, public: template.public });
    return response.status(204).end();
  });

  app.get('/api/events', requireAuth, (request, response) => {
    response.status(200);
    response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    response.flushHeaders();
    response.write('event: ready\ndata: {}\n\n');
    subscribers.set(response, { userId: request.auth.user.id });
    request.on('close', () => subscribers.delete(response));
  });

  app.get('/api/dashboard', requireAuth, (request, response) => {
    const state = database.read();
    const ownTemplates = state.templates.filter((template) => template.authorId === request.auth.user.id);
    const communityTemplates = state.templates.filter((template) => template.authorId == null || template.public === true);
    const ownReviews = state.reviews.filter((review) => review.userId === request.auth.user.id);
    const ownFollows = state.follows.filter((follow) => follow.followerId === request.auth.user.id);
    const categoryCounts = communityTemplates.reduce((counts, template) => {
      const category = template.category || 'other';
      counts[category] = (counts[category] || 0) + 1;
      return counts;
    }, {});
    return response.json({
      user: publicUser(request.auth.user),
      stats: { templates: ownTemplates.length, communityTemplates: communityTemplates.length, following: ownFollows.length, reviews: ownReviews.length },
      recentTemplates: ownTemplates.slice().sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0)).slice(0, 8),
      categoryCounts
    });
  });

  app.get('/api/follows', requireAuth, (request, response) => {
    const follows = database.read().follows.filter((follow) => follow.followerId === request.auth.user.id);
    return response.json({ follows });
  });

  app.post('/api/follows/:userId', requireAuth, (request, response) => {
    if (request.params.userId === request.auth.user.id) return sendError(response, 400, 'You cannot follow yourself.');
    const state = database.read();
    if (!state.users.some((user) => user.id === request.params.userId)) return sendError(response, 404, 'User not found.');
    const index = state.follows.findIndex((follow) => follow.followerId === request.auth.user.id && follow.followedId === request.params.userId);
    let following;
    if (index >= 0) {
      state.follows.splice(index, 1);
      following = false;
    } else {
      state.follows.push({ followerId: request.auth.user.id, followedId: request.params.userId, createdAt: new Date().toISOString() });
      following = true;
    }
    database.write(state);
    return response.json({ following });
  });

  app.get('/api/reviews', requireAuth, (request, response) => {
    const reviews = database.read().reviews.filter((review) => !request.query.templateId || review.templateId === request.query.templateId);
    return response.json({ reviews });
  });

  app.post('/api/reviews', requireAuth, (request, response) => {
    const templateId = typeof request.body?.templateId === 'string' ? request.body.templateId : '';
    const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
    if (!templateId || !message || message.length > 2000) return sendError(response, 400, 'Provide a template and a review under 2,000 characters.');
    const state = database.read();
    if (!state.templates.some((template) => template.id === templateId)) return sendError(response, 404, 'Template not found.');
    const review = { id: crypto.randomUUID(), templateId, userId: request.auth.user.id, author: request.auth.user.name, message, createdAt: new Date().toISOString() };
    state.reviews.push(review);
    database.write(state);
    return response.status(201).json({ review });
  });

  app.get('/html.html', (request, response) => {
    if (!findSession(request)) return response.redirect(302, '/login.html');
    return response.redirect(302, '/templates.html');
  });
  app.get('/login.html', (request, response) => response.sendFile(path.join(root, 'index.html')));

  app.use(['/data', '/lib', '/tests', '/server.js', '/package.json'], (request, response) => response.sendStatus(404));
  app.use(express.static(root, { dotfiles: 'deny', index: 'index.html', fallthrough: true }));
  app.use((request, response) => response.sendStatus(404));
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
    return sendError(response, status, status === 500 ? 'Unexpected server error.' : 'Invalid request.');
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => console.log(`Ukid API listening on port ${port}`));
}

module.exports = { createApp };
