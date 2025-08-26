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
        created_at TEXT NOT NULL
      )
    `;

    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_statuses_created_at 
      ON statuses(created_at DESC)
    `;

    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_statuses_did_created_at 
      ON statuses(did, created_at DESC)
    `;

    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_statuses_status 
      ON statuses(status)
    `;

    this.isInitialized = true;
    console.log("✅ Database initialized");
  }

  async insertStatus(record: StatusRecord): Promise<void> {
    await this.ensureInitialized();
    await this.sql`
      INSERT OR REPLACE INTO statuses (uri, did, status, created_at)
      VALUES (${record.uri}, ${record.did}, ${record.status}, ${record.created_at})
    `;
  }

  async getRecentStatuses(limit = 20): Promise<StatusRecord[]> {
    await this.ensureInitialized();
    return await this.sql`
      SELECT uri, did, status, created_at
      FROM statuses
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  async getLatestStatusPerUser(limit = 20): Promise<StatusRecord[]> {
    await this.ensureInitialized();
    return await this.sql`
      SELECT uri, did, status, created_at
      FROM statuses s1
      WHERE s1.created_at = (
        SELECT MAX(s2.created_at)
        FROM statuses s2
        WHERE s2.did = s1.did
      )
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  async getPopularStatuses(limit = 10): Promise<{status: string, count: number}[]> {
    await this.ensureInitialized();
    return await this.sql`
      SELECT status, COUNT(*) as count
      FROM statuses
      GROUP BY status
      ORDER BY count DESC
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