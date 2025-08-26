import { serve } from "bun";
import appPage from "./pages/app.html";
import profilePage from "./pages/profile.html";
import { db } from "./db";
import { ingester } from "./jetstream";
import { getOAuthMetadata } from "./config";

const server = serve({
  port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
  hostname: process.env.HOST || "127.0.0.1",
  development: process.env.NODE_ENV !== 'production',
  
  routes: {
    "/": appPage,
    "/callback": appPage,
    "/profile/*": profilePage,
    "/oauth-client-metadata.json": () => Response.json(getOAuthMetadata()),
    
    "/api/statuses": {
      async GET() {
        try {
          const statuses = await db.getRecentStatuses(20);
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

// Start the Jetstream ingester and store them in our local database
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