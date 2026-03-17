import dotenv from "dotenv";
import { runPipelineV2 } from "../src/pipeline_v2/jobs/runPipelineV2.ts";
import { createPipelineV2Db } from "../src/pipeline_v2/utils/db.ts";
import type { BillSource, VoteSource } from "../src/pipeline_v2/ingestion/dataSources.ts";
import type { JsonObject } from "../src/pipeline_v2/types.ts";
import type { LlmClient } from "../src/pipeline_v2/semantics/llmClient.ts";

dotenv.config();
if ((process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "development") && process.env.DEV_DB_URL) {
  process.env.DATABASE_URL = process.env.DEV_DB_URL;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";
const MIN_FULL_TEXT_CHARS = Number(process.env.V2_MIN_FULL_TEXT_CHARS || 1500);

interface SeedBill {
  issueId: number;
  canonicalBillId: string;
  title: string | null;
  description: string | null;
  billSummary: string | null;
  billSummaryLength: number;
  voteDate: string | null;
  aiSummary: JsonObject | null;
}

interface SeedVote {
  issueId: number;
  canonicalBillId: string;
  voteDate: string | null;
  chamber: string | null;
  vote: string | null;
  voteMetadata: JsonObject | null;
}

function requireOpenAi(): void {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for real 5-bill v2 comparison run.");
  }
}

function nowRunPrefix(): string {
  return `pilot5:${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
}

function cleanText(input: string | null | undefined): string {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

function pickVoteQuestion(metadata: JsonObject | null): string {
  if (!metadata) return "Vote question not available.";
  const question = metadata["question"] ?? metadata["vote_title"] ?? metadata["title"];
  return cleanText(String(question ?? "Vote question not available."));
}

function pickVoteResult(metadata: JsonObject | null, vote: string | null): string {
  if (!metadata) return cleanText(vote || "Unknown");
  return cleanText(String(metadata["result"] ?? vote ?? "Unknown"));
}

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value ?? NaN);
  return Number.isFinite(n) ? n : null;
}

function createRealLlmClient(): LlmClient {
  requireOpenAi();
  return {
    async generate(args: { system: string; user: string }) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [
            { role: "system", content: args.system },
            { role: "user", content: args.user }
          ],
          temperature: 0.2,
          max_tokens: 900,
          response_format: { type: "json_object" }
        })
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`LLM error ${response.status}: ${body}`);
      }
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string };
      const content = data.choices?.[0]?.message?.content ?? "{}";
      const output = JSON.parse(content) as JsonObject;
      return {
        output,
        modelName: data.model || LLM_MODEL,
        latencyMs: 0
      };
    }
  };
}

async function loadSeedData(db: Awaited<ReturnType<typeof createPipelineV2Db>>) {
  const bills = await db.query<{
    id: number;
    canonical_bill_id: string;
    title: string | null;
    description: string | null;
    bill_summary: string | null;
    bill_summary_length: number;
    vote_date: string | null;
    ai_summary: JsonObject | null;
  }>(
    `
    SELECT
      i.id,
      i.canonical_bill_id,
      i.title,
      i.description,
      i.bill_summary,
      LENGTH(i.bill_summary) AS bill_summary_length,
      i.vote_date,
      i.ai_summary
    FROM issues i
    WHERE i.canonical_bill_id IS NOT NULL
      AND i.ai_summary IS NOT NULL
      AND i.bill_summary IS NOT NULL
      AND LENGTH(i.bill_summary) >= $1
    ORDER BY i.vote_date DESC NULLS LAST, i.id DESC
    LIMIT 5
    `
    ,
    [MIN_FULL_TEXT_CHARS]
  );

  if (bills.rows.length < 5) {
    throw new Error(
      `Need at least 5 issues with ai_summary and bill_summary length >= ${MIN_FULL_TEXT_CHARS}; found ${bills.rows.length}.`
    );
  }

  const issueIds = bills.rows.map((row) => row.id);
  const votes = await db.query<{
    issue_id: number;
    canonical_bill_id: string;
    vote_date: string | null;
    chamber: string | null;
    vote: string | null;
    vote_metadata: JsonObject | null;
  }>(
    `
    SELECT DISTINCT ON (v.issue_id)
      v.issue_id,
      v.canonical_bill_id,
      v.vote_date,
      v.chamber,
      v.vote,
      v.vote_metadata
    FROM votes v
    WHERE v.issue_id = ANY($1::int[])
    ORDER BY v.issue_id, v.vote_date DESC NULLS LAST, v.id DESC
    `,
    [issueIds]
  );

  const voteByIssue = new Map<number, SeedVote>();
  for (const vote of votes.rows) {
    voteByIssue.set(vote.issue_id, {
      issueId: vote.issue_id,
      canonicalBillId: vote.canonical_bill_id,
      voteDate: vote.vote_date,
      chamber: vote.chamber,
      vote: vote.vote,
      voteMetadata: vote.vote_metadata
    });
  }

  const seededBills: SeedBill[] = bills.rows.map((row) => ({
    issueId: row.id,
    canonicalBillId: row.canonical_bill_id,
    title: row.title,
    description: row.description,
    billSummary: row.bill_summary,
    billSummaryLength: Number(row.bill_summary_length || 0),
    voteDate: row.vote_date,
    aiSummary: row.ai_summary
  }));

  return { seededBills, voteByIssue };
}

function createSources(runPrefix: string, seededBills: SeedBill[], voteByIssue: Map<number, SeedVote>): {
  billSource: BillSource;
  voteSource: VoteSource;
  scopedBillPrefix: string;
  scopedVotePrefix: string;
} {
  const billRows: JsonObject[] = [];
  const billActionRows: JsonObject[] = [];
  const billVersionRows: JsonObject[] = [];
  const voteRows: JsonObject[] = [];

  for (const bill of seededBills) {
    const v2BillExternalId = `${runPrefix}:bill:${bill.canonicalBillId}`;
    const summaryText = cleanText(bill.billSummary);
    if (!summaryText || summaryText.length < MIN_FULL_TEXT_CHARS) {
      throw new Error(
        `Bill ${bill.canonicalBillId} does not meet full-text requirement (${MIN_FULL_TEXT_CHARS}+ chars in bill_summary).`
      );
    }

    billRows.push({
      external_id: v2BillExternalId,
      source_issue_id: bill.issueId,
      source_canonical_bill_id: bill.canonicalBillId,
      congress: toNumberOrNull((bill.canonicalBillId.match(/-(\d{3})$/) || [])[1]) ?? 119,
      chamber: "unknown",
      bill_type: cleanText((bill.canonicalBillId.match(/^[a-z]+/) || [])[0] || "unknown"),
      bill_number: cleanText((bill.canonicalBillId.match(/\d+/) || [])[0] || ""),
      title: cleanText(bill.title || "Untitled"),
      official_summary: summaryText,
      current_status: "Unknown",
      introduced_at: bill.voteDate
    });

    billActionRows.push({
      external_id: `${runPrefix}:bill-action:${bill.issueId}:1`,
      bill_external_id: v2BillExternalId,
      action_date: bill.voteDate,
      action_text: "Imported from v1 issue record for comparison pilot.",
      actor: "repwatch_v2_pilot",
      stage: "imported"
    });

    billVersionRows.push({
      external_id: `${runPrefix}:bill-version:${bill.issueId}:1`,
      bill_external_id: v2BillExternalId,
      version_code: "pilot",
      version_name: "Pilot Imported Text",
      issued_at: bill.voteDate,
      text_url: "v1://issues",
      text_content: summaryText
    });

    const vote = voteByIssue.get(bill.issueId);
    if (vote) {
      const meta = vote.voteMetadata || {};
      voteRows.push({
        external_id: `${runPrefix}:vote:${bill.issueId}:1`,
        bill_external_id: v2BillExternalId,
        chamber: cleanText(vote.chamber || "unknown"),
        vote_type: "other",
        vote_question: pickVoteQuestion(meta),
        vote_result: pickVoteResult(meta, vote.vote),
        vote_date: vote.voteDate,
        yea_count: toNumberOrNull(meta["yea_count"]),
        nay_count: toNumberOrNull(meta["nay_count"]),
        present_count: toNumberOrNull(meta["present_count"]),
        not_voting_count: toNumberOrNull(meta["not_voting_count"])
      });
    }
  }

  const billSource: BillSource = {
    sourceName: "pipeline_v2_v1_seed",
    sourceUrl: "v1://issues",
    async fetchBills(): Promise<JsonObject[]> {
      return billRows;
    },
    async fetchBillActions(): Promise<JsonObject[]> {
      return billActionRows;
    },
    async fetchBillTextVersions(): Promise<JsonObject[]> {
      return billVersionRows;
    }
  };

  const voteSource: VoteSource = {
    sourceName: "pipeline_v2_v1_seed",
    sourceUrl: "v1://votes",
    async fetchVotes(): Promise<JsonObject[]> {
      return voteRows;
    }
  };

  return {
    billSource,
    voteSource,
    scopedBillPrefix: `${runPrefix}:bill:`,
    scopedVotePrefix: `${runPrefix}:vote:`
  };
}

async function buildComparison(
  db: Awaited<ReturnType<typeof createPipelineV2Db>>,
  runPrefix: string,
  seededBills: SeedBill[]
) {
  const comparisons = [];
  for (const bill of seededBills) {
    const v2BillExternalId = `${runPrefix}:bill:${bill.canonicalBillId}`;
    const row = await db.query<{
      bill_id: number;
      one_line_summary: string;
      plain_english_summary: string;
      long_summary: string;
      key_provisions: string[];
      why_it_matters: string;
      issue_tags: string[];
      confidence_score: string;
    }>(
      `
      SELECT
        s.bill_id,
        s.one_line_summary,
        s.plain_english_summary,
        s.long_summary,
        s.key_provisions,
        s.why_it_matters,
        s.issue_tags,
        s.confidence_score::text
      FROM v2_bill_semantic_outputs s
      JOIN v2_bills b ON b.id = s.bill_id
      WHERE b.external_id = $1
      ORDER BY s.id DESC
      LIMIT 1
      `,
      [v2BillExternalId]
    );

    const v2 = row.rows[0] || null;
    comparisons.push({
      issueId: bill.issueId,
      canonicalBillId: bill.canonicalBillId,
      title: bill.title,
      v1: {
        short_summary: bill.aiSummary?.["short_summary"] ?? null,
        medium_summary: bill.aiSummary?.["medium_summary"] ?? null,
        key_points: bill.aiSummary?.["key_points"] ?? null,
        categories: bill.aiSummary?.["categories"] ?? null
      },
      v2: v2
        ? {
            one_line_summary: v2.one_line_summary,
            plain_english_summary: v2.plain_english_summary,
            long_summary: v2.long_summary,
            key_provisions: v2.key_provisions,
            why_it_matters: v2.why_it_matters,
            issue_tags: v2.issue_tags,
            confidence_score: v2.confidence_score
          }
        : null
      ,
      source: {
        field: "issues.bill_summary",
        char_count: bill.billSummaryLength,
        min_required_char_count: MIN_FULL_TEXT_CHARS
      }
    });
  }

  return comparisons;
}

async function main() {
  requireOpenAi();
  const db = await createPipelineV2Db();
  const runPrefix = nowRunPrefix();

  const v1Before = await db.query<{ table_name: string; row_count: string }>(
    "SELECT 'issues' AS table_name, COUNT(*)::bigint AS row_count FROM issues UNION ALL SELECT 'votes', COUNT(*)::bigint FROM votes UNION ALL SELECT 'representatives', COUNT(*)::bigint FROM representatives"
  );

  const { seededBills, voteByIssue } = await loadSeedData(db);
  const { billSource, voteSource, scopedBillPrefix, scopedVotePrefix } = createSources(runPrefix, seededBills, voteByIssue);
  const llmClient = createRealLlmClient();

  const summary = await runPipelineV2(
    {
      db,
      billSource,
      voteSource,
      llmClient
    },
    {
      billExternalIdPrefix: scopedBillPrefix,
      voteExternalIdPrefix: scopedVotePrefix
    }
  );

  const comparisons = await buildComparison(db, runPrefix, seededBills);
  const v1After = await db.query<{ table_name: string; row_count: string }>(
    "SELECT 'issues' AS table_name, COUNT(*)::bigint AS row_count FROM issues UNION ALL SELECT 'votes', COUNT(*)::bigint FROM votes UNION ALL SELECT 'representatives', COUNT(*)::bigint FROM representatives"
  );

  const v1Unchanged = JSON.stringify(v1Before.rows) === JSON.stringify(v1After.rows);
  if (!v1Unchanged) {
    throw new Error("V1 row counts changed during v2 compare run.");
  }

  console.log(
    JSON.stringify(
      {
        runPrefix,
        summary,
        v1Unchanged,
        comparisons
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
