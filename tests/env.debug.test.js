// Debug helper: prints whether DATABASE_URL is visible to the Jest process.
try { require('dotenv').config(); } catch (e) { }

test('debug: show db env presence (length only)', () => {
  const has = Boolean(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_PRIVATE_URL);
  const len = process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0;
  // Print masked info so secrets are not exposed in logs
  console.log(`JEST-DEBUG: DATABASE_URL present=${has} length=${len}`);
  expect(true).toBe(true);
});
