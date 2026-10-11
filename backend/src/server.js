import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import authRouter from "./auth.js";
import projectsRouter from "./projects.js";
import tasksRouter from "./tasks.js";

const app = express();
const port = Number(process.env.PORT || 5005);

app.disable("x-powered-by");

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5175",
  })
);

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "TaskFlow API",
  });
});

app.get("/api/health/db", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, NOW() AS time"
    );

    return res.status(200).json({
      status: "ok",
      database: result.rows[0].database,
      time: result.rows[0].time,
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);

    return res.status(503).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/projects/:projectId/tasks", tasksRouter);

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((error, _req, res, _next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "Invalid JSON request.",
    });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      message: "Request body is too large.",
    });
  }

  console.error("Request failed:", error.message);

  return res.status(500).json({
    message: "An unexpected error occurred.",
  });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`TaskFlow API running at http://localhost:${port}`);
});

server.on("error", (error) => {
  console.error(`Failed to start TaskFlow API: ${error.message}`);
  process.exit(1);
});