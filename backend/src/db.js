import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const useCloudDatabase =
  process.env.NODE_ENV !== "test" && Boolean(process.env.DATABASE_URL);

const connection = useCloudDatabase
  ? {
      connectionString: process.env.DATABASE_URL,
    }
  : {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5435),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
    };

export const pool = new Pool({
  ...connection,
  max: 5,
  connectionTimeoutMillis: useCloudDatabase ? 15000 : 5000,
  idleTimeoutMillis: 30000,
});

pool.on("error", (error) => {
  console.error("Database pool error:", error.message);
});