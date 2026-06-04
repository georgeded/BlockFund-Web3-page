// Postgres when DATABASE_URL is set, otherwise JSON files in server/data (local use only).
const fs = require('fs');
const path = require('path');

const MAX_MESSAGES = 100;
const WELCOME = {
    address: '0x0472d37869fc37C33e38acBEEcf2B1dA121E893F',
    message: 'Hello BlockFund holders! Welcome to our group chat, here we can communicate together in order to improve the whole project. Feel free to share your own experience of the website and also to give feedback. Thank you for your contribution!',
    createdAt: '2024-08-09T20:45:59.739Z',
};

function postgresStore(url) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
    const toMessage = r => ({ id: Number(r.id), address: r.address, message: r.message, createdAt: r.created_at.toISOString() });

    return {
        kind: 'postgres',
        async init() {
            await pool.query(`
                create table if not exists chat_messages (
                    id bigserial primary key,
                    address text not null,
                    message text not null,
                    created_at timestamptz not null default now(),
                    deleted_at timestamptz
                );
                create table if not exists feedback (
                    id bigserial primary key,
                    topic text not null,
                    name text,
                    email text,
                    message text not null,
                    received_at timestamptz not null default now()
                );`);
            const { rows } = await pool.query('select count(*)::int as n from chat_messages');
            if (rows[0].n === 0) {
                await pool.query('insert into chat_messages (address, message, created_at) values ($1, $2, $3)',
                    [WELCOME.address, WELCOME.message, WELCOME.createdAt]);
            }
        },
        async listMessages() {
            const { rows } = await pool.query(
                'select * from (select * from chat_messages where deleted_at is null order by id desc limit $1) m order by id',
                [MAX_MESSAGES]);
            return rows.map(toMessage);
        },
        async addMessage(address, message) {
            const { rows } = await pool.query('insert into chat_messages (address, message) values ($1, $2) returning *', [address, message]);
            return toMessage(rows[0]);
        },
        async clearMessages() {
            await pool.query('update chat_messages set deleted_at = now() where deleted_at is null');
        },
        // Brings back the most recently cleared batch.
        async restoreMessages() {
            await pool.query(`update chat_messages set deleted_at = null
                where deleted_at = (select max(deleted_at) from chat_messages)`);
        },
        async addFeedback(f) {
            await pool.query('insert into feedback (topic, name, email, message) values ($1, $2, $3, $4)', [f.topic, f.name, f.email, f.message]);
        },
    };
}

function fileStore(dir) {
    const file = name => path.join(dir, `${name}.json`);
    const read = (name, fallback) => (fs.existsSync(file(name)) ? JSON.parse(fs.readFileSync(file(name), 'utf8')) : fallback);
    const write = (name, data) => fs.writeFileSync(file(name), JSON.stringify(data, null, 2));

    return {
        kind: 'files',
        async init() {
            fs.mkdirSync(dir, { recursive: true });
            if (!fs.existsSync(file('chat'))) write('chat', [{ id: 1, ...WELCOME }]);
        },
        async listMessages() {
            return read('chat', []).slice(-MAX_MESSAGES);
        },
        async addMessage(address, message) {
            const chat = read('chat', []);
            const entry = { id: (chat.at(-1)?.id || 0) + 1, address, message, createdAt: new Date().toISOString() };
            write('chat', [...chat, entry].slice(-MAX_MESSAGES));
            return entry;
        },
        async clearMessages() {
            write('chat-backup', read('chat', []));
            write('chat', []);
        },
        async restoreMessages() {
            write('chat', read('chat-backup', read('chat', [])));
        },
        async addFeedback(f) {
            write('feedback', [...read('feedback', []), { ...f, receivedAt: new Date().toISOString() }]);
        },
    };
}

module.exports = process.env.DATABASE_URL
    ? postgresStore(process.env.DATABASE_URL)
    : fileStore(path.join(__dirname, 'data'));
