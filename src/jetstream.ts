import { JetstreamSubscription } from "@atcute/jetstream";
import { db } from "./db";
import type { StatusRecordData } from "./types";
import { isStatusRecord } from "./types";

/**
 * Jetstream firehose ingester for AT Protocol records
 * 
 * Jetstream provides a real-time stream of all commits across the AT Protocol network.
 * We filter for only "xyz.statusphere.status" records and store them locally.
 * 
 * This demonstrates the AT Protocol pattern: apps are selective indexers that
 * choose which lexicons/record types they care about from the global firehose.
 */
class JetstreamIngester {
  private subscription: JetstreamSubscription;
  private isRunning = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseDelay = 1000; // 1 second

  constructor() {
    this.subscription = new JetstreamSubscription({
      url: "wss://jetstream2.us-east.bsky.network",
      wantedCollections: ["xyz.statusphere.status"],
    });
  }

  async start() {
    if (this.isRunning) {
      console.log("⚠️ Jetstream ingester already running");
      return;
    }

    this.isRunning = true;
    this.resetReconnectionState(); // Reset reconnection counter on successful start
    console.log("📡 Listening for xyz.statusphere.status records");

    try {
      for await (const event of this.subscription) {
        if (!this.isRunning) break;

        if (event.kind === "commit") {
          const commit = event.commit;

          if (commit.collection === "xyz.statusphere.status") {
            if (commit.operation === "create" || commit.operation === "update") {
              await this.handleStatusRecord(event);
            } else if (commit.operation === "delete") {
              await this.handleStatusDelete(event);
            }
          }
        }
      }
    } catch (error) {
      console.error("💥 Jetstream connection error:", error);
      this.isRunning = false;
      await this.handleReconnection();
    }
  }

  private async handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.baseDelay * Math.pow(2, this.reconnectAttempts - 1), 30000); // Max 30 seconds
    
    console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);
    
    setTimeout(() => {
      this.start();
    }, delay);
  }

  private resetReconnectionState() {
    this.reconnectAttempts = 0;
  }

  private async handleStatusRecord(event: any) {
    try {
      const commit = event.commit;
      const record = commit.record;

      if (!isStatusRecord(record)) {
        console.log("❌ Invalid status record format:", record);
        return;
      }

      // Minimal validation: must be exactly 1 visual character
      if ([...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(record.status)].length !== 1) {
        return; // Skip invalid status
      }

      const did = event.did || commit.repo;
      const uri = `at://${did}/xyz.statusphere.status/${commit.rkey}`;

      await db.insertStatus({
        uri,
        did,
        status: record.status,
        created_at: record.createdAt,
      });

      console.log(`✅ Stored status: ${record.status} from ${did.slice(-8)}...`);
    } catch (error) {
      console.error("❌ Failed to process status record:", error);
    }
  }

  private async handleStatusDelete(event: any) {
    try {
      const commit = event.commit;
      const did = event.did || commit.repo;
      const uri = `at://${did}/xyz.statusphere.status/${commit.rkey}`;

      console.log(`🗑️ Deleting status from ${did.slice(-8)}...`);

      await db.deleteStatus(uri);
      console.log(`✅ Deleted status from database`);
    } catch (error) {
      console.error("❌ Failed to delete status:", error);
    }
  }

  stop() {
    this.isRunning = false;
    console.log("⏹️ Stopping Jetstream ingester...");
  }
}

export const ingester = new JetstreamIngester();

if (import.meta.main) {
  console.log("🎯 Starting Jetstream ingester in standalone mode...");
  
  ingester.start().catch((error) => {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  });
}

export default ingester;