// Holder chat API with live updates over Server-Sent Events.
const express = require('express');
const store = require('./store');
const { requireSession } = require('./session');
const { handle } = require('./http');

const COORDINATORS = {
    '0xd20bb29a4eccc43ee7e7a3140ee246c389a200cf': 'Dean',
    '0x0472d37869fc37c33e38acbeecf2b1da121e893f': 'George',
};
const MAX_LENGTH = 500;
const HEARTBEAT_MS = 25000;

const clients = new Set();
const coordinatorName = address => COORDINATORS[address.toLowerCase()] || null;
const withRole = m => ({ ...m, coordinator: coordinatorName(m.address) });

function broadcast(event, data) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    clients.forEach(res => res.write(frame));
}

// Comment lines keep proxies from closing idle connections.
setInterval(() => clients.forEach(res => res.write(': ping\n\n')), HEARTBEAT_MS).unref();

const router = express.Router();
router.use(requireSession);

router.get('/', handle(async (req, res) => {
    res.json({ success: true, messages: (await store.listMessages()).map(withRole), coordinator: Boolean(coordinatorName(req.address)) });
}));

router.get('/stream', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
});

router.post('/', handle(async (req, res) => {
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ success: false, error: 'Message is empty' });
    if (message.length > MAX_LENGTH) return res.status(400).json({ success: false, error: `Messages are limited to ${MAX_LENGTH} characters` });
    const saved = withRole(await store.addMessage(req.address, message));
    broadcast('message', saved);
    res.status(201).json({ success: true, message: saved });
}));

function coordinatorOnly(req, res, next) {
    if (!coordinatorName(req.address)) return res.status(403).json({ success: false, error: 'Coordinators only' });
    next();
}

router.delete('/', coordinatorOnly, handle(async (req, res) => {
    await store.clearMessages();
    broadcast('reset', {});
    res.json({ success: true });
}));

router.post('/restore', coordinatorOnly, handle(async (req, res) => {
    await store.restoreMessages();
    broadcast('reset', {});
    res.json({ success: true });
}));

module.exports = { router, coordinatorName };
