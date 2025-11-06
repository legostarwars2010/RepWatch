// Load .env early so the DB pool and app pick up DATABASE_URL for tests
try { require('dotenv').config(); } catch (e) { }
const request = require('supertest');
const app = require('../app');
const { pool } = require('../db/pool');

describe('API endpoints', () => {
  test('GET /api/issues returns 200 array', async () => {
    const res = await request(app).get('/api/issues').query({ limit: 2, page: 1 });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/district/resolve without address returns 400', async () => {
    const res = await request(app).get('/api/district/resolve');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

afterAll(async () => {
  try {
    await pool.end();
  } catch (e) {
    // ignore if pool already closed or not configured
  }
});
