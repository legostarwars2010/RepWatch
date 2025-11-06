#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { callLLM } = require('../services/llm');

const billId = process.argv[2];
if (!billId) {
  console.error('Usage: node scripts/summarize_bill_with_ai.js <legiScan_bill_id>');
  process.exit(1);
}

const dataDir = path.join(__dirname, '..', 'data');
const chunksPath = path.join(dataDir, 'bill_chunks', `lsi-${billId}-chunks.json`);
if (!fs.existsSync(chunksPath)) {
  console.error('No chunks found. Run convert_and_chunk first:', chunksPath);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(chunksPath, 'utf8'));
const chunks = payload.chunks || payload.chunks_text || (payload.chunksArray && payload.chunksArray) || [];

if(!Array.isArray(chunks) || chunks.length === 0){
  console.error('No chunks found in payload or empty chunks array:', chunksPath);
  process.exit(1);
}

async function summarizeChunk(chunk, idx) {
  const system = `You are an expert legislative summarizer. Return JSON with fields: {"chunk_index": <int>, "summary": <short summary of chunk (1-3 sentences)> }`;
  const user = `Chunk ${idx} text:\n${chunk}\n\nReturn a JSON object.`;
  const res = await callLLM({ system, user, max_tokens: 400 });
  return res.json;
}

async function run() {
  console.log('Summarizing', chunks.length, 'chunks');
  const summaries = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const s = await summarizeChunk(chunks[i], i);
      summaries.push(s);
    } catch (err) {
      console.error('Chunk failed', i, err && err.message);
      summaries.push({ chunk_index: i, summary: 'ERROR' });
    }
  }

  // Combine chunk summaries into an overall summary
  const combinedSystem = `You are an expert legislative summarizer. Given a list of short chunk summaries, produce a final structured JSON with: {"short_summary": <one-paragraph plain english>, "detailed_summary": <3-6 bullet points>, "what_a_yay_vote_means": <laymans explanation>, "what_a_nay_vote_means": <laymans explanation> }`;
  const combinedUser = `Chunk summaries:\n${summaries.map(s => `- ${JSON.stringify(s)}`).join('\n')}\n\nReturn a JSON object.`;
  const combined = await callLLM({ system: combinedSystem, user: combinedUser, max_tokens: 700 });

  const outPath = path.join(dataDir, 'bill_summaries', `lsi-${billId}-summary.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ summaries, combined: combined.json, meta: combined.meta }, null, 2), 'utf8');
  console.log('Wrote summary to', outPath);
}

run().catch(e => { console.error(e && e.message); process.exit(1); });
