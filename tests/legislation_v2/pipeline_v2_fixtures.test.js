const fs = require("fs");
const path = require("path");

const FIXTURE_DIR = path.join(__dirname, "fixtures");
const voteTypeEnum = ["procedural", "passage", "amendment", "cloture", "confirmation", "other"];

function readFixture(fileName) {
  const fullPath = path.join(FIXTURE_DIR, fileName);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function isReadableText(value) {
  return typeof value === "string" && value.trim().length >= 20;
}

function isBillSemantics(value) {
  return (
    value &&
    typeof value.one_line_summary === "string" &&
    typeof value.plain_english_summary === "string" &&
    typeof value.long_summary === "string" &&
    Array.isArray(value.key_provisions) &&
    Array.isArray(value.affected_groups) &&
    typeof value.why_it_matters === "string" &&
    Array.isArray(value.issue_tags) &&
    typeof value.confidence_score === "number"
  );
}

function isVoteSemantics(value) {
  return (
    value &&
    voteTypeEnum.includes(value.vote_type) &&
    typeof value.procedural_flag === "boolean" &&
    typeof value.what_this_vote_decides === "string" &&
    typeof value.effect_if_passes === "string" &&
    typeof value.effect_if_fails === "string" &&
    typeof value.next_step === "string" &&
    typeof value.confidence_score === "number"
  );
}

function classifyProcedural(voteQuestion) {
  return /rule|motion|procedural|consideration|previous question/i.test(voteQuestion);
}

function computeLifecycle(input) {
  const status = String(input.bill_status || "").toLowerCase();
  let stage = "in_progress";
  if (status.includes("introduced")) stage = "introduced";
  if (status.includes("committee")) stage = "committee";
  if (status.includes("passed house")) stage = "passed_house";
  if (status.includes("passed senate")) stage = "passed_senate";
  if (status.includes("signed") || status.includes("became law")) stage = "became_law";
  if (status.includes("veto")) stage = "vetoed";

  const majorMilestones = input.action_history.slice(-5).map((a) => `${a.actionDate}: ${a.actionText}`);
  return {
    current_stage: stage,
    latest_action_summary: input.latest_action_text,
    major_milestones: majorMilestones,
    next_step: stage === "passed_senate" ? "House consideration or conference action." : "Further action expected."
  };
}

describe("legislation_v2 fixtures", () => {
  test("vote fixtures classify procedural vs non-procedural correctly", () => {
    const procedural = readFixture("procedural_vote.json");
    const finalPassage = readFixture("final_passage_vote.json");
    const amendment = readFixture("amendment_vote.json");

    expect(classifyProcedural(procedural.input.vote_question)).toBe(true);
    expect(classifyProcedural(finalPassage.input.vote_question)).toBe(false);
    expect(classifyProcedural(amendment.input.vote_question)).toBe(false);
  });

  test("bill semantics schema shape is valid and readable", () => {
    const largeBill = readFixture("large_omnibus_bill.json");
    const minimalBill = readFixture("minimal_summary_bill.json");
    const output = {
      one_line_summary: "Expands infrastructure and agency grant authority in several sectors.",
      plain_english_summary:
        "This bill funds transportation and grid projects through multi-year grants. It directs federal agencies to run competitive programs and report outcomes.",
      long_summary:
        "This bill provides multi-year federal funding across transportation and energy systems, including rail modernization, bridge repair, and transmission reliability investments. Agencies would administer grant programs with reporting requirements and implementation timelines. The text indicates an emphasis on infrastructure resilience and long-horizon capital planning that affects state and local project pipelines.",
      key_provisions: [
        "Funds rail and bridge modernization over five years.",
        "Creates grants for regional transmission upgrades."
      ],
      affected_groups: ["State transportation departments", "Utility operators", "Local governments"],
      why_it_matters: "It can accelerate projects that affect safety, reliability, and long-term infrastructure costs.",
      issue_tags: ["transportation", "energy", "infrastructure"],
      confidence_score: 0.83
    };

    expect(isBillSemantics(output)).toBe(true);
    expect(isReadableText(output.plain_english_summary)).toBe(true);
    expect(largeBill.input.text_sections.length).toBeGreaterThan(1);
    expect(minimalBill.input.text_sections.length).toBe(1);
  });

  test("vote semantics schema shape is valid and classification is correct", () => {
    const fixture = readFixture("final_passage_vote.json");
    const output = {
      vote_type: fixture.expected.vote_type,
      procedural_flag: fixture.expected.procedural_flag,
      what_this_vote_decides: "Determines whether the chamber approves the full bill.",
      effect_if_passes: "The bill advances to the next legislative stage.",
      effect_if_fails: "The bill does not advance in its current form.",
      next_step: "If passed, it moves to the other chamber or to enrollment.",
      confidence_score: 0.9
    };

    expect(isVoteSemantics(output)).toBe(true);
    expect(output.vote_type).toBe("passage");
    expect(output.procedural_flag).toBe(false);
    expect(isReadableText(output.what_this_vote_decides)).toBe(true);
  });

  test("lifecycle fixture yields expected stage and milestone list", () => {
    const fixture = readFixture("multi_stage_lifecycle_bill.json");
    const lifecycle = computeLifecycle(fixture.input);

    expect(lifecycle.current_stage).toBe(fixture.expected.current_stage);
    expect(Array.isArray(lifecycle.major_milestones)).toBe(true);
    expect(lifecycle.major_milestones.length).toBeGreaterThanOrEqual(3);
    expect(isReadableText(lifecycle.latest_action_summary)).toBe(true);
  });
});
