import { runPipelineV2 } from "../src/pipeline_v2/jobs/runPipelineV2.ts";
import { createPipelineV2Db } from "../src/pipeline_v2/utils/db.ts";
import type { BillSource, VoteSource } from "../src/pipeline_v2/ingestion/dataSources.ts";
import type { JsonObject } from "../src/pipeline_v2/types.ts";
import type { LlmClient } from "../src/pipeline_v2/semantics/llmClient.ts";
import dotenv from "dotenv";

dotenv.config();
if ((process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "development") && process.env.DEV_DB_URL) {
  process.env.DATABASE_URL = process.env.DEV_DB_URL;
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, "");
}

function createMockBillSource(runId: string): BillSource {
  const billExternalId = `smoke:bill:${runId}`;
  return {
    sourceName: "pipeline_v2_smoke",
    sourceUrl: "https://example.invalid/v2/bills",
    async fetchBills(): Promise<JsonObject[]> {
      return [
        {
          external_id: billExternalId,
          congress: 119,
          chamber: "house",
          bill_type: "hr",
          bill_number: "9001",
          title: "Pipeline V2 Smoke Test Bill",
          official_summary: "A smoke test bill for validating isolated pipeline v2 execution.",
          current_status: "Introduced",
          introduced_at: "2026-03-01T00:00:00Z",
          latest_action_at: "2026-03-05T00:00:00Z"
        }
      ];
    },
    async fetchBillActions(): Promise<JsonObject[]> {
      return [
        {
          external_id: `smoke:bill-action:${runId}:1`,
          bill_external_id: billExternalId,
          action_date: "2026-03-01T00:00:00Z",
          action_text: "Introduced in House and referred to committee.",
          actor: "House",
          stage: "introduced"
        },
        {
          external_id: `smoke:bill-action:${runId}:2`,
          bill_external_id: billExternalId,
          action_date: "2026-03-05T00:00:00Z",
          action_text: "Committee hearing held.",
          actor: "Committee",
          stage: "committee"
        }
      ];
    },
    async fetchBillTextVersions(): Promise<JsonObject[]> {
      return [
        {
          external_id: `smoke:bill-version:${runId}:1`,
          bill_external_id: billExternalId,
          version_code: "ih",
          version_name: "Introduced in House",
          issued_at: "2026-03-01T00:00:00Z",
          text_url: "https://example.invalid/v2/bills/9001/text/ih",
          text_content:
            "# Section 1. Findings\nThis bill establishes a smoke test path.\n\n# Section 2. Implementation\nThe agency must report quarterly outcomes."
        }
      ];
    }
  };
}

function createMockVoteSource(runId: string): VoteSource {
  return {
    sourceName: "pipeline_v2_smoke",
    sourceUrl: "https://example.invalid/v2/votes",
    async fetchVotes(): Promise<JsonObject[]> {
      return [
        {
          external_id: `smoke:vote:${runId}:1`,
          bill_external_id: `smoke:bill:${runId}`,
          chamber: "house",
          vote_type: "procedural",
          vote_question: "On ordering the previous question for smoke bill",
          vote_result: "Passed",
          vote_date: "2026-03-10T00:00:00Z",
          yea_count: 220,
          nay_count: 210,
          present_count: 0,
          not_voting_count: 5
        }
      ];
    }
  };
}

function createMockLlmClient(): LlmClient {
  return {
    async generate(args: { system: string; user: string }) {
      const parsed = JSON.parse(args.user) as Record<string, unknown>;
      const task = String(parsed.task ?? "");
      if (task === "generate_bill_semantics_v2") {
        return {
          modelName: "mock-v2-llm",
          latencyMs: 5,
          output: {
            one_line_summary: "Creates a test-only bill artifact for pipeline validation.",
            plain_english_summary: "This smoke test output verifies v2 semantics generation and storage.",
            long_summary:
              "This smoke test output verifies end-to-end operation of the v2 bill semantics pipeline, including prompt generation, structured parsing, schema validation, persistence, and run metadata tracking in isolated v2 tables.",
            key_provisions: ["Adds smoke test coverage for bill semantics."],
            affected_groups: ["Developers", "QA engineers"],
            why_it_matters: "It proves the isolated v2 pipeline can run end-to-end.",
            issue_tags: ["testing", "pipeline"],
            confidence_score: 0.88
          }
        };
      }

      return {
        modelName: "mock-v2-llm",
        latencyMs: 5,
        output: {
          vote_type: "procedural",
          procedural_flag: true,
          what_this_vote_decides: "Determines whether the chamber proceeds under a procedural rule.",
          effect_if_passes: "Debate proceeds under the adopted terms.",
          effect_if_fails: "The chamber must pursue an alternative procedural path.",
          next_step: "Proceed to debate or reschedule under a new rule.",
          confidence_score: 0.84
        }
      };
    }
  };
}

async function fetchV1Counts(db: Awaited<ReturnType<typeof createPipelineV2Db>>) {
  const result = await db.query<{ table_name: string; row_count: string }>(
    "SELECT 'issues' as table_name, COUNT(*)::bigint as row_count FROM issues UNION ALL SELECT 'votes', COUNT(*)::bigint FROM votes UNION ALL SELECT 'representatives', COUNT(*)::bigint FROM representatives"
  );
  return result.rows;
}

async function main() {
  const runId = nowStamp();
  const db = await createPipelineV2Db();
  const beforeV1 = await fetchV1Counts(db);

  const summary = await runPipelineV2({
    db,
    billSource: createMockBillSource(runId),
    voteSource: createMockVoteSource(runId),
    llmClient: createMockLlmClient()
  }, {
    billExternalIdPrefix: `smoke:bill:${runId}`,
    voteExternalIdPrefix: `smoke:vote:${runId}`
  });

  const afterV1 = await fetchV1Counts(db);
  const billOutputs = await db.query<{ count: string }>(
    "SELECT COUNT(*)::bigint AS count FROM v2_bill_semantic_outputs WHERE one_line_summary LIKE 'Creates a test-only bill artifact%'"
  );
  const voteOutputs = await db.query<{ count: string }>(
    "SELECT COUNT(*)::bigint AS count FROM v2_vote_semantic_outputs WHERE what_this_vote_decides LIKE 'Determines whether the chamber proceeds%'"
  );

  const v1Unchanged = JSON.stringify(beforeV1) === JSON.stringify(afterV1);
  if (!v1Unchanged) {
    throw new Error("V1 table counts changed during v2 smoke run.");
  }

  console.log(
    JSON.stringify(
      {
        runId,
        summary,
        v1Before: beforeV1,
        v1After: afterV1,
        v1Unchanged,
        billSemanticMatches: billOutputs.rows[0]?.count ?? "0",
        voteSemanticMatches: voteOutputs.rows[0]?.count ?? "0"
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
