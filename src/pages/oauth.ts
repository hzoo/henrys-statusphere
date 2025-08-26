import {
  configureOAuth,
  createAuthorizationUrl,
  finalizeAuthorization,
  getSession,
  deleteStoredSession,
  OAuthUserAgent,
  resolveFromService,
} from "@atcute/oauth-browser-client";
import { Client } from "@atcute/client";

export interface SessionState {
  agent: OAuthUserAgent;
  rpc: Client;
  did: string;
  handle: string;
  displayName?: string;
}

let isOAuthInitialized = false;
let currentSession: SessionState | null = null;

const OAUTH_REDIRECT_URI = "http://127.0.0.1:3001/callback";
const OAUTH_CLIENT_ID = `http://localhost?redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}&scope=${encodeURIComponent("atproto transition:generic")}`;

export function initializeOAuth(): void {
  if (typeof window !== "undefined" && !isOAuthInitialized) {
    configureOAuth({
      metadata: {
        client_id: OAUTH_CLIENT_ID,
        redirect_uri: OAUTH_REDIRECT_URI,
      },
    });
    isOAuthInitialized = true;
  }
}

// Check for existing session
export async function checkExistingSession(): Promise<SessionState | null> {
  const storedDid = localStorage.getItem('statusphere:did');
  if (storedDid) {
    try {
      const session = await getSession(storedDid as `did:${string}:${string}`, { allowStale: false });
      if (session) {
        const agent = new OAuthUserAgent(session);
        const client = new Client({ handler: agent });
        
        // Get profile to show handle
        const { ok, data } = await client.get("app.bsky.actor.getProfile", {
          params: { actor: session.info.sub },
        });
        
        if (ok) {
          currentSession = {
            agent,
            rpc: client,
            did: session.info.sub,
            handle: data.handle,
            displayName: data.displayName,
          };
          return currentSession;
        }
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
      localStorage.removeItem('statusphere:did');
    }
  }
  return null;
}

// Handle OAuth callback
export async function handleOAuthCallback(): Promise<SessionState | null> {
  if (window.location.pathname === '/callback') {
    const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
    
    try {
      const session = await finalizeAuthorization(params);
      const agent = new OAuthUserAgent(session);
      const client = new Client({ handler: agent });
      
      // Get user profile
      const { ok, data } = await client.get("app.bsky.actor.getProfile", {
        params: { actor: session.info.sub },
      });

      console.log(data);
      
      currentSession = {
        agent,
        rpc: client,
        did: session.info.sub,
        handle: ok ? data.handle : session.info.sub,
        displayName: ok ? data.displayName : undefined,
      };
      
      localStorage.setItem('statusphere:did', currentSession.did);
      window.history.replaceState({}, document.title, '/');
      return currentSession;
    } catch (error) {
      console.error('OAuth callback failed:', error);
      window.history.replaceState({}, document.title, '/');
      throw error;
    }
  }
  return null;
}

// Start login process - use Bluesky resolver instead of custom domains
export async function startLoginProcess(handle: string): Promise<void> {
  try {
    initializeOAuth();
    
    // Use Bluesky's resolver instead of trying to resolve custom domains
    const { metadata } = await resolveFromService('https://bsky.social');
    const authUrl = await createAuthorizationUrl({
      metadata,
      scope: "atproto transition:generic",
    });
    
    window.location.href = authUrl.toString();
  } catch (error) {
    console.error('Failed to start login:', error);
    throw error;
  }
}

// Logout
export async function logout(): Promise<void> {
  if (currentSession) {
    try {
      await deleteStoredSession(currentSession.did as `did:${string}:${string}`);
      localStorage.removeItem('statusphere:did');
      currentSession = null;
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }
}

// Get current session
export function getCurrentSession(): SessionState | null {
  return currentSession;
}