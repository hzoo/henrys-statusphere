import { serve } from "bun";
import appPage from "./pages/app.html";
import oauthMetadata from "../public/oauth-client-metadata.json";
import { db } from "./db";
import { ingester } from "./jetstream";

// Serve the app
const server = serve({
  port: 3001,
  hostname: "127.0.0.1",
  development: true,
  
  routes: {
    "/": appPage,
    "/callback": appPage,
    "/oauth-client-metadata.json": () => Response.json(oauthMetadata),
    
    "/api/statuses": {
      async GET() {
        try {
          const statuses = await db.getRecentStatuses(20);
          
          // Use DID as-is - the client will handle display and links properly
          return Response.json(statuses);
        } catch (error) {
          console.error("Failed to fetch statuses:", error);
          return Response.json([]);
        }
      }
    }
  }
});

console.log(`🚀 Statusphere running at ${server.url}`);

// Start Jetstream ingester
ingester.start().catch((error) => {
  console.error("💥 Failed to start Jetstream ingester:", error);
});

process.on('SIGINT', () => {
  console.log('\\nShutting down statusphere...');
  ingester.stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\\nShutting down statusphere...');
  ingester.stop();
  process.exit(0);
});