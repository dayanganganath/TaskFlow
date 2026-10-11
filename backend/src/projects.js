import { Router } from "express";
import { pool } from "./db.js";
import requireAuth from "./requireAuth.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, created_at, updated_at
       FROM projects
       WHERE owner_id = $1
       ORDER BY created_at DESC, id DESC`,
      [req.userId]
    );

    return res.status(200).json({
      projects: result.rows,
    });
  } catch (error) {
    console.error("Fetch projects failed:", error.message);

    return res.status(500).json({
      message: "Unable to load projects.",
    });
  }
});

router.post("/", async (req, res) => {
  const name =
    typeof req.body?.name === "string" ? req.body.name.trim() : "";

  const description =
    req.body?.description === undefined
      ? ""
      : req.body.description;

  if (name.length < 2 || name.length > 150) {
    return res.status(400).json({
      message: "Project name must contain 2 to 150 characters.",
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

  try {
    const result = await pool.query(
      `INSERT INTO projects (owner_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, created_at, updated_at`,
      [req.userId, name, description.trim()]
    );

    return res.status(201).json({
      message: "Project created successfully.",
      project: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(401).json({
        message: "Account no longer exists. Please log in again.",
      });
    }

    console.error("Create project failed:", error.message);

    return res.status(500).json({
      message: "Unable to create project.",
    });
  }
});

export default router;