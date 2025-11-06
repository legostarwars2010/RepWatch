// Jest setup: load environment variables from .env before tests run
const path = require('path');
try {
  const envPath = path.resolve(__dirname, '..', '.env');
  require('dotenv').config({ path: envPath });
} catch (e) {
  // dotenv optional
}
