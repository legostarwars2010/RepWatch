const fetch = require('node-fetch');

async function requestWithRetry(url, opts = {}, { retries = 3, backoffMs = 1000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        const ra = res.headers.get('retry-after');
        const wait = ra ? Number(ra) * 1000 : backoffMs * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt)));
    }
  }
}

module.exports = { requestWithRetry };
