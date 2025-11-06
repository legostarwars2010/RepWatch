const { callLLM } = require('./llm');

async function summarizeIssue(issue) {
  const { title = '', description = '', bill_id = '', full_text = '' } = issue || {};
  const system = [
    'You are a civic information assistant.',
    'Write in plain, neutral language at a US 8th–10th grade reading level.',
    'Return JSON with three fields:',
    '1. short_summary: 2-3 sentences',
    '2. medium_summary: 5-7 sentences (one paragraph)',
    '3. what_a_yea_vote_means: clear explanation',
    '4. what_a_nay_vote_means: clear explanation',
    'Be objective and factual.'
  ].join(' ');

  const user = JSON.stringify({
    task: 'summarize_issue',
    issue: { title, description, bill_id, full_text },
    guidance: { 
      style: 'neutral',
      short_summary_length: '2-3 sentences',
      medium_summary_length: '5-7 sentences, one paragraph with more context',
      include_vote_explanations: true
    }
  });

  const { json, meta } = await callLLM({ system, user, max_tokens: 800 });
  return { json, meta };
}

async function explainVote({ vote, issue }) {
  const normalized = (vote || '').toLowerCase().startsWith('y') ? 'Yea' : 'Nay';
  const system = [
    'You are a civic explainer that describes the plain-meaning implications of a vote.',
    'Be neutral and output JSON only.'
  ].join(' ');

  const user = JSON.stringify({ task: 'explain_vote', vote: normalized, issue });
  const { json, meta } = await callLLM({ system, user, max_tokens: 700 });
  return { json, meta };
}

module.exports = { summarizeIssue, explainVote };
