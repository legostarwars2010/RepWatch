/**
 * Service to fetch bill text from multiple sources
 * Tries Congress.gov API first, then GovInfo.gov API for full text
 */

/**
 * Fetch bill data and full text
 * @param {string} billId - Canonical bill ID like "hr3015-119"
 * @returns {Promise<Object|null>} Bill data with full text or null
 */
async function fetchBillStatus(billId) {
  // Parse bill ID: "hr3015-119" -> { type: "hr", number: "3015", congress: "119" }
  const match = billId.match(/^([a-z]+)(\d+)-(\d+)$/);
  if (!match) {
    console.error(`Invalid bill ID format: ${billId}`);
    return null;
  }

  const [, billType, billNumber, congress] = match;
  
  // Congress.gov API v3 with API key
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    console.error('CONGRESS_API_KEY not set in environment');
    return null;
  }
  
  // First, get bill metadata
  const billUrl = `https://api.congress.gov/v3/bill/${congress}/${billType}/${billNumber}?api_key=${apiKey}&format=json`;
  
  try {
    const billResponse = await fetch(billUrl);
    
    if (!billResponse.ok) {
      console.error(`API returned ${billResponse.status} for ${billId}`);
      return null;
    }
    
    const billData = await billResponse.json();
    const bill = billData.bill;
    
    if (!bill) return null;
    
    let title = bill.title || null;
    let summary = null;
    let fullText = null;
    
    // Get CRS summary if available
    if (bill.summaries && Array.isArray(bill.summaries) && bill.summaries.length > 0) {
      const latestSummary = bill.summaries[bill.summaries.length - 1];
      summary = latestSummary.text || null;
    }
    
    // Try to get bill text - Congress.gov provides it at a predictable URL
    const textFormats = ['ih', 'is', 'eh', 'es', 'rh', 'rs', 'enr']; // Common bill version codes
    
    for (const format of textFormats) {
      try {
        const textUrl = `https://www.congress.gov/${congress}/bills/${billType}${billNumber}/BILLS-${congress}${billType}${billNumber}${format}.htm`;
        const textResponse = await fetch(textUrl);
        
        if (textResponse.ok) {
          const htmlText = await textResponse.text();
          // Strip HTML tags and clean up
          fullText = htmlText
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim();
          
          // Limit to reasonable size for LLM (first 8000 chars usually captures the main content)
          if (fullText.length > 8000) {
            fullText = fullText.substring(0, 8000) + '... [truncated]';
          }
          
          break; // Found text, stop trying other formats
        }
      } catch (err) {
        // Try next format
        continue;
      }
    }
    
    return {
      title: title,
      summary: summary,
      fullText: fullText,
      congress: congress,
      billType: billType,
      billNumber: billNumber
    };
    
  } catch (error) {
    console.error(`Error fetching ${billId}:`, error.message);
    return null;
  }
}

module.exports = {
  fetchBillStatus
};
