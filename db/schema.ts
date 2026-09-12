import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const worlds = sqliteTable("worlds", {
  userId: text("user_id").primaryKey(),
  documentJson: text("document_json").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    originalName: text("original_name").notNull(),
    kind: text("kind", { enum: ["upload", "generated"] }).notNull(),
    byteSize: integer("byte_size").notNull(),
    requestKey: text("request_key"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("attachments_object_key_unique").on(table.objectKey),
    uniqueIndex("attachments_user_request_unique").on(table.userId, table.requestKey),
    index("attachments_user_created_idx").on(table.userId, table.createdAt),
  ],
);

