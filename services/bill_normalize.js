// canonical bill normalization helpers
// produce compact canonical forms like HR15, S45, HRES5, HCONRES2, HJRES3
function stripParen(s){
  return String(s || '').replace(/\([^)]*\)/g,'');
}

function collapseWhitespace(s){
  return String(s || '').replace(/[\n\r\t]+/g,' ').replace(/\s+/g,' ').trim();
}

function normalizeBillToken(raw){
  if(!raw) return null;
  let s = String(raw);
  s = stripParen(s);
  s = s.replace(/\u2013|\u2014/g,'-'); // normalize dashes
  s = s.replace(/[.,]/g,' ');
  s = collapseWhitespace(s).toUpperCase();

  // quick reject common non-bill tokens
  const reject = ['QUORUM','PRESENT','NOT VOTING','FAILED','PASSED'];
  if(reject.includes(s)) return s;

  // normalize common prefixes
  s = s.replace(/H\s*\.\s*R\s*\.?/i,'HR ');
  s = s.replace(/H\s*R\s+/i,'HR ');
  s = s.replace(/H\s*\.J\s*\.\s*R\s*E\s*S\.?/i,'HJRES ');
  s = s.replace(/H\s*J\s*RES/i,'HJRES ');
  s = s.replace(/H\s*\.\s*CON\s*\.?\s*RES/i,'HCONRES ');
  s = s.replace(/H\s*CON\s*RES/i,'HCONRES ');
  s = s.replace(/H\s*RES/i,'HRES ');
  s = s.replace(/S\s*\.?\s*/i,'S');

  // collapse spaces introduced
  s = collapseWhitespace(s);

  // find prefix and number
  const m = s.match(/^([A-Z\.\s]+?)\s*(\d+)$/);
  if(m){
    let prefix = m[1].replace(/\s+/g,'').replace(/\./g,'');
    let num = m[2].replace(/^0+/, '');
    if(num==='') num='0';
    return `${prefix}${num}`;
  }

  // also match forms like S001226 (letter + digits)
  const m2 = s.match(/^([A-Z]+)(0*\d+)$/);
  if(m2){
    const prefix = m2[1];
    const num = m2[2].replace(/^0+/, '') || '0';
    return `${prefix}${num}`;
  }

  // catch spaced resolution forms like H RES 5
  const m3 = s.match(/^(HRES|HCONRES|HJRES)(\s*)(\d+)$/);
  if(m3) return `${m3[1]}${String(m3[3]).replace(/^0+/,'')}`;

  // otherwise return a trimmed uppercase token
  return collapseWhitespace(s).toUpperCase();
}

module.exports = { normalizeBillToken };
