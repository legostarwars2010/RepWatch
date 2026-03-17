import type { PipelineV2Db } from "../types";
import { computeBillLifecycle } from "../lifecycle/computeBillLifecycle";

interface BillRow {
  id: number;
  current_status: string | null;
}

export interface SynthesizeBillLifecycleOptions {
  billExternalIdPrefix?: string;
}

interface ActionRow {
  action_date: string | null;
  action_text: string;
  stage: string | null;
}

export async function synthesizeBillLifecycle(
  db: PipelineV2Db,
  options: SynthesizeBillLifecycleOptions = {}
): Promise<number> {
  const billParams: unknown[] = [];
  let billsSql = "SELECT id, current_status FROM v2_bills";
  if (options.billExternalIdPrefix) {
    billParams.push(`${options.billExternalIdPrefix}%`);
    billsSql += " WHERE external_id LIKE $1";
  }
  billsSql += " ORDER BY id ASC";
  const bills = await db.query<BillRow>(billsSql, billParams);
  let updated = 0;

  for (const bill of bills.rows) {
    const actions = await db.query<ActionRow>(
      `
      SELECT action_date, action_text, stage
      FROM v2_bill_actions
      WHERE bill_id = $1
      ORDER BY action_date ASC NULLS LAST, id ASC
      `,
      [bill.id]
    );
    const latestAction = actions.rows.length > 0 ? actions.rows[actions.rows.length - 1].action_text : null;
    const lifecycle = computeBillLifecycle({
      billStatus: bill.current_status,
      latestActionText: latestAction,
      actionHistory: actions.rows.map((row) => ({
        actionDate: row.action_date,
        actionText: row.action_text,
        stage: row.stage
      }))
    });

    await db.query(
      `
      UPDATE v2_bills
      SET lifecycle_json = $2,
          updated_at = NOW()
      WHERE id = $1
      `,
      [bill.id, lifecycle]
    );
    updated += 1;
  }

  return updated;
}
