import Fastify from "fastify";
import cors from "@fastify/cors";
import { authRoutes } from "./routes/auth";
import { workflowRoutes } from "./routes/workflows";
import { executionRoutes } from "./routes/executions";
import { webhookRoutes } from "./routes/webhook";
import { startWorker } from "./queue/worker";
import { loadActiveSchedules } from "./triggers/scheduler";

const app = Fastify({ logger: { level: "info" } });

async function start() {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(workflowRoutes);
  await app.register(executionRoutes);
  await app.register(webhookRoutes);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API listening on http://localhost:${port}`);

  startWorker();
  await loadActiveSchedules();
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
