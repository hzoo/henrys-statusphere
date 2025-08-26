import { SQL } from "bun";
import { resolve } from "path";
import type { StatusRecord } from "./types";

class StatusDB {
  private sql: SQL;
  private isInitialized = false;

  constructor(dbPath = "./statusphere.db") {
    this.sql = new SQL(`sqlite://${resolve(dbPath)}`);
  }

  private async ensureInitialized() {
    if (this.isInitialized) return;

    await this.sql`
      CREATE TABLE IF NOT EXISTS statuses (
        uri TEXT PRIMARY KEY,
        did TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_statuses_indexed_at 
      ON statuses(indexed_at DESC)
    `;

    this.isInitialized = true;
    console.log("✅ Database initialized");
  }

  async insertStatus(record: Omit<StatusRecord, "indexed_at">): Promise<void> {
    await this.ensureInitialized();
    await this.sql`
      INSERT OR REPLACE INTO statuses (uri, did, status, created_at, indexed_at)
      VALUES (${record.uri}, ${record.did}, ${record.status}, ${record.created_at}, CURRENT_TIMESTAMP)
    `;
  }

  async getRecentStatuses(limit = 20): Promise<StatusRecord[]> {
    await this.ensureInitialized();
    return await this.sql`
      SELECT uri, did, status, created_at, indexed_at
      FROM statuses
      ORDER BY indexed_at DESC
      LIMIT ${limit}
    `;
  }

  async deleteStatus(uri: string): Promise<void> {
    await this.ensureInitialized();
    await this.sql`
      DELETE FROM statuses WHERE uri = ${uri}
    `;
  }

  async close() {
    await this.sql.close();
  }
}

export const db = new StatusDB();

if (import.meta.main) {
  console.log("🗄️  Database initialized at ./statusphere.db");
}