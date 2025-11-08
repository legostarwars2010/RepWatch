#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { fetchBillStatus } = require('./services/congress_api');

async function test() {
  console.log('Testing Congress.gov API with multiple bills...\n');
  
  // Test with several different bills
  const testBills = [
    'hr3015-119',  // House bill
    'hr1-119',     // Very common first bill
    's1-119',      // Senate bill
    'hr4763-118'   // Previous congress
  ];
  
  for (const billId of testBills) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Fetching: ${billId}`);
    console.log('='.repeat(60));
    
    const result = await fetchBillStatus(billId);
    
    if (result) {
      console.log('✓ Success!');
      console.log('Title:', result.title || 'N/A');
      console.log('Summary:', result.summary ? result.summary.substring(0, 200) + '...' : 'No summary');
      console.log('Full Text:', result.fullText ? `${result.fullText.substring(0, 300)}... (${result.fullText.length} chars total)` : 'No full text');
    } else {
      console.log('✗ No data returned');
    }
    
    // Wait 1 second between requests to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Testing complete!');
}

test();
