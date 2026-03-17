export interface BillLifecycleInput {
  billStatus: string | null;
  latestActionText: string | null;
  actionHistory: Array<{ actionDate: string | null; actionText: string; stage: string | null }>;
}

export interface BillLifecycleOutput {
  current_stage: string;
  latest_action_summary: string;
  major_milestones: string[];
  next_step: string;
}

function inferCurrentStage(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("introduced")) return "introduced";
  if (normalized.includes("committee")) return "committee";
  if (normalized.includes("passed house")) return "passed_house";
  if (normalized.includes("passed senate")) return "passed_senate";
  if (normalized.includes("enrolled")) return "enrolled";
  if (normalized.includes("signed") || normalized.includes("became law")) return "became_law";
  if (normalized.includes("veto")) return "vetoed";
  return "in_progress";
}

function inferNextStep(stage: string): string {
  switch (stage) {
    case "introduced":
      return "Committee consideration or referral actions.";
    case "committee":
      return "Possible committee vote, markup, or floor scheduling.";
    case "passed_house":
      return "Senate consideration or amendments.";
    case "passed_senate":
      return "House concurrence, conference action, or enrollment.";
    case "enrolled":
      return "Presidential signature or veto decision.";
    case "became_law":
      return "No further legislative step required.";
    case "vetoed":
      return "Potential veto override vote.";
    default:
      return "Additional legislative actions are expected.";
  }
}

export function computeBillLifecycle(input: BillLifecycleInput): BillLifecycleOutput {
  const status = input.billStatus ?? "Unknown";
  const currentStage = inferCurrentStage(status);
  const latestActionSummary = input.latestActionText ?? "No recent action summary available.";
  const milestones = input.actionHistory
    .slice()
    .sort((a, b) => String(a.actionDate ?? "").localeCompare(String(b.actionDate ?? "")))
    .slice(-5)
    .map((action) => `${String(action.actionDate ?? "Unknown date")}: ${action.actionText}`);

  return {
    current_stage: currentStage,
    latest_action_summary: latestActionSummary,
    major_milestones: milestones,
    next_step: inferNextStep(currentStage)
  };
}
