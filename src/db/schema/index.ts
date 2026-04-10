import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const kinemojis = sqliteTable("kinemojis", {
  id: text("id").primaryKey(),
  shortId: text("short_id").notNull().unique(),
  text: text("text").notNull(),
  parameters: text("parameters").notNull(), // JSON 形式
  imageUrl: text("image_url"),
  status: text("status", { enum: ["pending", "processing", "completed", "failed"] })
    .notNull()
    .default("pending"),
  progress: integer("progress").notNull().default(0), // 0-100
  error: text("error"),
  creatorId: text("creator_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
