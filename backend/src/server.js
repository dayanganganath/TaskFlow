import "dotenv/config";
import app from "./app.js";
import { pool } from "./db.js";

const port = Number(process.env.PORT || 5005);
const host = process.env.HOST || "127.0.0.1";

const server = app.listen(port, host, () => {
  console.log(`TaskFlow API running at http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error(`Failed to start TaskFlow API: ${error.message}`);
  process.exit(1);
});

function shutdown() {
  server.close(async () => {
    try {
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error("Shutdown failed:", error.message);
      process.exit(1);
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);