const fetch = require('node-fetch');

async function testFetch() {
  const tests = [
    'https://clerk.house.gov/evs/2025/roll001.xml',
    'https://clerk.house.gov/evs/2025/roll100.xml',
    'https://clerk.house.gov/evs/2025/roll200.xml',
    'https://clerk.house.gov/evs/2025/roll233.xml',
    'https://clerk.house.gov/evs/2025/roll280.xml',
  ];
  
  for (const url of tests) {
    console.log(`\nTesting: ${url}`);
    
    try {
      const resp = await fetch(url, { timeout: 10000 });
      console.log(`Status: ${resp.status} ${resp.ok ? '✅' : '❌'}`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
  }
}

testFetch();
