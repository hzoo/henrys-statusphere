import { serve } from "bun";
import appPage from "./pages/app.html";
import profilePage from "./pages/profile.html";
import { db } from "./db";
import { ingester } from "./jetstream";
import { getOAuthMetadata } from "./config";

function jsonResponse(data: any, maxAge: number) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${maxAge}`
    }
  });
}

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
          const statuses = await db.getLatestStatusPerUser(5);
          return jsonResponse(statuses, 30); // 30 seconds
        } catch (error) {
          console.error("Failed to fetch statuses:", error);
          return jsonResponse([], 30);
        }
      }
    },

    "/api/popular": {
      async GET() {
        try {
          const popular = await db.getPopularStatuses(16);
          return jsonResponse(popular, 900); // 15 minutes
        } catch (error) {
          console.error("Failed to fetch popular statuses:", error);
          return jsonResponse([], 900);
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