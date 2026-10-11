import { Router } from "express";
import { pool } from "./db.js";
import requireAuth from "./requireAuth.js";

const router = Router({ mergeParams: true });

router.use(requireAuth);

// Check that the project belongs to the logged-in user.
router.use(async (req, res, next) => {
  const { projectId } = req.params;

  if (
    !/^[1-9]\d{0,18}$/.test(projectId) ||
    BigInt(projectId) > 9223372036854775807n
  ) {
    return res.status(400).json({
      message: "Invalid project ID.",
    });
  }

  try {
    const result = await pool.query(
      "SELECT id FROM projects WHERE id = $1 AND owner_id = $2",
      [projectId, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Project not found.",
      });
    }

    return next();
  } catch (error) {
    console.error("Project access check failed:", error.message);

    return res.status(500).json({
      message: "Unable to access project.",
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, project_id, title, description,
              status, priority,
              TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date,
              created_at, updated_at
       FROM tasks
       WHERE project_id = $1
       ORDER BY created_at DESC, id DESC`,
      [req.params.projectId]
    );

    return res.status(200).json({
      tasks: result.rows,
    });
  } catch (error) {
    console.error("Fetch tasks failed:", error.message);

    return res.status(500).json({
      message: "Unable to load tasks.",
    });
  }
});

router.post("/", async (req, res) => {
  const body = req.body || {};

  const title =
    typeof body.title === "string" ? body.title.trim() : "";

  const description = body.description ?? "";
  const status = body.status ?? "TODO";
  const priority = body.priority ?? "MEDIUM";
  const dueDate = body.due_date ?? null;

  if (title.length < 2 || title.length > 200) {
    return res.status(400).json({
      message: "Task title must contain 2 to 200 characters.",
    });
  }

  if (
    typeof description !== "string" ||
    description.length > 5000
  ) {
    return res.status(400).json({
      message: "Description must be text with at most 5000 characters.",
    });
  }

  if (!["TODO", "IN_PROGRESS", "DONE"].includes(status)) {
    return res.status(400).json({
      message: "Status must be TODO, IN_PROGRESS or DONE.",
    });
  }

  if (!["LOW", "MEDIUM", "HIGH"].includes(priority)) {
    return res.status(400).json({
      message: "Priority must be LOW, MEDIUM or HIGH.",
    });
  }

  if (dueDate !== null) {
    const timestamp =
      typeof dueDate === "string" &&
      /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dueDate) &&
      !dueDate.startsWith("0000")
        ? Date.parse(`${dueDate}T00:00:00Z`)
        : NaN;

    if (
      !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== dueDate
    ) {
      return res.status(400).json({
        message: "Due date must be a valid date in YYYY-MM-DD format.",
      });
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO tasks
         (project_id, title, description, status, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, project_id, title, description,
                 status, priority,
                 TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date,
                 created_at, updated_at`,
      [
        req.params.projectId,
        title,
        description.trim(),
        status,
        priority,
        dueDate,
      ]
    );

    return res.status(201).json({
      message: "Task created successfully.",
      task: result.rows[0],
    });
  } catch (error) {
    console.error("Create task failed:", error.message);

    return res.status(500).json({
      message: "Unable to create task.",
    });
  }
});

export default router;