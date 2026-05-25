// Passes async errors to Express's error handler (Express 4 doesn't do this itself).
const handle = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Error with an HTTP status and a message that is safe to show users.
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

module.exports = { handle, HttpError };
