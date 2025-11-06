// Helpers to extract bill token strings from parsed XML structures or raw XML
function extractBillToken(rc, rawText){
  if(!rc && !rawText) return null;
  // Try known parsed positions first
  let billNumber = null;
  try{
    billNumber = (rc && ((rc.bill && (rc.bill.bill_number || rc.bill)) || rc.measure)) || null;
  }catch(e){ billNumber = null; }

  // try <legis-num> inside parsed object
  if(!billNumber && rc){
    try{
      const cand = rc?.bill?.['legis-num'] || rc?.bill?.['legis_num'] || rc?.['legis-num'] || rc?.['legis_num'];
      if(cand){ billNumber = Array.isArray(cand) ? cand[0] : cand; }
    }catch(e){}
  }

  // final fallback: regex on raw XML
  if(!billNumber && rawText){
    const m = /<legis-num[^>]*>([^<]+)<\/legis-num>/i.exec(String(rawText));
    if(m && m[1]) billNumber = m[1].trim();
  }

  return billNumber || null;
}

module.exports = { extractBillToken };
