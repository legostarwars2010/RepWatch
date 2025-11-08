const { callLLM } = require('./llm');

/**
 * Chunk a long bill text into smaller pieces
 */
function chunkBillText(text, maxChunkSize = 6000) {
  if (!text || text.length <= maxChunkSize) {
    return [text];
  }
  
  const chunks = [];
  let currentChunk = '';
  const paragraphs = text.split('\n');
  
  for (const para of paragraphs) {
    if (currentChunk.length + para.length + 1 <= maxChunkSize) {
      currentChunk += (currentChunk ? '\n' : '') + para;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      // If single paragraph is too long, just truncate it
      currentChunk = para.length > maxChunkSize ? para.substring(0, maxChunkSize) : para;
    }
  }
  
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

/**
 * Summarize a bill in chunks if it's too long
 */
async function summarizeIssue(issue) {
  const { title = '', description = '', bill_id = '', full_text = '', bill_summary = '', vote_question = '', stage = '' } = issue || {};
  
  const billText = full_text || bill_summary || description;
  const chunks = chunkBillText(billText, 6000);
  
  // If bill fits in one chunk, process normally
  if (chunks.length === 1) {
    return await summarizeSingleChunk({
      bill_id,
      title,
      description,
      bill_text: chunks[0],
      vote_question,
      stage
    });
  }
  
  // For multi-chunk bills, first summarize each chunk
  console.log(`   📄 Bill has ${chunks.length} chunks, summarizing each...`);
  const chunkSummaries = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunkSystem = 'You are a legislative analyst. Summarize the key provisions in this section of a bill. Be specific about mechanisms, funding, agencies, deadlines, and affected groups. Return a concise paragraph (100-200 words).';
    const chunkUser = JSON.stringify({
      task: 'summarize_bill_section',
      section_number: i + 1,
      total_sections: chunks.length,
      bill_id: bill_id,
      title: title,
      section_text: chunks[i]
    });
    
    try {
      const { json, meta } = await callLLM({ system: chunkSystem, user: chunkUser, max_tokens: 300 });
      chunkSummaries.push(json.summary || json);
      console.log(`   ✓ Chunk ${i + 1}/${chunks.length} summarized (${meta?.latencyMs}ms)`);
      
      // Rate limit between chunks
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.log(`   ⚠ Chunk ${i + 1} failed: ${err.message}`);
      chunkSummaries.push(`Section ${i + 1}: ${chunks[i].substring(0, 200)}...`);
    }
  }
  
  // Now create final summary from the chunk summaries
  const combinedSummary = chunkSummaries.join('\n\n');
  return await summarizeSingleChunk({
    bill_id,
    title,
    description,
    bill_text: combinedSummary,
    vote_question,
    stage,
    is_from_chunks: true
  });
}

async function summarizeSingleChunk({ bill_id, title, description, bill_text, vote_question, stage, is_from_chunks = false }) {
  const system = [
    'You are a nonpartisan legislative analyst and civic educator.',
    'Translate the provided bill/vote data into clear, factual, accessible text (US 8th–10th grade).',
    'Be specific about real-world effects.',
    'Avoid slogans, predictions, or speculation beyond the text provided.',
    '',
    'Rules for vote meanings:',
    '- Never say "a no opposes the bill". Instead, explain outcomes.',
    '- For Yea: state the concrete policy/action that would occur if this vote succeeds (what changes vs. today), who is affected, and the near-term mechanism (e.g., funding, mandate, repeal).',
    '- For Nay: state what remains the same (status quo), what the vote would block or delay, and any alternative path the bill would need (e.g., renegotiation, new amendment).',
    '- Tailor to the vote type (passage, amendment, cloture, rule, motion to recommit, concurrence, discharge). Use the vote_question and stage fields to pick the appropriate template.',
    '- If impact details aren\'t in the text, write: "Not specified in the provided text." Do not infer.',
    '',
    'Style:',
    '- Use neutral verbs: "requires", "authorizes", "prohibits", "funds", "repeals".',
    '- 1–2 sentences per vote meaning, max 45 words each.',
    '- Cite concrete levers (mandates, funding amounts, agencies, deadlines) when present.',
    '',
    'Return JSON with these fields:',
    '1. short_summary: 2-3 sentences explaining what this bill/vote does',
    '2. medium_summary: 5-7 sentences with more context and details',
    '3. key_points: array of 3-5 bullet points highlighting the most important aspects',
    '4. vote_context: { vote_type: "passage|amendment|cloture|rule|recommit|concurrence|discharge", stage: "House floor|Senate floor|committee|conference", status_quo_brief: "One line: what the law/process is today" }',
    '5. what_a_yea_vote_means: concrete outcomes if YES vote succeeds',
    '6. what_a_nay_vote_means: what remains the same, what gets blocked',
    '7. categories: array of 1-3 category tags like ["healthcare","taxation","environment","defense","economy","immigration","education","justice","energy","agriculture","foreign_policy","civil_rights","housing","transportation"]'
  ].join(' ');

  const user = JSON.stringify({
    task: 'summarize_legislative_vote',
    bill_id: bill_id,
    title: title,
    description: description,
    bill_text: bill_text,
    vote_question: vote_question,
    stage: stage,
    note: is_from_chunks ? 'This bill text is a summary of multiple sections combined.' : '',
    instruction: 'Analyze this bill/vote and provide summaries and vote explanations following the templates above. Use the actual bill text to be specific about mechanisms, timelines, and affected groups.'
  });

  const { json, meta } = await callLLM({ system, user, max_tokens: 1000 });
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
