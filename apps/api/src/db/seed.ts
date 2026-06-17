import bcrypt from "bcryptjs";
import { pool } from "./connection";
import { v4 as uuidv4 } from "uuid";

const DEMO_USER_EMAIL = "demo@example.com";
const DEMO_USER_PASSWORD = "password123";

const DEMO_WORKFLOW = {
  name: "Webhook → HTTP → If → Set",
  nodes: [
    {
      id: "trigger-1",
      type: "webhook",
      params: {},
      position: { x: 100, y: 200 },
    },
    {
      id: "http-1",
      type: "httpRequest",
      params: {
        url: "https://httpbin.org/post",
        method: "POST",
        body: "{{trigger.body}}",
      },
      position: { x: 350, y: 200 },
    },
    {
      id: "if-1",
      type: "if",
      params: {
        field: "status",
        operator: "equals",
        value: "ok",
      },
      position: { x: 600, y: 200 },
    },
    {
      id: "set-true",
      type: "set",
      params: { result: "success", message: "Status was ok!" },
      position: { x: 850, y: 100 },
    },
    {
      id: "set-false",
      type: "set",
      params: { result: "failure", message: "Status was not ok." },
      position: { x: 850, y: 300 },
    },
  ],
  connections: [
    { from: "trigger-1", fromPort: "main", to: "http-1" },
    { from: "http-1", fromPort: "main", to: "if-1" },
    { from: "if-1", fromPort: "true", to: "set-true" },
    { from: "if-1", fromPort: "false", to: "set-false" },
  ],
};

async function seed() {
  console.log("Seeding...");

  const hash = await bcrypt.hash(DEMO_USER_PASSWORD, 10);
  const userId = uuidv4();

  await pool.query(
    `INSERT INTO users (id, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [userId, DEMO_USER_EMAIL, hash]
  );

  const userResult = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [DEMO_USER_EMAIL]
  );
  const ownerId = userResult.rows[0].id;

  await pool.query(
    `INSERT INTO workflows (owner_id, name, graph, webhook_path)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [ownerId, DEMO_WORKFLOW.name, JSON.stringify(DEMO_WORKFLOW), "demo"]
  );

  console.log(`Seeded user: ${DEMO_USER_EMAIL} / ${DEMO_USER_PASSWORD}`);
  console.log("Seeded demo workflow: Webhook → HTTP → If → Set");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
