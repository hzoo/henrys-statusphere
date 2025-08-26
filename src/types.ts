/**
 * Shared type definitions for Statusphere
 */

/**
 * Represents a status record from the AT Protocol
 * In AT Protocol, records have URIs like: at://did:plc:abc123/xyz.statusphere.status/3jz...
 */
export interface StatusRecord {
  uri: string;
  did: string;
  status: string;
  created_at: string;
  indexed_at: string;
}

/**
 * Type definition for xyz.statusphere.status records as they appear in the firehose
 * This represents the actual record structure that users post to their AT Protocol repos.
 */
export interface StatusRecordData {
  $type: 'xyz.statusphere.status';
  status: string;
  createdAt: string;
}

/**
 * User profile information
 */
export interface Profile {
  handle: string;
  displayName?: string;
  avatar?: string;
  did: string;
}

/**
 * OAuth session state
 */
export interface SessionState {
  agent: any; // OAuthUserAgent
  rpc: any;   // Client
  did: string;
  handle: string;
  displayName?: string;
}

/**
 * Type guard for validating StatusRecordData
 */
export function isStatusRecord(obj: unknown): obj is StatusRecordData {
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
