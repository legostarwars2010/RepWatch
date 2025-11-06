const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');
const { pool } = require('../db/pool');
const util = require('util');
const { normalizeBillToken } = require('./bill_normalize');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function normalizePosition(text){
  if(!text) return null;
  const t = text.toLowerCase().trim();
  if(t.startsWith('yea')||t==='y' || t.includes('yea') || t === 'aye') return 'Yea';
  if(t.startsWith('nay')||t==='n' || t.includes('nay') || t === 'no') return 'Nay';
  if(t.includes('present')||t==='present') return 'Present';
  if(t.includes('not voting')||t==='not voting' || t==='nv') return 'Not Voting';
  return text;
}

// Robustly extract vote text from a parsed member/record object.
// Returns the raw extracted string (may be null) — caller should call normalizePosition() to produce canonical values.
function extractVoteFromMember(m){
  if(!m) return null;
  // Common candidate properties
  let v = m['vote'] || m['vote-position'] || m['voter-vote'] || m['@_vote'] || m['vote_text'] || null;

  // Some feeds embed <vote> as an object or unexpected structure — try other shapes
  if(!v){
    // recorded-vote shape sometimes nests vote as m['recorded-vote'] or similar
    if(m['recorded-vote'] && typeof m['recorded-vote'] === 'object' && m['recorded-vote'].vote) v = m['recorded-vote'].vote;
  }

  // If vote is an object (e.g., parsed element with attributes), try to grab its text
  if(v && typeof v === 'object'){
    if(v['#text']) v = v['#text'];
    else if(v['@_value']) v = v['@_value'];
    else v = null;
  }

  if(typeof v === 'string') v = v.trim();

  // Heuristic: accept only values that look like actual vote positions. If it looks like a person name (contains a space or parentheses and letters), reject it.
  if(typeof v === 'string'){
    const s = v.toLowerCase();
    const looksLikeVote = /^(yea|nay|present|not voting|not-voting|nv|y|n|aye|no)$/i.test(s);
    if(looksLikeVote) return v;
    // also accept short tokens like 'Y'/'N'
    if(/^[yn]$/i.test(s)) return v;
    // Accept common variants: 'Not Voting'
    if(s.includes('not voting') || s.includes('present')) return v;
    // If it's clearly a person name (contains comma or parentheses or multiple capitalized words), reject
    if(/[(),]/.test(v) || /^[A-Z][a-z]+\s+[A-Z]/.test(v)) return null;
  }

  return v;
}

async function mapHouseMemberToRep(nameId){
  if(!nameId) return null;
  try{
    // nameId may already be a bioguide id (e.g. A000370) or may contain one in parentheses
    // Try direct bioguide match first
    const directBio = nameId.match(/^[A-Za-z]\d+$/);
    if(directBio){
      const bioguide = nameId;
      const res = await pool.query('SELECT id FROM representatives WHERE bioguide_id = $1 LIMIT 1',[bioguide]);
      if(res.rows[0]) return res.rows[0].id;
    }
    // Try to extract bioguide from parentheses like "Smith, John (A000123)"
    const m = nameId.match(/\(([A-Za-z0-9]+)\)/);
    if(m && m[1]){
      const bioguide = m[1];
      const res = await pool.query('SELECT id FROM representatives WHERE bioguide_id = $1 LIMIT 1',[bioguide]);
      if(res.rows[0]) return res.rows[0].id;
    }
    // fallback: try matching by name (use the stored 'name' column)
    const last = nameId.split(',')[0].trim();
    const res2 = await pool.query('SELECT id FROM representatives WHERE name ILIKE $1 LIMIT 1',[last+'%']);
    if(res2.rows[0]) return res2.rows[0].id;
  }catch(e){ console.warn('mapHouseMemberToRep error', e && e.message); }
  return null;
}

async function mapBillToIssue(billNumber){
  if(!billNumber) return null;
  try{
    // normalize input token and produce candidate strings
    const sRaw = String(billNumber || '');
    const s = normalizeBillToken(sRaw);
    const candidates = [];
    if(s) candidates.push(s);
    // also add a cleaned alphanum fallback
    const cleaned = sRaw.replace(/[^0-9A-Za-z]/g,'').toUpperCase();
    if(cleaned && !candidates.includes(cleaned)) candidates.push(cleaned);

    // Fast path: check issue_identifiers table for exact normalized match
    try{
      for(const c of candidates){
        const rr = await pool.query('SELECT issue_id FROM issue_identifiers WHERE normalized_id = $1 LIMIT 1', [c.toUpperCase()]);
        if(rr.rows[0]) return rr.rows[0].issue_id;
      }
    }catch(e){ /* ignore and continue to other heuristics */ }

    // Prefer canonical_bill_id when present
    // 1) Prefilter issues that mention the candidate in canonical_bill_id, bill_id or external_ids (small result set)
    for(const c of candidates){
      const rows = (await pool.query(
        `SELECT id, canonical_bill_id, bill_id, external_ids, title FROM issues
         WHERE (canonical_bill_id ILIKE $1 OR bill_id ILIKE $1 OR external_ids::text ILIKE $1)
         LIMIT 50`, [`%${c}%`]
      )).rows || [];
      // Normalize stored fields and compare precisely in JS
      for(const row of rows){
        try{
          const storedCanon = row.canonical_bill_id ? String(row.canonical_bill_id) : '';
          if(storedCanon){
            const sn = normalizeBillToken(storedCanon);
            if(sn && candidates.includes(sn)) return row.id;
          }
          const storedBillId = row.bill_id ? String(row.bill_id) : '';
          if(storedBillId){
            const sb = normalizeBillToken(storedBillId);
            if(sb && candidates.includes(sb)) return row.id;
          }
          if(row.external_ids){
            // external_ids may be JSON; stringify and try to extract obvious tokens
            let ext = row.external_ids;
            if(typeof ext !== 'string') ext = JSON.stringify(ext);
            // quick presence check
            for(const cand of candidates){
              if(ext.toUpperCase().includes(cand.toUpperCase())) return row.id;
            }
            // try to parse array/object fields and normalize any id-like values
            try{
              const parsed = typeof row.external_ids === 'string' ? JSON.parse(row.external_ids) : row.external_ids;
              const values = [];
              (function walk(o){
                if(!o) return;
                if(typeof o === 'string') values.push(o);
                else if(typeof o === 'number') values.push(String(o));
                else if(Array.isArray(o)) for(const it of o) walk(it);
                else if(typeof o === 'object') for(const k of Object.keys(o)) walk(o[k]);
              })(parsed);
              for(const v of values){
                const vn = normalizeBillToken(String(v));
                if(vn && candidates.includes(vn)) return row.id;
              }
            }catch(e){ /* ignore parse errors */ }
          }
        }catch(e){ /* continue on per-row errors */ }
      }
    }

    // Try matching bill_id directly
    // 2) Direct bill_id search (simple ILIKE) as fallback
    for(const c of candidates){
      const r = await pool.query('SELECT id, bill_id FROM issues WHERE bill_id ILIKE $1 LIMIT 1', [`%${c}%`]);
      if(r.rows[0]) return r.rows[0].id;
    }

    // As a last resort, try using the raw text to match titles
  // 3) Title match fallback
  const r2 = await pool.query('SELECT id FROM issues WHERE title ILIKE $1 LIMIT 1', [`%${s}%`]);
  if(r2.rows[0]) return r2.rows[0].id;
    // If still not found, try searching JSONB external_ids (or any JSON text) for the candidate strings
    try{
      for(const c of candidates){
        // search the external_ids jsonb text for occurrences of the candidate (case-insensitive)
        const r3 = await pool.query(`SELECT id FROM issues WHERE external_ids::text ILIKE $1 LIMIT 1`, [`%${c}%`]);
        if(r3.rows[0]) return r3.rows[0].id;
      }
      // as a final fallback, search the entire external_ids text blob for the original raw string
      const r4 = await pool.query(`SELECT id FROM issues WHERE external_ids::text ILIKE $1 LIMIT 1`, [`%${s}%`]);
      if(r4.rows[0]) return r4.rows[0].id;
    }catch(e){ console.warn('mapBillToIssue external_ids search error', e && e.message); }
  }catch(e){ console.warn('mapBillToIssue error', e && e.message); }
  return null;
}

async function upsertVote({rep_id, issue_id, vote, explanation}){
  try{
    await pool.query(
      `INSERT INTO vote_records(rep_id, issue_id, issue_token, vote, explanation)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (rep_id, issue_token) DO UPDATE SET vote = EXCLUDED.vote, explanation = EXCLUDED.explanation, issue_id = COALESCE(EXCLUDED.issue_id, vote_records.issue_id)`,
      [rep_id, issue_id, null, vote, explanation]
    );
  }catch(e){ console.error('upsertVote error', e && e.message); }
}

async function ingestHouseRoll(rollNumber){
  const url = `https://clerk.house.gov/evs/2025/roll${String(rollNumber).padStart(3,'0')}.xml`;
  console.log('Fetching House roll', rollNumber, url);
  const resp = await fetch(url);
  if(!resp.ok) throw new Error('House feed fetch failed '+resp.status);
  const txt = await resp.text();
  const obj = parser.parse(txt);

  // Structure varies; try to find rollcall data
  const rc = obj?.rollcall_vote || obj?.rollcall || obj;
  const voteDate = rc?.date || rc?.action_date || null;
  const { extractBillToken } = require('./bill_extract');
  const billNumber = extractBillToken(rc, txt);
  const chamber = 'House';
  const rollcall_number = rollNumber;
  const source_url = url;

  // Votes list: may be in rc.house_votes.member or rc.members
  let members = [];
  if (rc?.members?.member) members = Array.isArray(rc.members.member) ? rc.members.member : [rc.members.member];
  else if (rc?.house_votes?.member) members = Array.isArray(rc.house_votes.member) ? rc.house_votes.member : [rc.house_votes.member];
  else if (rc?.['recorded-vote'] || rc?.recorded_vote) {
    // Some feeds use repeated <recorded-vote> elements each containing <legislator> and <vote>
    const recs = rc['recorded-vote'] || rc.recorded_vote;
    members = Array.isArray(recs) ? recs : [recs];
  }

  for(const m of members){
    // Support multiple member shapes. Some feeds embed a <legislator> child.
    let nameId = m['@_name-id'] || m['name-id'] || m['name'] || m['voter-name'];
    let voteText = m['vote'] || m['vote-position'] || m['voter-vote'] || m['@_vote'];
    if(!nameId && m.legislator){
      // m.legislator may be an object with attributes or a string
      const leg = m.legislator;
      if(typeof leg === 'string') nameId = leg;
      else nameId = leg['@_name-id'] || leg['name-id'] || leg['@_id'] || leg['#text'] || leg['text'] || null;
    }
    if(!voteText && m.vote) voteText = m.vote;
    const rep_id = await mapHouseMemberToRep(nameId);
    const issue_id = await mapBillToIssue(billNumber);
    const pos = normalizePosition(voteText);
    if(!rep_id) continue;
    await upsertVote({rep_id, issue_id, position: pos, rollcall_number, chamber, vote_date: voteDate, source_url});
  }
}

module.exports = { ingestHouseRoll, mapHouseMemberToRep, mapBillToIssue, normalizePosition, upsertVote, extractVoteFromMember };
