const express = require("express");
const router = express.Router();
const { getAllReps } = require("../models/reps");
const { getIssueById, getCachedSummary, isSummaryFresh, isExplainFresh, writeSummary, writeExplain } = require("../models/issues");
const { summarizeIssue, explainVote } = require("../services/llm_wrappers");
const districtResolver = require('../services/district_resolver');

// In-process tiny LRU cache to short-circuit repeated calls within same process
const LRU_CAP = 200;
const lru = new Map(); // key -> { ts, value }
function lruGet(key) {
  const v = lru.get(key);
  if (!v) return null;
  // move to back
  lru.delete(key);
  lru.set(key, v);
  return v.value;
}
function lruSet(key, value) {
  if (lru.has(key)) lru.delete(key);
  lru.set(key, { ts: Date.now(), value });
  if (lru.size > LRU_CAP) {
    const first = lru.keys().next().value;
    lru.delete(first);
  }
}

// Metrics
let llmRequests = 0;
let llmCacheHits = 0;
setInterval(() => {
  const rate = llmRequests === 0 ? 0 : Math.round((llmCacheHits / llmRequests) * 100);
  console.log(`LLM cache hit rate: ${rate}% (${llmCacheHits}/${llmRequests})`);
}, 60000);

// Lookup representatives and their votes by address
router.get('/lookup', async (req, res) => {
  try {
    const address = req.query.address;
    console.log('Lookup request for address:', address);
    
    if (!address) {
      return res.status(400).json({ error: 'Address parameter required' });
    }

    // Resolve address to district
    const district = await districtResolver.resolveAddress(address);
    console.log('Resolved district:', district);
    
    if (!district) {
      return res.status(404).json({ error: 'Could not find district for this address' });
    }

    // Get representatives for this district
    const { pool } = require('../db/pool');
    const repsQuery = `
      SELECT id, name, party, state, district, chamber, bioguide_id, phone, website
      FROM representatives
      WHERE state = $1 AND (district = $2 OR district IS NULL)
      ORDER BY chamber DESC, district ASC NULLS FIRST
    `;
    console.log('Querying for state:', district.state, 'district:', district.district);
    const { rows: reps } = await pool.query(repsQuery, [district.state, district.district]);
    console.log('Found reps:', reps.length);

    if (reps.length === 0) {
      return res.status(404).json({ error: 'No representatives found for this district' });
    }

    // Get recent votes for each representative
    const representatives = await Promise.all(reps.map(async (rep) => {
      const votesQuery = `
        SELECT 
          v.vote,
          v.vote_date,
          v.roll_call,
          v.chamber,
          i.canonical_bill_id as bill_id,
          i.title,
          i.ai_summary,
          i.categories
        FROM votes v
        LEFT JOIN issues i ON v.issue_id = i.id
        WHERE v.representative_id = $1
        ORDER BY v.vote_date DESC, v.roll_call DESC
        LIMIT 50
      `;
      const { rows: votes } = await pool.query(votesQuery, [rep.id]);
      console.log(`Rep ${rep.name}: found ${votes.length} votes`);
      
      // Merge categories into ai_summary for frontend compatibility
      const votesWithMergedData = votes.map(vote => ({
        ...vote,
        ai_summary: vote.ai_summary ? {
          ...vote.ai_summary,
          categories: vote.categories || vote.ai_summary.categories || []
        } : null
      }));
      
      return {
        ...rep,
        votes: votesWithMergedData
      };
    }));

    console.log('Sending response with', representatives.length, 'representatives');
    
    res.json({
      address,
      district: {
        state: district.state,
        district: district.district,
        chamber: district.chamber
      },
      representatives
    });

  } catch (e) {
    console.error('lookup error:', e);
    console.error('Error stack:', e.stack);
    res.status(500).json({ error: 'Failed to lookup representatives' });
  }
});

// Lookup representatives by name
router.get('/lookup-by-name', async (req, res) => {
  try {
    const name = req.query.name;
    console.log('Name lookup request for:', name);
    
    if (!name) {
      return res.status(400).json({ error: 'Name parameter required' });
    }

    const { pool } = require('../db/pool');
    
    // Search for representatives by name (case-insensitive, partial match)
    const repsQuery = `
      SELECT id, name, party, state, district, chamber, bioguide_id, phone, website
      FROM representatives
      WHERE LOWER(name) LIKE LOWER($1)
      ORDER BY name ASC
      LIMIT 20
    `;
    
    const searchPattern = `%${name}%`;
    const { rows: reps } = await pool.query(repsQuery, [searchPattern]);
    console.log('Found reps by name:', reps.length);

    if (reps.length === 0) {
      return res.status(404).json({ error: 'No representatives found with that name' });
    }

    // Get recent votes for each representative
    const representatives = await Promise.all(reps.map(async (rep) => {
      const votesQuery = `
        SELECT 
          v.vote,
          v.vote_date,
          v.roll_call,
          v.chamber,
          i.canonical_bill_id as bill_id,
          i.title,
          i.ai_summary,
          i.categories
        FROM votes v
        LEFT JOIN issues i ON v.issue_id = i.id
        WHERE v.representative_id = $1
        ORDER BY v.vote_date DESC, v.roll_call DESC
        LIMIT 50
      `;
      const { rows: votes } = await pool.query(votesQuery, [rep.id]);
      
      // Merge categories into ai_summary for frontend compatibility
      const votesWithMergedData = votes.map(vote => ({
        ...vote,
        ai_summary: vote.ai_summary ? {
          ...vote.ai_summary,
          categories: vote.categories || vote.ai_summary.categories || []
        } : null
      }));
      
      return {
        ...rep,
        votes: votesWithMergedData
      };
    }));

    console.log('Sending response with', representatives.length, 'representatives');
    
    res.json({
      searchType: 'name',
      query: name,
      representatives
    });

  } catch (e) {
    console.error('name lookup error:', e);
    console.error('Error stack:', e.stack);
    res.status(500).json({ error: 'Failed to lookup representatives by name' });
  }
});

// Get district from address or zip
router.get('/district/resolve', async (req, res) => {
  try {
    const address = req.query.address && req.query.address.toString();
    const zip = req.query.zip && req.query.zip.toString();
    if (!address && !zip) return res.status(400).json({ error: 'address or zip query required' });

    // LRU key
    const key = address ? `addr:${address}` : `zip:${zip}`;
    const mem = lruGet(key);
    if (mem) return res.json(Object.assign({ cached: true, cache: 'memory' }, mem));

    let out = null;
    if (zip) {
      out = await districtResolver.resolveByZip(zip);
    }
    if (!out && address) {
      out = await districtResolver.resolveAddress(address);
    }
    if (!out) return res.status(404).json({ error: 'Could not resolve district' });
    // mark approximate if the resolver used centroid fallback
    if (out && out.source === 'centroid_fallback') out.approximate = true;
    lruSet(key, out);
    return res.json(Object.assign({ cached: false, cache: 'resolver' }, out));
  } catch (e) {
    console.error('district resolve error:', e);
    res.status(500).json({ error: 'Failed to resolve district' });
  }
});

// Lookup representatives by district
router.get('/representatives/:state/:chamber/:district', async (req, res) => {
  try {
    const { state, chamber, district } = req.params;
    const reps = await getAllReps();
    const filtered = reps.filter(r => r.state === state && r.chamber === chamber && String(r.district) === String(district));
    res.json(filtered);
  } catch (e) {
    console.error('reps lookup error:', e);
    res.status(500).json({ error: 'Failed to fetch representatives' });
  }
});

// Filter issues by state/district/chamber (optional query params)
router.get('/issues', async (req, res) => {
  try {
    const { state, district, chamber } = req.query;
    // Simple pass-through: return latest 50 if no filters
    let sql = 'SELECT * FROM issues ORDER BY vote_date DESC NULLS LAST, id DESC LIMIT 50';
    const { rows } = await require('../db/pool').pool.query(sql);
    res.json(rows);
  } catch (e) {
    console.error('issues list error:', e);
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

// GET /api/reps
router.get("/reps", async (req, res) => {
  try {
    const reps = await getAllReps();
    res.json(reps);
  } catch (err) {
    console.error("Error fetching reps:", err);
    res.status(500).json({ error: "Failed to fetch representatives" });
  }
});

// GET /api/issues/:id/summary
router.get('/issues/:id/summary', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const issue = await getIssueById(id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const lruKey = `summary:${id}`;
    if (!refresh) {
      const hit = lruGet(lruKey);
      if (hit) {
        llmCacheHits += 1; llmRequests += 1;
        // Served from in-process memory LRU
        return res.json(Object.assign({ cached: true, cache: 'memory' }, hit));
      }
    }

    const dbRow = await getCachedSummary(id);
    if (!refresh && isSummaryFresh(dbRow)) {
      llmCacheHits += 1; llmRequests += 1;
      const out = Object.assign({ cached: true, cache: 'db', updated_at: dbRow.ai_summary_updated_at }, dbRow.ai_summary);
      lruSet(lruKey, out);
      return res.json(out);
    }

    // Miss: call LLM
    llmRequests += 1;
    const { json, meta } = await summarizeIssue(issue);
    await writeSummary(id, json, meta);
    console.log('LLM summary latencyMs:', meta?.latencyMs);
    const out = { cached: false, cache: 'miss', summary: json, meta };
    lruSet(lruKey, out);
    return res.json(out);
  } catch (e) {
    console.error('summary error:', e);
    res.status(500).json({ error: 'LLM summary failed' });
  }
});

// GET /api/issues/:id/explain?vote=Yea|Nay
router.get('/issues/:id/explain', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const vote = (req.query.vote || 'Yea').toString();
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const lruKey = `explain:${id}:${vote}`;
    if (!refresh) {
      const hit = lruGet(lruKey);
      if (hit) {
        llmCacheHits += 1; llmRequests += 1;
        // Served from in-process memory LRU
        return res.json({ cached: true, cache: 'memory', explanation: hit });
      }
    }

    const issue = await getIssueById(id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const dbRow = await getCachedSummary(id);
    if (!refresh && isExplainFresh(dbRow, vote)) {
      llmCacheHits += 1; llmRequests += 1;
      const explanation = (dbRow.ai_explanations || {})[vote];
      const out = { cached: true, cache: 'db', updated_at: dbRow.ai_summary_updated_at, explanation };
      lruSet(lruKey, explanation);
      return res.json(out);
    }

    // Miss: call LLM
    llmRequests += 1;
    const { json, meta } = await explainVote({ vote, issue });
    await writeExplain(id, vote, json, meta);
    console.log('LLM explain latencyMs:', meta?.latencyMs);
    lruSet(lruKey, json);
    return res.json({ cached: false, cache: 'miss', explanation: json, meta });
  } catch (e) {
    console.error('explain error:', e);
    res.status(500).json({ error: 'LLM explanation failed' });
  }
});

router.get("/_diag", async (req, res) => {
  try {
    const openaiOk = !!process.env.OPENAI_API_KEY;
    const model = process.env.LLM_MODEL || "gpt-4o-mini";

    // Sample issue via model function (avoids direct pool dependency in routes)
    const sampleIssueRow = await getIssueById(1);

    res.json({
      openaiKeyPresent: openaiOk,
      model,
      sampleIssue: sampleIssueRow || null,
      envNodeEnv: process.env.NODE_ENV || null,
    });
  } catch (e) {
    console.error("DIAG error:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

module.exports = router;
