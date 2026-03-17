const { pool } = require("../db/pool");

async function run() {
  const tableResult = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'v2_%' ORDER BY table_name"
  );
  const tables = tableResult.rows.map((row) => row.table_name);

  const counts = {};
  const rowsByTable = {};

  for (const table of tables) {
    const countResult = await pool.query(`SELECT COUNT(*)::bigint AS count FROM ${table}`);
    counts[table] = countResult.rows[0].count;
    const rowsResult = await pool.query(`SELECT * FROM ${table} ORDER BY id ASC`);
    rowsByTable[table] = rowsResult.rows;
  }

  const integrity = {};
  integrity.orphanVoteEventsToBills = (
    await pool.query(
      `
      SELECT COUNT(*)::bigint AS count
      FROM v2_vote_events ve
      LEFT JOIN v2_bills b ON b.id = ve.bill_id
      WHERE ve.bill_id IS NOT NULL AND b.id IS NULL
      `
    )
  ).rows[0].count;
  integrity.orphanBillActionsToBills = (
    await pool.query(
      `
      SELECT COUNT(*)::bigint AS count
      FROM v2_bill_actions a
      LEFT JOIN v2_bills b ON b.id = a.bill_id
      WHERE b.id IS NULL
      `
    )
  ).rows[0].count;
  integrity.orphanBillChunksToVersions = (
    await pool.query(
      `
      SELECT COUNT(*)::bigint AS count
      FROM v2_bill_text_chunks c
      LEFT JOIN v2_bill_versions v ON v.id = c.bill_version_id
      WHERE v.id IS NULL
      `
    )
  ).rows[0].count;

  const v1Counts = (
    await pool.query(
      "SELECT 'issues' AS table_name, COUNT(*)::bigint AS row_count FROM issues UNION ALL SELECT 'votes', COUNT(*)::bigint FROM votes UNION ALL SELECT 'representatives', COUNT(*)::bigint FROM representatives"
    )
  ).rows;

  console.log(
    JSON.stringify(
      {
        tables,
        counts,
        integrity,
        v1Counts,
        rowsByTable
      },
      null,
      2
    )
  );
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (_) {
      // noop
    }
  });
