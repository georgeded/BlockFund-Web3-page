const feedbackForm = document.getElementById('feedbackForm');
const feedbackStatus = document.getElementById('feedbackStatus');

feedbackForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = feedbackForm.querySelector('button[type=submit]');
    const body = Object.fromEntries(new FormData(feedbackForm));
    feedbackStatus.className = 'form-error';
    feedbackStatus.textContent = '';

    if (body.message.trim().length < 5) {
        feedbackStatus.textContent = 'Please write a message (at least 5 characters).';
        return;
    }

    submit.disabled = true;
    submit.textContent = 'Sending...';
    try {
        const res = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Could not send your message');
        feedbackForm.reset();
        feedbackStatus.className = 'form-error ok';
        feedbackStatus.textContent = 'Thanks! Your message was sent.';
    } catch (err) {
        feedbackStatus.textContent = err.message;
    } finally {
        submit.disabled = false;
        submit.textContent = 'Send feedback';
    }
});
