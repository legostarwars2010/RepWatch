const { Pool } = require("pg");

// Load .env in local/dev environments if present so tests/CLI picks up DATABASE_URL
try {
  require('dotenv').config();
} catch (e) {
  // dotenv is optional in environments where env vars are already provided
}

// Use DEV_DB_URL when NODE_ENV is 'dev' or 'development', otherwise use production URLs
const isDev = process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'development';
console.log('🔧 DB Environment:', isDev ? 'DEVELOPMENT' : 'PRODUCTION');
const urlRaw = isDev 
  ? (process.env.DEV_DB_URL || process.env.DEV_URL || process.env.DATABASE_URL)
  : (process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_PRIVATE_URL);

if (!urlRaw && process.env.NODE_ENV !== 'test') {
  throw new Error(
    isDev 
      ? "DEV_DB_URL is not set. Set DEV_DB_URL in .env for development."
      : "DATABASE_URL is not set. Set DATABASE_URL (or NEON_DATABASE_URL / DATABASE_PRIVATE_URL) in the environment."
  );
}

let u;
try {
  u = new URL(urlRaw);
} catch (err) {
  throw new Error(
    `Failed to parse DATABASE_URL: ${err.message}. Ensure it is a proper URL like postgres://user:pass@host:5432/dbname`
  );
}

const isInternal =
  u.hostname.includes("railway.internal") ||
  u.hostname === "postgres.internal" ||
  // Neon sometimes uses internal names; allow opt-in detection by hostname
  u.hostname.includes("neon") ||
  u.hostname.endsWith(".internal");

// Keep the hostname as provided by the platform. Some internal networks
// resolve service names differently — rewriting to "postgres" can break DNS.
const finalUrl = u.toString();

// Log only non-sensitive parts
console.log("🔧 DB Environment:", isDev ? "DEVELOPMENT" : "PRODUCTION");
console.log("🔧 DB URL host:", `${u.hostname}:${u.port || "5432"}`);
console.log("🔒 DB SSL:", isInternal ? "off (internal)" : "on (public)");

// Allow forcing strict TLS via env var for security-minded deployments

// Secure by default: require proper TLS verification for public hosts.
// Set DB_ALLOW_INSECURE_TLS=true to allow rejectUnauthorized=false (not recommended).
const allowInsecureTls = process.env.DB_ALLOW_INSECURE_TLS === "true";

const sslConfig = isInternal
  ? false
  : { rejectUnauthorized: !allowInsecureTls };

const pool = new Pool({
  connectionString: finalUrl,
  ssl: sslConfig,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 0,
  keepAlive: true,
});

module.exports = { pool };
