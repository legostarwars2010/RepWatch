const fetch = require('node-fetch');

async function testURLs() {
  const urls = [
    'https://clerk.house.gov/evs/119/roll001.xml',
    'https://clerk.house.gov/evs/119/roll010.xml',
    'https://clerk.house.gov/evs/119/roll100.xml',
    'https://clerk.house.gov/evs/118/roll001.xml',
    'https://clerk.house.gov/evs/118/roll500.xml',
  ];
  
  for (const url of urls) {
    try {
      const resp = await fetch(url);
      console.log(`${url}: ${resp.status} ${resp.ok ? '✅' : '❌'}`);
    } catch (err) {
      console.log(`${url}: ERROR - ${err.message}`);
    }
  }
}

testURLs();
