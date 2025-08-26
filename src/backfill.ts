import { db } from "./db";

const RELAY_URL = "https://relay1.us-east.bsky.network";
const PDS_URL = "https://bsky.social"; 
const RATE_LIMIT_DELAY = 500; // ms between requests

async function fetchReposWithStatuses(cursor?: string) {
  const url = new URL(`${RELAY_URL}/xrpc/com.atproto.sync.listReposByCollection`);
  url.searchParams.set("collection", "xyz.statusphere.status");
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);
  
  const response = await fetch(url);
  return response.json();
}

async function fetchStatusRecords(did: string, cursor?: string) {
  const url = new URL(`${PDS_URL}/xrpc/com.atproto.repo.listRecords`);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", "xyz.statusphere.status");
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);
  
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

async function backfillStatuses() {
  console.log("🔄 Starting backfill of historical statuses...");
  
  let reposCursor: string | undefined;
  let totalRepos = 0;
  let totalStatuses = 0;
  
  // Paginate through all repos
  while (true) {
    const reposData = await fetchReposWithStatuses(reposCursor);
    if (!reposData.repos || reposData.repos.length === 0) break;
    
    for (const repo of reposData.repos) {
      totalRepos++;
      console.log(`📥 Fetching statuses for ${repo.did.slice(-8)}...`);
      
      let recordsCursor: string | undefined;
      
      // Paginate through all records for this repo
      while (true) {
        const recordsData = await fetchStatusRecords(repo.did, recordsCursor);
        if (!recordsData || !recordsData.records || recordsData.records.length === 0) break;
        
        for (const record of recordsData.records) {
          // ONLY accept records with the correct $type
          if (record.value.$type !== "xyz.statusphere.status") {
            console.log(`⚠️ Skipping record with wrong type: ${record.value.$type}`);
            continue;
          }
          
          // Validate grapheme count
          if (record.value.status && 
              [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(record.value.status)].length === 1) {
            
            await db.insertStatus({
              uri: record.uri,
              did: repo.did,
              status: record.value.status,
              created_at: record.value.createdAt || new Date().toISOString(),
            });
            totalStatuses++;
          }
        }
        
        recordsCursor = recordsData.cursor;
        if (!recordsCursor) break;
        
        // Rate limit
        await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
      }
      
      // Progress update
      if (totalRepos % 10 === 0) {
        console.log(`✅ Processed ${totalRepos} repos, found ${totalStatuses} valid statuses`);
      }
    }
    
    reposCursor = reposData.cursor;
    if (!reposCursor) break;
  }
  
  console.log(`🎉 Backfill complete! Processed ${totalRepos} repos, imported ${totalStatuses} statuses`);
}

// Run if called directly
if (import.meta.main) {
  backfillStatuses().catch(console.error);
}

export { backfillStatuses };