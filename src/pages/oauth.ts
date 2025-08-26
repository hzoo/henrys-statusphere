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
import type { SessionState } from "../types";
import { getOAuthConfig } from "../config";

/**
 * OAuth authentication for AT Protocol / Bluesky
 * 
 * This handles the OAuth flow that allows our app to:
 * - Authenticate users with their Bluesky/AT Protocol identity
 * - Get permission to read their profile and post records to their repo
 * - Maintain authenticated sessions across browser reloads
 * 
 * The OAuth flow uses PKCE (Proof Key for Code Exchange) for security.
 */


let isOAuthInitialized = false;
let currentSession: SessionState | null = null;

export function initializeOAuth(): void {
  if (typeof window !== "undefined" && !isOAuthInitialized) {
    const { OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI } = getOAuthConfig();
    configureOAuth({
      metadata: {
        client_id: OAUTH_CLIENT_ID,
        redirect_uri: OAUTH_REDIRECT_URI,
      },
    });
    isOAuthInitialized = true;
  }
}
export async function checkExistingSession(): Promise<SessionState | null> {
  const storedDid = localStorage.getItem('statusphere:did');
  if (storedDid) {
    try {
      const session = await getSession(storedDid as `did:${string}:${string}`, { allowStale: false });
      if (session) {
        const agent = new OAuthUserAgent(session);
        const client = new Client({ handler: agent });
        
        const { ok, data } = await (client as any).get("app.bsky.actor.getProfile", {
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

/**
 * Handle OAuth callback after user returns from authorization server
 * Extracts authorization code and exchanges it for access tokens
 */
export async function handleOAuthCallback(): Promise<SessionState | null> {
  if (window.location.pathname === '/callback') {
    const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
    
    try {
      const session = await finalizeAuthorization(params);
      const agent = new OAuthUserAgent(session);
      const client = new Client({ handler: agent });
      
      const { ok, data } = await (client as any).get("app.bsky.actor.getProfile", {
        params: { actor: session.info.sub },
      });
      
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

export async function startLoginProcess(handle: string): Promise<void> {
  try {
    initializeOAuth();
    
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

export function getCurrentSession(): SessionState | null {
  return currentSession;
}