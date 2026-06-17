import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { query } from "../db/connection";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-prod";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (req, reply) => {
    const body = LoginSchema.parse(req.body);

    const result = await query<{ id: string; email: string; password_hash: string }>(
      `SELECT id, email, password_hash FROM users WHERE email=$1`,
      [body.email]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return reply.send({ token, user: { id: user.id, email: user.email } });
  });

  app.get("/auth/me", async (req, reply) => {
    const user = await getAuthUser(req.headers.authorization);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    return reply.send({ user });
  });
}

export async function getAuthUser(
  authHeader: string | undefined
): Promise<{ userId: string; email: string } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    return payload;
  } catch {
    return null;
  }
}
