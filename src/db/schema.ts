import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Single-user app: at most one row (id = "default") holds the reader's
// connected Reddit account. Only the refresh token is long-lived; access
// tokens are refreshed on demand and never leave the server.
export const redditConnections = pgTable("reddit_connection", {
  id: text("id").primaryKey(),
  redditUsername: text("reddit_username").notNull(),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token"),
  accessExpiresAt: timestamp("access_expires_at"),
  // Cached list of the user's subscribed subreddit names (refreshed daily).
  subreddits: jsonb("subreddits").$type<string[]>().default([]),
  subsFetchedAt: timestamp("subs_fetched_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type RedditConnection = typeof redditConnections.$inferSelect;
