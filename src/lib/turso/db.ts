import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../db/schema/index.js";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

export const isDbConfigured = !!url;

const client = createClient({
  url: url || "file:local.db",
  authToken: authToken,
});

export const db = drizzle(client, { schema });
