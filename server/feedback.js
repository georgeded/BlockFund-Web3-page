// Feedback form: saves each submission, then emails it via Resend (HTTPS) or SMTP.
const store = require('./store');
const { HttpError } = require('./http');

const FEEDBACK_TO = process.env.FEEDBACK_TO || 'g.dedebilis@gmail.com';
const TOPICS = ['Bug', 'Idea', 'Question', 'Other'];
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const recent = new Map();

function rateLimited(ip) {
    const now = Date.now();
    if (recent.size > 1000) {
        for (const [key, hits] of recent) if (hits.every(t => now - t >= RATE_LIMIT.windowMs)) recent.delete(key);
    }
    const hits = (recent.get(ip) || []).filter(t => now - t < RATE_LIMIT.windowMs);
    hits.push(now);
    recent.set(ip, hits);
    return hits.length > RATE_LIMIT.max;
}

function validate(body) {
    const clean = value => String(value ?? '').trim();
    const entry = {
        name: clean(body.name).slice(0, 80),
        email: clean(body.email).slice(0, 120),
        topic: TOPICS.includes(body.topic) ? body.topic : 'Other',
        message: clean(body.message),
    };
    if (entry.message.length < 5) throw new HttpError(400, 'Please write a message (at least 5 characters).');
    if (entry.message.length > 4000) throw new HttpError(400, 'Message is too long (max 4000 characters).');
    if (entry.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)) throw new HttpError(400, 'That email address looks invalid.');
    return entry;
}

function compose(entry) {
    return {
        subject: `[BlockFund] ${entry.topic}: ${entry.message.slice(0, 60).replace(/\s+/g, ' ')}`,
        text: [
            `Topic: ${entry.topic}`,
            `From: ${entry.name || 'Anonymous'}${entry.email ? ` <${entry.email}>` : ''}`,
            `Received: ${new Date().toISOString()}`,
            '',
            entry.message,
        ].join('\n'),
    };
}

async function sendWithResend(entry) {
    const { subject, text } = compose(entry);
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: process.env.FEEDBACK_FROM || 'BlockFund feedback <onboarding@resend.dev>',
            to: [FEEDBACK_TO],
            reply_to: entry.email || undefined,
            subject,
            text,
        }),
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Resend: HTTP ${res.status} ${await res.text()}`);
}

async function sendWithSmtp(entry) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
        from: `BlockFund feedback <${process.env.SMTP_USER}>`,
        to: FEEDBACK_TO,
        replyTo: entry.email || undefined,
        ...compose(entry),
    });
}

async function sendEmail(entry) {
    if (process.env.RESEND_API_KEY) return sendWithResend(entry);
    if (process.env.SMTP_USER && process.env.SMTP_PASS) return sendWithSmtp(entry);
}

async function submitFeedback(body, ip) {
    if (body.website) return; // honeypot field, only bots fill it
    if (rateLimited(ip)) throw new HttpError(429, 'Too many messages, please try again later.');
    const entry = validate(body);
    await store.addFeedback(entry);
    try {
        await sendEmail(entry);
    } catch (error) {
        console.error('Feedback email failed (submission is saved):', error.message);
    }
}

module.exports = { submitFeedback };
