const chatWindow = document.getElementById('textwindow');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatinput');
const sendButton = document.getElementById('send');
const controls = document.getElementById('coordinator-controls');

let stream = null;
let messages = [];

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PREVIEW = [
    { address: '0x0472d37869fc37C33e38acBEEcf2B1dA121E893F', coordinator: 'George', message: 'Welcome to the BlockFund holder chat!' },
    { address: '0x5aE2b0c4f1A9d8e7C6b5A4f3E2d1C0b9A8f7E6d5', message: 'Just claimed my daily BF from the faucet.' },
    { address: '0x9C1d2E3f4A5b6C7d8E9f0A1b2C3d4E5f6A7b8C9d', message: 'The new swap page is really smooth.' },
    { address: '0xd20Bb29a4eCcC43eE7e7A3140eE246c389a200cf', coordinator: 'Dean', message: 'Thanks! Feedback is always welcome.' },
].map((m, i) => ({ ...m, id: i, createdAt: new Date(Date.now() - (4 - i) * 6e5).toISOString() }));

function messageHtml(m) {
    const mine = window.holderSession && m.address.toLowerCase() === window.holderSession.address.toLowerCase();
    const sender = m.coordinator
        ? `<span class="coord">Coordinator ${escapeHtml(m.coordinator)}</span>`
        : `${m.address.slice(0, 6)}...${m.address.slice(-4)}`;
    const time = new Date(m.createdAt).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', day: '2-digit', month: 'short' });
    return `<div class="msg ${mine ? 'mine' : ''}">
        <p>${escapeHtml(m.message)}</p>
        <div class="msg-meta"><span>${sender}</span><span>${time}</span></div>
    </div>`;
}

function render(list, { scroll = false } = {}) {
    const nearBottom = chatWindow.scrollHeight - chatWindow.clientHeight <= chatWindow.scrollTop + 80;
    chatWindow.innerHTML = list.length ? list.map(messageHtml).join('') : '<div class="empty-state">No messages yet. Say hi!</div>';
    if (scroll || nearBottom) chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function loadMessages(token) {
    const data = await api('/api/chat', { token });
    messages = data.messages;
    controls.hidden = !data.coordinator;
    render(messages, { scroll: true });
}

function connect(session) {
    disconnect();
    loadMessages(session.token).catch(err => console.error('Could not load chat:', err));
    stream = new EventSource(`/api/chat/stream?token=${encodeURIComponent(session.token)}`);
    stream.addEventListener('message', e => {
        const m = JSON.parse(e.data);
        if (messages.some(x => x.id === m.id)) return;
        messages.push(m);
        render(messages);
    });
    stream.addEventListener('reset', () => loadMessages(session.token));
    // EventSource reconnects by itself; reload history in case messages were missed meanwhile.
    stream.addEventListener('open', () => loadMessages(session.token).catch(() => {}));
}

function disconnect() {
    stream?.close();
    stream = null;
}

function onSession(session) {
    if (session) {
        chatInput.disabled = false;
        connect(session);
    } else {
        disconnect();
        controls.hidden = true;
        chatInput.disabled = true;
        render(PREVIEW, { scroll: true });
    }
    toggleSend();
}

async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || !window.holderSession) return;
    sendButton.disabled = true;
    try {
        const { message: saved } = await api('/api/chat', { method: 'POST', body: { message }, token: window.holderSession.token });
        chatInput.value = '';
        if (!messages.some(x => x.id === saved.id)) messages.push(saved);
        render(messages, { scroll: true });
    } catch (err) {
        console.error('Could not send message:', err);
        alert(err.message);
    } finally {
        toggleSend();
        chatInput.focus();
    }
}

async function coordinatorAction(method, url, question) {
    if (!confirm(question)) return;
    try {
        await api(url, { method, token: window.holderSession.token });
    } catch (err) {
        alert(err.message);
    }
}

function toggleSend() {
    sendButton.disabled = !window.holderSession || chatInput.value.trim() === '';
}

chatForm.addEventListener('submit', e => {
    e.preventDefault();
    sendMessage();
});
chatInput.addEventListener('input', toggleSend);
document.getElementById('delete-messages').addEventListener('click', () =>
    coordinatorAction('DELETE', '/api/chat', 'Delete all messages for everyone?'));
document.getElementById('reset-messages').addEventListener('click', () =>
    coordinatorAction('POST', '/api/chat/restore', 'Restore the messages that were last deleted?'));

document.addEventListener('sessionchange', e => onSession(e.detail));
// Until site.js confirms a saved session, show the preview.
onSession(window.holderSession);
