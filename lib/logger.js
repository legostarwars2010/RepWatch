function info(...args) { console.log('[info]', ...args); }
function warn(...args) { console.warn('[warn]', ...args); }
function error(...args) { console.error('[error]', ...args); }
function debug(...args) { if (process.env.DEBUG) console.debug('[debug]', ...args); }

module.exports = { info, warn, error, debug };
