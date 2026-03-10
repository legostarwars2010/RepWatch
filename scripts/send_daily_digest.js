#!/usr/bin/env node
/**
 * Step 3: Weekly digest notification job.
 * For each subscriber, fetches the actual last 5 House votes for their subscribed reps,
 * builds one email per user, sends via Resend (idempotent by digest:userId:date).
 *
 * Run: node scripts/send_daily_digest.js
 * Env: DATABASE_URL, RESEND_API_KEY. Optional: NOTIFICATION_BASE_URL, FROM_EMAIL.
 */
require('dotenv').config();
const { Resend } = require('resend');
const { pool } = require('../db/pool');

const FROM_EMAIL = process.env.FROM_EMAIL || 'RepWatch <updates@updates.repwatch.co>';
const BASE_URL = (process.env.NOTIFICATION_BASE_URL || 'https://repwatch.co').replace(/\/$/, '');
const MAX_VOTES_PER_EMAIL = 5;

/** List of { user_id, email, unsub_token, rep_ids: number[] } for active subscribers */
async function getSubscribersWithReps() {
  const r = await pool.query(
    `SELECT rs.user_id, rs.representative_id, u.email, u.unsub_token
     FROM rep_subscriptions rs
     JOIN users u ON u.id = rs.user_id
     WHERE rs.paused_at IS NULL`
  );
  const byUser = new Map();
  for (const row of r.rows) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, { user_id: row.user_id, email: row.email, unsub_token: row.unsub_token, rep_ids: [] });
    }
    byUser.get(row.user_id).rep_ids.push(row.representative_id);
  }
  return [...byUser.values()];
}

/** Per-rep: last 5 votes by date (any chamber), deduped by bill_id + vote_date. Returns { rep_id, rep_name, state, district, chamber, party, votes }[]. */
async function getLast5VotesPerRep(repIds) {
  if (repIds.length === 0) return [];
  const result = await pool.query(
    `SELECT v.id AS vote_id, v.representative_id, v.vote_date, v.vote, v.roll_call, v.issue_id, v.vote_metadata,
            i.title AS issue_title, i.canonical_bill_id, i.bill_summary, i.ai_summary, i.description AS issue_description,
            r.name AS rep_name, r.state AS rep_state, r.district AS rep_district, r.party AS rep_party,
            r.chamber AS rep_chamber
     FROM votes v
     LEFT JOIN issues i ON v.issue_id = i.id
     JOIN representatives r ON v.representative_id = r.id
     WHERE v.representative_id = ANY($1::int[])
     ORDER BY v.representative_id, v.vote_date DESC NULLS LAST, v.id DESC`,
    [repIds]
  );
  const byRep = new Map();
  for (const row of result.rows) {
    const repId = row.representative_id;
    if (!byRep.has(repId)) {
      byRep.set(repId, {
        rep_id: repId,
        rep_name: row.rep_name,
        state: row.rep_state,
        district: row.rep_district,
        chamber: row.rep_chamber,
        party: row.rep_party,
        votes: [],
        seenKeys: new Set(),
      });
    }
    const rec = byRep.get(repId);
    const billKey = `${row.canonical_bill_id || row.issue_id || row.roll_call || row.vote_id}_${row.vote_date}`;
    if (rec.seenKeys.has(billKey)) continue;
    rec.seenKeys.add(billKey);
    if (rec.votes.length < MAX_VOTES_PER_EMAIL) rec.votes.push(row);
  }
  return [...byRep.values()].map(({ seenKeys, ...rest }) => rest);
}

function formatDate(voteDate) {
  if (!voteDate) return '—';
  const d = new Date(voteDate);
  if (isNaN(d.getTime())) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function voteLabel(vote) {
  if (!vote) return '—';
  const v = String(vote).toLowerCase();
  if (v === 'yes') return 'Yes';
  if (v === 'no') return 'No';
  if (v === 'present' || v === 'abstain') return 'Present';
  return vote;
}

/** Inline style for vote (green YES, red NO, default for Present/other) */
function voteStyle(vote) {
  const v = String(vote).toLowerCase();
  if (v === 'yes') return 'color:#059669; font-weight:700;';
  if (v === 'no') return 'color:#dc2626; font-weight:700;';
  return 'font-weight:600; color:#374151;';
}

function repSubtitle(section) {
  const parts = [];
  if (section.state) parts.push(section.state);
  if (section.chamber === 'senate') {
    parts.push('Senator');
  } else if (section.district != null && section.district !== '' && section.district !== 0) {
    parts.push(`District ${section.district}`);
  }
  const loc = parts.length ? parts.join(' ') : '';
  if (section.party && String(section.party).trim()) return loc ? `${loc} • ${section.party}` : section.party;
  return loc || '';
}

const EMAIL_TITLE_MAX = 72;

/** Bill title: prefer AI plain-English, else issue title, vote_title (senate), question, or bill ID */
function billTitle(v) {
  const ai = v.ai_summary && typeof v.ai_summary === 'object';
  if (ai && v.ai_summary.plain_english_title && String(v.ai_summary.plain_english_title).trim())
    return String(v.ai_summary.plain_english_title).trim();
  if (v.issue_title && String(v.issue_title).trim()) return v.issue_title.trim();
  const meta = v.vote_metadata && typeof v.vote_metadata === 'object' ? v.vote_metadata : {};
  const vt = meta.vote_title;
  if (vt && typeof vt === 'string' && vt.trim()) return vt.trim();
  const q = meta.question;
  if (q && typeof q === 'string' && q.trim()) return q.trim();
  if (v.canonical_bill_id && !String(v.canonical_bill_id).startsWith('senate-roll:'))
    return String(v.canonical_bill_id);
  return '—';
}

/** Truncate title for email display so long procedural text doesn't dominate */
function emailTitleDisplay(title) {
  if (!title || title.length <= EMAIL_TITLE_MAX) return title;
  return title.slice(0, EMAIL_TITLE_MAX - 1).trim() + '…';
}

/** True if text looks like Congress.gov boilerplate, not a real summary */
function isBoilerplate(s) {
  if (!s || typeof s !== 'string') return true;
  const t = s.trim();
  return /^\[?Congressional Bills/i.test(t) || /^\[?From the U\.S\./i.test(t) || t.length < 20;
}

/** One-sentence summary: prefer AI content; avoid Congress.gov boilerplate (e.g. "[Congressional Bills 119th Congress]...") */
function oneSentenceSummary(v) {
  const firstSentence = (s) => {
    if (!s || typeof s !== 'string') return '';
    const trimmed = s.trim();
    const match = trimmed.match(/^[^.!?]+[.!?]?/);
    return match ? match[0].trim() : trimmed.slice(0, 120) + (trimmed.length > 120 ? '…' : '');
  };
  const ai = v.ai_summary && typeof v.ai_summary === 'object';
  if (ai && v.ai_summary.procedural_subtext && String(v.ai_summary.procedural_subtext).trim())
    return String(v.ai_summary.procedural_subtext).trim();
  if (ai && v.ai_summary.short_summary && String(v.ai_summary.short_summary).trim()) {
    const ss = firstSentence(String(v.ai_summary.short_summary));
    if (!isBoilerplate(ss)) return ss;
  }
  if (ai && Array.isArray(v.ai_summary.key_points) && v.ai_summary.key_points[0]) {
    const kp = firstSentence(String(v.ai_summary.key_points[0]));
    if (!isBoilerplate(kp)) return kp;
  }
  if (v.bill_summary && String(v.bill_summary).trim()) {
    const bs = firstSentence(v.bill_summary);
    if (!isBoilerplate(bs)) return bs;
  }
  if (v.issue_description && String(v.issue_description).trim()) {
    const id = firstSentence(v.issue_description);
    if (!isBoilerplate(id)) return id;
  }
  return '';
}

function htmlDigest(userEmail, unsubToken, repSections) {
  const filtered = repSections.filter((s) => s.votes.length > 0);
  const weekSummary = filtered
    .map((s) => `${escapeHtml(s.rep_name)} voted on ${s.votes.length} bill${s.votes.length === 1 ? '' : 's'}`)
    .join('<br>\n    ');
  const sections = filtered.map((section) => {
    const subtitle = repSubtitle(section);
    const rows = section.votes
      .map((v) => {
        const hasIssue = v.issue_id != null;
        const linkUrl = hasIssue ? `${BASE_URL}/issues/${v.issue_id}` : `${BASE_URL}/reps/${v.representative_id}`;
        const title = emailTitleDisplay(billTitle(v));
        const summary = oneSentenceSummary(v);
        const summaryShort = summary.length > 160 ? summary.slice(0, 157) + '…' : summary;
        const voteL = voteLabel(v.vote);
        const voteSty = voteStyle(v.vote);
        return `<tr>
          <td style="padding: 16px 12px 16px 0; border-bottom: 1px solid #e5e7eb; vertical-align: top; width: 45%;">
            <div style="font-weight: 700; font-size: 15px; color: #111827; margin-bottom: 4px;">${escapeHtml(title)}</div>
            ${summaryShort ? `<div style="font-size: 13px; color: #6b7280; line-height: 1.4;">${escapeHtml(summaryShort)}</div>` : ''}
          </td>
          <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; white-space: nowrap;"><span style="${voteSty}">${escapeHtml(voteL)}</span></td>
          <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; white-space: nowrap; font-size: 14px; color: #374151;">${escapeHtml(formatDate(v.vote_date))}</td>
          <td style="padding: 16px 0 16px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
            <a href="${linkUrl}" style="display: inline-block; padding: 6px 12px; background: #2563eb; color: #fff !important; text-decoration: none; font-size: 12px; font-weight: 600; border-radius: 6px;">View full breakdown →</a>
          </td>
        </tr>`;
      })
      .join('');
    return `
    <div style="margin: 32px 0 0 0;">
      <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 4px 0; color: #111827;">${escapeHtml(section.rep_name)}</h2>
      ${subtitle ? `<p style="margin: 0 0 12px 0; font-size: 14px; color: #6b7280;">${escapeHtml(subtitle)}</p>` : ''}
      <p style="margin: 0 0 12px 0; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Recent votes</p>
      <table style="width: 100%; border-collapse: collapse;">
        <thead><tr style="border-bottom: 1px solid #e5e7eb;">
          <th style="padding: 10px 12px 10px 0; text-align: left; font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Bill</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Vote</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Date</th>
          <th style="padding: 10px 0 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Details</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');
  const unsubUrl = `${BASE_URL}/api/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.5; color: #1f2937; background: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 4px 0; color: #111827;">RepWatch Weekly</h1>
    <p style="font-size: 16px; font-weight: 500; margin: 0 0 8px 0; color: #374151;">How your representatives voted this week</p>
    <p style="margin: 0 0 24px 0; font-size: 14px; color: #6b7280;">Here are the 5 most recent votes for each representative you follow.</p>
    <div style="height: 1px; background: #e5e7eb; margin: 0 0 8px 0;"></div>
    ${weekSummary ? `<p style="margin: 16px 0 0 0; font-size: 14px; color: #374151;">This week:</p><p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">${weekSummary}</p>` : ''}
    ${sections}
    <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0 0 4px 0; font-size: 14px; color: #374151;">See more votes and bill summaries at</p>
      <p style="margin: 0 0 8px 0;"><a href="${BASE_URL}" style="color: #2563eb; font-weight: 500;">${BASE_URL}</a></p>
      <p style="margin: 0 0 20px 0; font-size: 13px; color: #6b7280;">Track how your representatives vote in plain English.</p>
      <p style="margin: 0 0 8px 0; font-size: 12px; color: #9ca3af;">You received this email because you subscribed to updates about your representative on RepWatch.</p>
      <p style="margin: 0;"><a href="${unsubUrl}" style="color: #6b7280; font-size: 12px;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is required');
    process.exit(1);
  }
  const resend = new Resend(apiKey);
  const today = new Date().toISOString().slice(0, 10);
  const subscribers = await getSubscribersWithReps();
  let sent = 0;
  for (const sub of subscribers) {
    const repSections = await getLast5VotesPerRep(sub.rep_ids);
    const totalVotes = repSections.reduce((n, s) => n + s.votes.length, 0);
    if (totalVotes === 0) continue;
    const eventKey = `digest:${sub.user_id}:${today}`;
    try {
      const insert = await pool.query(
        `INSERT INTO notification_events (user_id, event_type, event_key, payload)
         VALUES ($1, 'daily_digest', $2, $3::jsonb)
         ON CONFLICT (event_key) DO NOTHING
         RETURNING id`,
        [sub.user_id, eventKey, JSON.stringify({ rep_count: repSections.length, vote_count: totalVotes })]
      );
      if (insert.rows.length === 0) continue;
      const html = htmlDigest(sub.email, sub.unsub_token, repSections);
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [sub.email],
        subject: `RepWatch Weekly: How your ${repSections.length} representative(s) voted`,
        html,
      });
      if (error) {
        console.error('Resend error for user', sub.user_id, error);
        continue;
      }
      await pool.query(
        'UPDATE notification_events SET sent_at = now() WHERE event_key = $1',
        [eventKey]
      );
      sent++;
    } catch (e) {
      console.error('Send error for user', sub.user_id, e);
    }
  }
  console.log('Sent', sent, 'digest(s).');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
