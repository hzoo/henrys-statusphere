/**
 * Shared configuration for Statusphere
 */

/**
 * Get the base URL for the application
 * Works in both server and browser environments
 */
export function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Browser environment
    return `${window.location.protocol}//${window.location.host}`;
  } else {
    // Server environment
    return process.env.BASE_URL || "http://127.0.0.1:3001";
  }
}

/**
 * OAuth scope configuration
 */
export const OAUTH_SCOPES = {
  // Try granular scopes first (new system)
  // use repo:xyz.statusphere.status?action=create to limit to only creation
  GRANULAR: "atproto repo:xyz.statusphere.status rpc:app.bsky.actor.getProfile?aud=*",
  // Fallback to transitional scopes (old system)
  TRANSITIONAL: "atproto transition:generic"
} as const;

/**
 * localStorage keys used by the app
 */
export const STORAGE_KEYS = {
  USER_DID: 'user-did',  // Cleaner than 'statusphere:did'
} as const;

/**
 * OAuth configuration constants
 */
export function getOAuthConfig() {
  const BASE_URL = getBaseUrl();
  const OAUTH_REDIRECT_URI = `${BASE_URL}/callback`;
  
  // For localhost, use the special client_id format. For production, use the metadata URL.
  const isLocalhost = BASE_URL.includes('127.0.0.1') || BASE_URL.includes('localhost');
  const OAUTH_CLIENT_ID = isLocalhost
    ? `http://localhost?redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}&scope=${encodeURIComponent(OAUTH_SCOPES.GRANULAR)}`
    : `${BASE_URL}/oauth-client-metadata.json`;

  return {
    BASE_URL,
    OAUTH_REDIRECT_URI,
    OAUTH_CLIENT_ID,
    isLocalhost
  };
}

/**
 * OAuth metadata for the server
 */
export function getOAuthMetadata() {
  const { BASE_URL } = getOAuthConfig();
  
  return {
    "client_id": `${BASE_URL}/oauth-client-metadata.json`,
    "client_uri": BASE_URL,
    "redirect_uris": [
      `${BASE_URL}`,
      `${BASE_URL}/callback`
    ],
    "application_type": "web",
    "client_name": "Henry's Statusphere",
    "dpop_bound_access_tokens": true,
    "grant_types": [
      "authorization_code",
      "refresh_token"
    ],
    "response_types": [
      "code"
    ],
    "scope": OAUTH_SCOPES.GRANULAR,
    "token_endpoint_auth_method": "none"
  };
}
