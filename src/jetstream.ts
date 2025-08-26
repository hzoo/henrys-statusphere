import { JetstreamSubscription } from "@atcute/jetstream";
import { db } from "./db";

/**
 * Type definition for xyz.statusphere.status records
 * 
 * This represents the actual record structure that users post to their AT Protocol repos.
 * The lexicon defines: status as a single emoji/character (maxLength: 32, maxGraphemes: 1)
 */
interface StatusRecord {
  $type: 'xyz.statusphere.status';
  status: string;
  createdAt: string;
}

function isStatusRecord(obj: unknown): obj is StatusRecord {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "$type" in obj &&
    (obj as any).$type === "xyz.statusphere.status" &&
    "status" in obj &&
    "createdAt" in obj &&
    typeof (obj as any).status === "string" &&
    typeof (obj as any).createdAt === "string"
  );
}

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
      console.log("⚠️ Jetstream ingester already running");
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
      console.error("💥 Jetstream connection error:", error);
      this.isRunning = false;
      
      setTimeout(() => {
        console.log("🔄 Attempting to reconnect...");
        this.start();
      }, 5000);
    }
  }

  private async handleStatusRecord(event: any) {
    try {
      const commit = event.commit;
      const record = commit.record;

      if (!isStatusRecord(record)) {
        console.log("❌ Invalid status record format:", record);
        return;
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