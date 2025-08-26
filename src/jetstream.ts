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

  constructor() {
    this.subscription = new JetstreamSubscription({
      url: "wss://jetstream2.us-east.bsky.network",
      wantedCollections: ["xyz.statusphere.status"],
    });
  }

  async start() {
    if (this.isRunning) {
      console.log("Jetstream ingester already running");
      return;
    }

    this.isRunning = true;
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
      console.error("Jetstream connection error:", error);
      this.isRunning = false;
      // Simple retry after 5 seconds
      setTimeout(() => this.start(), 5000);
    }
  }

  private async handleStatusRecord(event: any) {
    try {
      const commit = event.commit;
      const record = commit.record;

      if (!isStatusRecord(record)) return;

      // Validate single visible character (handles multi-codepoint emojis correctly)
      const status = record.status.trim();
      if (!status) return;
      
      // Reject if it looks empty when rendered (catches zero-width chars)
      if (status.replace(/[\u200B-\u200D\uFEFF]/g, '').length === 0) return;
      
      // Count graphemes (visible characters) - allows complex emojis like 👨‍👩‍👧‍👦
      const graphemeCount = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(status)].length;
      if (graphemeCount !== 1) return;

      const did = event.did || commit.repo;
      const uri = `at://${did}/xyz.statusphere.status/${commit.rkey}`;

      await db.insertStatus({
        uri,
        did,
        status,
        created_at: record.createdAt,
      });

      console.log(`✅ Stored status: ${status} from ${did.slice(-8)}...`);
    } catch (error) {
      console.error("Failed to process status record:", error);
    }
  }

  private async handleStatusDelete(event: any) {
    try {
      const commit = event.commit;
      const did = event.did || commit.repo;
      const uri = `at://${did}/xyz.statusphere.status/${commit.rkey}`;

      await db.deleteStatus(uri);
      console.log(`Deleted status from ${did.slice(-8)}...`);
    } catch (error) {
      console.error("Failed to delete status:", error);
    }
  }

  stop() {
    this.isRunning = false;
    console.log("Stopping Jetstream ingester...");
  }
}

export const ingester = new JetstreamIngester();

if (import.meta.main) {
  console.log("Starting Jetstream ingester in standalone mode...");
  
  ingester.start().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export default ingester;