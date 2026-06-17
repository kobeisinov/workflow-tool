import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://workflow:workflow@localhost:5432/workflow",
});

export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) {
  const result = await pool.query<T>(text, params);
  return result;
}
