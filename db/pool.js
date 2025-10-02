const { Pool } = require("pg");

const url = process.env.DATABASE_PRIVATE_URL || 
            (process.env.DATABASE_URL || "").replace(
              /switchback\.proxy\.rlwy\.net:\d+/,
              "postgres.railway.internal:5432"
            );
if (!url) throw new Error("DATABASE_URL is not set");

const u = new URL(url);
const isInternal =
  u.hostname.includes("railway.internal") ||
  u.hostname === "postgres.internal" ||
  u.hostname === "postgres";

// If internal, normalize to "postgres"
if (isInternal) {
  u.hostname = "postgres";
  u.port = u.port || "5432";
}

const finalUrl = u.toString();

// Log for sanity
console.log("🔧 DB URL host:", `${u.hostname}:${u.port || "5432"}`);
console.log("🔒 DB SSL:", isInternal ? "off (internal)" : "on (public proxy)");

// Internal => no SSL; Public proxy => SSL (require)
const pool = new Pool({
  connectionString: finalUrl,
  ssl: isInternal ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 0,
  keepAlive: true,
});

module.exports = { pool };
