import "dotenv/config";
import jwt from "jsonwebtoken";

export default function requireAuth(req, res, next) {
  const authorization = req.get("Authorization") || "";
  const match = authorization.match(/^Bearer ([^\s]+)$/i);

  if (!match) {
    return res.status(401).json({
      message: "Authentication required.",
    });
  }

  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "taskflow-api",
      audience: "taskflow-web",
    });

    if (
      typeof payload !== "object" ||
      !/^[1-9]\d*$/.test(payload.sub || "")
    ) {
      return res.status(401).json({
        message: "Invalid token.",
      });
    }

    req.userId = payload.sub;
    return next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token. Please log in again.",
    });
  }
}