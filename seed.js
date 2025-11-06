// seed.js
require('dotenv').config();
const { pool } = require("./db/pool");

async function seed() {
  console.log("🌱 Seeding...");

  // Representatives (sample)
  const reps = [
    { name: "Alex Johnson", chamber: "house", state: "CA", district: "12", party: "D", contact_json: { phone: "555-1111", email: "alex@example.com" } },
    { name: "Morgan Lee",   chamber: "senate", state: "CA", district: null, party: "D", contact_json: { phone: "555-2222", email: "morgan@example.com" } },
    { name: "Riley Kim",    chamber: "senate", state: "CA", district: null, party: "R", contact_json: { phone: "555-3333", email: "riley@example.com" } },
  ];

  // Issues / Bills (sample)
  const issues = [
    { title: "Clean Energy Act", description: "Invests in renewables and grid upgrades.", bill_id: "HR-1001", vote_date: "2024-10-01" },
    { title: "Education Funding Reform", description: "Reallocates federal funding to public schools.", bill_id: "S-220", vote_date: "2024-11-15" },
  ];

  // Insert reps (idempotent via WHERE NOT EXISTS)
  for (const r of reps) {
    await pool.query(
      `INSERT INTO representatives (name, chamber, state, district, party, contact_json)
       SELECT $1, $2, $3, $4, $5, $6
       WHERE NOT EXISTS (
         SELECT 1 FROM representatives WHERE name=$1 AND chamber=$2 AND state=$3 AND (district IS NOT DISTINCT FROM $4)
       );`,
      [r.name, r.chamber, r.state, r.district, r.party, r.contact_json]
    );
  }

  // Insert issues
  for (const i of issues) {
    await pool.query(
      `INSERT INTO issues (title, description, bill_id, vote_date)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM issues WHERE bill_id=$3);`,
      [i.title, i.description, i.bill_id, i.vote_date]
    );
  }

  // Link votes: fetch ids first
  const { rows: repRows }   = await pool.query(`SELECT id, name FROM representatives ORDER BY id;`);
  const { rows: issueRows } = await pool.query(`SELECT id, bill_id FROM issues ORDER BY id;`);

  // Simple demo votes
  const votes = [
    { repName: "Alex Johnson",  billId: "HR-1001", vote: "Yea", explanation: "Supports accelerating renewables and modernizing the grid." },
    { repName: "Morgan Lee",    billId: "HR-1001", vote: "Yea", explanation: "Positive climate and jobs impact." },
    { repName: "Riley Kim",     billId: "HR-1001", vote: "Nay", explanation: "Cost concerns and federal overreach." },
    { repName: "Morgan Lee",    billId: "S-220",   vote: "Yea", explanation: "Targets learning loss and equity." }
  ];

  for (const v of votes) {
    const rep = repRows.find(r => r.name === v.repName);
    const iss = issueRows.find(i => i.bill_id === v.billId);
    if (!rep || !iss) continue;

    await pool.query(
      `INSERT INTO vote_records (rep_id, issue_id, vote, explanation)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM vote_records WHERE rep_id=$1 AND issue_id=$2
       );`,
      [rep.id, iss.id, v.vote, v.explanation]
    );
  }

  console.log("✅ Seed complete.");
  process.exit(0);
}

seed().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
