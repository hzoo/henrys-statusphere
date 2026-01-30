import {
  configureOAuth,
  createAuthorizationUrl,
  finalizeAuthorization,
  getSession,
  deleteStoredSession,
  OAuthUserAgent,
} from "@atcute/oauth-browser-client";
import { Client } from "@atcute/client";
import {
  CompositeDidDocumentResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  XrpcHandleResolver,
} from "@atcute/identity-resolver";
import type { SessionState } from "../types";
import { getOAuthConfig, OAUTH_SCOPES, STORAGE_KEYS } from "../config";

/**
 * OAuth authentication for AT Protocol / Bluesky
 * 
 * This handles the OAuth flow that allows our app to:
 * - Authenticate users with their Bluesky/AT Protocol identity
 * - Get permission to read their profile and post records to their repo
 * - Maintain authenticated sessions across browser reloads
 * 
 * The OAuth flow uses PKCE (Proof Key for Code Exchange) for security.
 * 
 * localStorage Usage & Security:
 * - atcute-oauth:* keys: Managed by @atcute library (tokens, nonces, session state)
 * - user-did: Our app's user identifier (just a DID string, not sensitive)
 * - localStorage is standard for OAuth SPAs and reasonably secure for this use case
 * - Tokens expire automatically and can be revoked by user at any time
 * - Alternative (sessionStorage) would force re-auth on every browser restart
 */


let isOAuthInitialized = false;
let configuredClientId: string | null = null;
let currentSession: SessionState | null = null;

export function initializeOAuth(scopeOverride?: string): void {
  if (typeof window === "undefined") return;

  const { OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI } = getOAuthConfig(scopeOverride);
  if (isOAuthInitialized && configuredClientId === OAUTH_CLIENT_ID) return;

  configureOAuth({
    metadata: {
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
    },
    identityResolver: new LocalActorResolver({
      handleResolver: new XrpcHandleResolver({ serviceUrl: "https://public.api.bsky.app" }),
      didDocumentResolver: new CompositeDidDocumentResolver({
        methods: {
          plc: new PlcDidDocumentResolver(),
          web: new WebDidDocumentResolver(),
        },
      }),
    }),
  });
  configuredClientId = OAUTH_CLIENT_ID;
  isOAuthInitialized = true;
}
export async function checkExistingSession(): Promise<SessionState | null> {
  const storedDid = localStorage.getItem(STORAGE_KEYS.USER_DID);
  if (!storedDid) return null;
  
  try {
    const session = await getSession(storedDid as `did:${string}:${string}`, { allowStale: false });
    if (!session) return null;
    
    // Validate existing session permissions
    if (!hasRequiredPermissions(session)) {
      console.warn('⚠️ Session may have limited permissions');
    }
    
    const agent = new OAuthUserAgent(session);
    const client = new Client({ handler: agent });
    const profile = await fetchUserProfile(client, session.info.sub);
    
    currentSession = {
      agent,
      rpc: client,
      did: session.info.sub,
      handle: profile.handle,
      ...(profile.displayName && { displayName: profile.displayName }),
    };
    localStorage.setItem(STORAGE_KEYS.USER_HANDLE, currentSession.handle);
    
    return currentSession;
  } catch (error) {
    console.error('Failed to restore session:', error);
    localStorage.removeItem(STORAGE_KEYS.USER_DID);
    return null;
  }
}

/**
 * Shared helper to fetch user profile with proper error handling
 */
async function fetchUserProfile(client: any, did: string): Promise<{ handle: string; displayName?: string }> {
  try {
    const { ok, data } = await client.get("app.bsky.actor.getProfile", {
      params: { actor: did },
    });
    
    if (ok) {
      return { handle: data.handle, displayName: data.displayName };
    }
  } catch (error) {
    console.warn('Failed to fetch user profile:', error);
  }
  
  // Fallback to DID if profile fetch fails
  return { handle: did };
}

/**
 * Simple scope validation - just check if we have basic permissions
 */
function hasRequiredPermissions(session: any): boolean {
  // Scopes are in session.token.scope, not session.info.scope!
  const scopes = session.token?.scope || session.info?.scope || '';
  
  // Check if we have either granular scopes or transitional scopes
  const hasRepo = scopes.includes('repo:xyz.statusphere.status') || 
                  scopes.includes('repo:*') ||
                  scopes.includes('transition:generic');
                  
  const hasAtproto = scopes.includes('atproto');
  
  return hasRepo && hasAtproto;
}

/**
 * Handle OAuth callback after user returns from authorization server
 * Extracts authorization code and exchanges it for access tokens
 */
export async function handleOAuthCallback(): Promise<SessionState | null> {
  if (window.location.pathname !== '/callback') return null;
  
  const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
  
  try {
    const { session } = await finalizeAuthorization(params);
    
    // Validate permissions (just for logging)
    if (!hasRequiredPermissions(session)) {
      console.warn('⚠️ Some permissions may be missing');
    }
    
    const agent = new OAuthUserAgent(session);
    const client = new Client({ handler: agent });
    const profile = await fetchUserProfile(client, session.info.sub);
    
    currentSession = {
      agent,
      rpc: client,
      did: session.info.sub,
      handle: profile.handle,
      ...(profile.displayName && { displayName: profile.displayName }),
    };
    
    localStorage.setItem(STORAGE_KEYS.USER_DID, currentSession.did);
    localStorage.setItem(STORAGE_KEYS.USER_HANDLE, currentSession.handle);
    window.history.replaceState({}, document.title, '/');
    
    return currentSession;
  } catch (error: any) {
    console.error('OAuth callback failed:', error);
    window.history.replaceState({}, document.title, '/');
    
    // Handle user rejection more gracefully
    if (error.name === 'AuthorizationError' || error.message?.includes('rejected')) {
      throw new Error('Authentication was cancelled. Please try logging in again.');
    }
    
    throw error;
  }
}

async function tryAuthWithScope(scope: string, serviceUrl?: string): Promise<string> {
  const targetServiceUrl = serviceUrl ?? "https://bsky.social";
  const authUrl = await createAuthorizationUrl({
    target: { type: "pds", serviceUrl: targetServiceUrl },
    scope,
  });
  return authUrl.toString();
}

export async function startLoginProcess(serviceUrl?: string): Promise<void> {
  try {
    initializeOAuth();
    
    let authUrl: string;
    
    try {
      // Try granular scopes first
      authUrl = await tryAuthWithScope(OAUTH_SCOPES.GRANULAR, serviceUrl);
      console.log('Using granular OAuth scopes');
    } catch (error: any) {
      // Fall back to transitional scopes if granular fails
      if (error.message?.includes('Unsupported scope') || error.message?.includes('invalid_client_metadata')) {
        console.warn('Granular scopes not supported, using transitional scopes');
        authUrl = await tryAuthWithScope(OAUTH_SCOPES.TRANSITIONAL, serviceUrl);
      } else {
        throw error;
      }
    }
    
    window.location.href = authUrl;
  } catch (error) {
    console.error('Failed to start login:', error);
    throw error;
  }
}

export async function logout(): Promise<void> {
  if (currentSession) {
    try {
      await deleteStoredSession(currentSession.did as `did:${string}:${string}`);
      localStorage.removeItem(STORAGE_KEYS.USER_DID);
      currentSession = null;
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }
}

export function getCurrentSession(): SessionState | null {
  return currentSession;
}
