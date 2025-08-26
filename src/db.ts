import { Database } from "bun:sqlite";
import { resolve } from "path";

export interface StatusRecord {
  uri: string;
  did: string;
  status: string;
  created_at: string;
  indexed_at: string;
}

class StatusDB {
  private db: Database;

  constructor(dbPath = "./statusphere.db") {
    this.db = new Database(resolve(dbPath));
    this.init();
  }

  private init() {
    // Create statuses table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS statuses (
        uri TEXT PRIMARY KEY,
        did TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on indexed_at for efficient ordering
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_statuses_indexed_at 
      ON statuses(indexed_at DESC)
    `);

    console.log("✅ Database initialized");
  }

  async insertStatus(record: Omit<StatusRecord, "indexed_at">): Promise<void> {
    const query = this.db.query(`
      INSERT OR REPLACE INTO statuses (uri, did, status, created_at, indexed_at)
      VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
    `);

    query.run(record.uri, record.did, record.status, record.created_at);
  }

  async getRecentStatuses(limit = 20): Promise<StatusRecord[]> {
    const query = this.db.query(`
      SELECT uri, did, status, created_at, indexed_at
      FROM statuses
      ORDER BY indexed_at DESC
      LIMIT ?1
    `);

    return query.all(limit) as StatusRecord[];
  }



  close() {
    this.db.close();
  }
}

// Export a singleton instance
export const db = new StatusDB();

// Initialize database when this module is imported
if (import.meta.main) {
  console.log("🗄️  Database initialized at ./statusphere.db");
}