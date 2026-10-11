import "dotenv/config";
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { pool } from "./db.js";

const router = Router();
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters");
}

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      message: "Too many attempts. Please try again later.",
    },
  })
);

function getCredentials(body) {
  const email =
    typeof body?.email === "string"
      ? body.email.trim().toLowerCase()
      : "";

  const password =
    typeof body?.password === "string" ? body.password : "";

  return { email, password };
}

function validEmail(email) {
  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

router.post("/register", async (req, res) => {
  const name =
    typeof req.body?.name === "string" ? req.body.name.trim() : "";

  const { email, password } = getCredentials(req.body);

  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({
      message: "Name must contain 2 to 100 characters.",
    });
  }

  if (!validEmail(email)) {
    return res.status(400).json({
      message: "Please enter a valid email address.",
    });
  }

  if (
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({
      message: "Password must contain at least 8 characters and at most 72 bytes.",
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name, email, passwordHash]
    );

    return res.status(201).json({
      message: "Account created successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    console.error("Registration failed:", error.message);

    return res.status(500).json({
      message: "Unable to create account.",
    });
  }
});

// Used when an email does not exist, to still perform a hash comparison.
const dummyPasswordHash = bcrypt.hashSync(
  "taskflow-dummy-password",
  12
);

router.post("/login", async (req, res) => {
  const { email, password } = getCredentials(req.body);

  if (
    !validEmail(email) ||
    !password ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({
      message: "Please enter a valid email and password.",
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, email, password_hash
       FROM users
       WHERE LOWER(email) = $1`,
      [email]
    );

    const user = result.rows[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user?.password_hash || dummyPasswordHash
    );

    if (!user || !passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const token = jwt.sign({}, jwtSecret, {
      algorithm: "HS256",
      subject: String(user.id),
      issuer: "taskflow-api",
      audience: "taskflow-web",
      expiresIn: "1h",
    });

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login failed:", error.message);

    return res.status(500).json({
      message: "Unable to log in.",
    });
  }
});

export default router;