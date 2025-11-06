require('dotenv').config();
const dns = require('dns');
const app = require('./app');
const { initDb } = require('./db/init');

// Prefer IPv4 addresses first to avoid IPv6 ENETUNREACH in some networks
if (typeof dns.setDefaultResultOrder === 'function') {
  try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}
}

const PORT = process.env.PORT || 8080;

(async function start() {
  try {
    await initDb();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📱 Access from phone: http://<your-ip>:${PORT}`);
    });
  } catch (err) {
    console.error('DB initialization failed, shutting down:', err);
    process.exit(1);
  }
})();

