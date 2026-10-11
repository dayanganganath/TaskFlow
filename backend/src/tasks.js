import { Router } from "express";
import { pool } from "./db.js";
import requireAuth from "./requireAuth.js";

const router = Router({ mergeParams: true });

const taskColumns = `
  id, project_id, title, description, status, priority,
  TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date,
  created_at, updated_at
`;

function validId(value) {
  return (
    typeof value === "string" &&
    /^[1-9]\d{0,18}$/.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
}

function validateTask(body) {
  const title =
    typeof body?.title === "string" ? body.title.trim() : "";

  const description = body?.description ?? "";
  const status = body?.status ?? "TODO";
  const priority = body?.priority ?? "MEDIUM";
  const dueDate = body?.due_date ?? null;

  if (title.length < 2 || title.length > 200) {
    return {
      error: "Task title must contain 2 to 200 characters.",
    };
  }

  if (
    typeof description !== "string" ||
    description.length > 5000
  ) {
    return {
      error: "Description must be text with at most 5000 characters.",
    };
  }

  if (!["TODO", "IN_PROGRESS", "DONE"].includes(status)) {
    return {
      error: "Status must be TODO, IN_PROGRESS or DONE.",
    };
  }

  if (!["LOW", "MEDIUM", "HIGH"].includes(priority)) {
    return {
      error: "Priority must be LOW, MEDIUM or HIGH.",
    };
  }

  if (dueDate !== null) {
    const timestamp =
      typeof dueDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(dueDate) &&
      !dueDate.startsWith("0000")
        ? Date.parse(`${dueDate}T00:00:00Z`)
        : NaN;

    if (
      !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== dueDate
    ) {
      return {
        error: "Due date must be a valid date in YYYY-MM-DD format.",
      };
    }
  }

  return {
    value: {
      title,
      description: description.trim(),
      status,
      priority,
      due_date: dueDate,
    },
  };
}

router.use(requireAuth);

router.use(async (req, res, next) => {
  const { projectId } = req.params;

  if (!validId(projectId)) {
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

router.param("taskId", (_req, res, next, taskId) => {
  if (!validId(taskId)) {
    return res.status(400).json({
      message: "Invalid task ID.",
    });
  }

  return next();
});

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${taskColumns}
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
  const validation = validateTask(req.body);

  if (validation.error) {
    return res.status(400).json({
      message: validation.error,
    });
  }

  const task = validation.value;

  try {
    const result = await pool.query(
      `INSERT INTO tasks
         (project_id, title, description, status, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${taskColumns}`,
      [
        req.params.projectId,
        task.title,
        task.description,
        task.status,
        task.priority,
        task.due_date,
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

// Replace all editable task fields.
router.put("/:taskId", async (req, res) => {
  const validation = validateTask(req.body);

  if (validation.error) {
    return res.status(400).json({
      message: validation.error,
    });
  }

  const task = validation.value;

  try {
    const result = await pool.query(
      `UPDATE tasks
       SET title = $1,
           description = $2,
           status = $3,
           priority = $4,
           due_date = $5,
           updated_at = NOW()
       WHERE id = $6 AND project_id = $7
       RETURNING ${taskColumns}`,
      [
        task.title,
        task.description,
        task.status,
        task.priority,
        task.due_date,
        req.params.taskId,
        req.params.projectId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    return res.status(200).json({
      message: "Task updated successfully.",
      task: result.rows[0],
    });
  } catch (error) {
    console.error("Update task failed:", error.message);

    return res.status(500).json({
      message: "Unable to update task.",
    });
  }
});

// Change only the task status.
router.patch("/:taskId/status", async (req, res) => {
  const status = req.body?.status;

  if (!["TODO", "IN_PROGRESS", "DONE"].includes(status)) {
    return res.status(400).json({
      message: "Status must be TODO, IN_PROGRESS or DONE.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE tasks
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND project_id = $3
       RETURNING ${taskColumns}`,
      [status, req.params.taskId, req.params.projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    return res.status(200).json({
      message: "Task status updated successfully.",
      task: result.rows[0],
    });
  } catch (error) {
    console.error("Update status failed:", error.message);

    return res.status(500).json({
      message: "Unable to update task status.",
    });
  }
});

router.delete("/:taskId", async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM tasks
       WHERE id = $1 AND project_id = $2
       RETURNING id`,
      [req.params.taskId, req.params.projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    return res.status(200).json({
      message: "Task deleted successfully.",
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error("Delete task failed:", error.message);

    return res.status(500).json({
      message: "Unable to delete task.",
    });
  }
});

export default router;