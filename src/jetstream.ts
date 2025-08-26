import { JetstreamSubscription } from "@atcute/jetstream";
import { db } from "./db";

// Inline type definition for xyz.statusphere.status records
interface StatusRecord {
  $type: 'xyz.statusphere.status';
  status: string;      // Single emoji/character (maxLength: 32, maxGraphemes: 1)
  createdAt: string;   // ISO datetime string
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
    console.log("🚀 Starting Jetstream ingester...");
    console.log("📡 Listening for xyz.statusphere.status records");

    try {
      for await (const event of this.subscription) {
        if (!this.isRunning) break;

        if (event.kind === "commit") {
          const commit = event.commit;

          if (
            commit.collection === "xyz.statusphere.status" &&
            commit.operation === "create"
          ) {
            await this.handleStatusRecord(event);
          }
        }
      }
    } catch (error) {
      console.error("💥 Jetstream connection error:", error);
      this.isRunning = false;
      
      // Attempt to reconnect after delay
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

      // Validate the record structure
      if (!isStatusRecord(record)) {
        console.log("❌ Invalid status record format:", record);
        return;
      }

      // Extract information
      const did = event.did || commit.repo;
      const uri = `at://${did}/xyz.statusphere.status/${commit.rkey}`;

      console.log(`📝 New status: ${record.status} from ${did.slice(-8)}...`);

      // Store in our database
      await db.insertStatus({
        uri,
        did,
        status: record.status,
        created_at: record.createdAt,
      });

      console.log(`✅ Stored status: ${record.status}`);
    } catch (error) {
      console.error("❌ Failed to process status record:", error);
    }
  }

  stop() {
    this.isRunning = false;
    console.log("⏹️ Stopping Jetstream ingester...");
  }
}

// Create and export ingester instance
export const ingester = new JetstreamIngester();

// Auto-start when module is imported, unless we're just being imported for types
if (import.meta.main) {
  console.log("🎯 Starting Jetstream ingester in standalone mode...");
  
  // Start the ingester
  ingester.start().catch((error) => {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  });
}

export default ingester;