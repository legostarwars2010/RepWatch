const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');
const { pool } = require('../db/pool');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function normalizePosition(text){
  if(!text) return null;
  const t = text.toLowerCase().trim();
  if(t.startsWith('yea')||t==='y' || t.includes('yea')) return 'Yea';
  if(t.startsWith('nay')||t==='n' || t.includes('nay')) return 'Nay';
  if(t.includes('present')||t==='present') return 'Present';
  if(t.includes('not voting')||t==='not voting' || t==='nv') return 'Not Voting';
  return text;
}

async function mapSenatorToRep(lisMemberId){
  if(!lisMemberId) return null;
  try{
    // lis_member_id often matches bioguide or can be mapped via senators table
    const res = await pool.query('SELECT id FROM representatives WHERE lis_member_id = $1 LIMIT 1',[lisMemberId]);
    if(res.rows[0]) return res.rows[0].id;
  }catch(e){ console.warn('mapSenatorToRep error', e && e.message); }
  return null;
}

async function mapBillToIssue(billNumber){
  if(!billNumber) return null;
  const cleaned = billNumber.replace(/\s+/g,'').replace(/\./g,'').toUpperCase();
  try{
    const r = await pool.query('SELECT id FROM issues WHERE bill_id ILIKE $1 LIMIT 1',[`%${cleaned}%`]);
    if(r.rows[0]) return r.rows[0].id;
  }catch(e){ console.warn('mapBillToIssue error', e && e.message); }
  return null;
}

async function upsertVote({rep_id, issue_id, position, rollcall_number, chamber, vote_date, source_url}){
  try{
    await pool.query(
      `INSERT INTO vote_records(rep_id, issue_id, position, rollcall_number, chamber, vote_date, source_url)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (rep_id, rollcall_number, chamber) DO UPDATE SET position = EXCLUDED.position, issue_id = EXCLUDED.issue_id, vote_date = EXCLUDED.vote_date, source_url = EXCLUDED.source_url`,
      [rep_id, issue_id, position, rollcall_number, chamber, vote_date, source_url]
    );
  }catch(e){ console.error('upsertVote error', e && e.message); }
}

async function ingestSenateMenu(){
  const url = 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote_menu_118_2.xml';
  console.log('Fetching Senate vote menu', url);
  const resp = await fetch(url);
  if(!resp.ok) throw new Error('Senate menu fetch failed '+resp.status);
  const txt = await resp.text();
  const obj = parser.parse(txt);

  // menu has vote entries with links to vote detail pages; extract vote ids
  const votes = obj?.vote_menu?.vote || obj?.menu?.vote || [];
  const entries = Array.isArray(votes) ? votes : [votes];
  for(const v of entries){
    const voteUrl = v['@_url'] || v['url'] || v['@_href'] || v['link'];
    if(!voteUrl) continue;
    await ingestSenateVoteDetail(voteUrl);
  }
}

async function ingestSenateVoteDetail(url){
  console.log('Fetching Senate vote detail', url);
  const resp = await fetch(url);
  if(!resp.ok) throw new Error('Senate vote detail fetch failed '+resp.status);
  const txt = await resp.text();
  const obj = parser.parse(txt);

  // Attempt to locate vote metadata and member votes
  const meta = obj?.vote || obj;
  const chamber = 'Senate';
  const rollcall_number = meta?.vote_number || meta?.roll_call || meta?.['@_roll'] || null;
  const voteDate = meta?.vote_date || meta?.date || null;
  const billNumber = meta?.bill || meta?.measure || null;
  const source_url = url;

  // members may be under meta.members.member or meta.roll_votes
  let members = [];
  if(meta?.members?.member) members = Array.isArray(meta.members.member) ? meta.members.member : [meta.members.member];
  else if(meta?.member) members = Array.isArray(meta.member) ? meta.member : [meta.member];

  for(const m of members){
    const lisId = m['@_lis_member_id'] || m['lis_member_id'] || m['member_id'];
    const voteText = m['vote'] || m['voter-vote'] || m['position'];
    const rep_id = await mapSenatorToRep(lisId);
    const issue_id = await mapBillToIssue(billNumber);
    const pos = normalizePosition(voteText);
    if(!rep_id) continue;
    await upsertVote({rep_id, issue_id, position: pos, rollcall_number, chamber, vote_date: voteDate, source_url});
  }
}

module.exports = { ingestSenateMenu, ingestSenateVoteDetail };
