# Henry Statusphere

*Note*: more of documenting some learnings with AT Protocol through building a minimal status app. Based on the [official guide](https://atproto.com/guides/applications) and [statusphere.xyz](https://github.com/bluesky-social/statusphere-example-app/), with a few deps jetstream, bun/sqlite, client-side oauth.

## Notes

*everyone has their own database*

**Data persistence vs app validation:** Users can write records to their Personal Data Server (PDS), which stores whatever they submit without strict validation. 

Apps (a backend) act as selective indexers - they choose which records to consume and can apply their own validation rules.

- Your data persists even when apps shut down or reject your records
- Different apps can have different standards for the same record type
- Example: I could post "Hello" (5 graphemes) as a status - it gets stored in my PDS, but my app might reject it while another app accepts it
- Apps collaborate through shared lexicons but maintain independent validation logic

**The indexing pattern:** Apps don't store the canonical data - they create local indexes of relevant records for fast queries. The real data lives in user repositories.

**Record structure:** AT URIs follow a specific format:
```
at://alice.bsky.social/xyz.statusphere.status/3jzfcijpj2z2a
    └─ handle/domain   └─ record type      └─ record key
```

**Identity layers:** I noticed AT Protocol has multiple identity concepts:
- `alice.bsky.social` - Human-readable handle (can change)
- `did:plc:abc123...` - Permanent cryptographic identifier
- Handles resolve to DIDs, but DIDs are what actually matter for data ownership

**Record examples from my implementation:**
```typescript
// My status record
{ $type: 'xyz.statusphere.status', status: '😊', createdAt: '...' }

// Standard Bluesky post
{ $type: 'app.bsky.feed.post', text: 'Hello world', createdAt: '...' }
```

## My implementation approach

**1. Define the lexicon**
I chose a simple schema for status updates:
```typescript
{
  $type: 'xyz.statusphere.status',
  status: string,     // single emoji/character (maxLength: 32)
  createdAt: string   // ISO datetime
}
```

**2. Local indexing**
Since apps need fast queries, I index relevant data locally:
```sql
CREATE TABLE statuses (
  uri TEXT PRIMARY KEY,           -- full AT URI
  did TEXT NOT NULL,             -- user's permanent identifier
  status TEXT NOT NULL,          -- the status content
  created_at TEXT NOT NULL,      -- when user created it
  indexed_at TEXT DEFAULT NOW()  -- when I saw it
);
```

**3. Writing records**
Users post to their own repositories:
```typescript
await rpc.post("com.atproto.repo.createRecord", {
  input: {
    repo: userDid,
    collection: "xyz.statusphere.status",
    record: { $type: "xyz.statusphere.status", status: "😊", createdAt: "..." }
  }
});
```

**4. Consuming the firehose/jetstream**
I subscribe to all `xyz.statusphere.status` records across the network:
```typescript
new JetstreamSubscription({ 
  wantedCollections: ["xyz.statusphere.status"] 
});
```

## Running the app

Requirements: [Bun](https://bun.sh) runtime and a Bluesky account for testing.

```bash
bun install
bun run dev
```

Visit http://127.0.0.1:3001 and sign in with your Bluesky account.

## OAuth implementation notes

I used [`@atcute/oauth-browser-client`](https://github.com/mary-ext/atcute/tree/trunk/packages/oauth/browser-client) which provides a minimal OAuth implementation for AT Protocol.

**Development vs production:**
- Development: Uses `http://localhost` client_id format (special exception in AT Protocol OAuth)
- Production: Serves OAuth metadata from `/oauth-client-metadata.json` endpoint

**Configuration:** Set `BASE_URL` environment variable for production deployments. The implementation requests `transition:generic` scope for broad account permissions.

## References

- [AT Protocol Docs](https://atproto.com) - Official specification
- [ATP Tools](https://atp.tools) - Explore records in the network
- [AT Protocol for Distributed Systems Engineers](https://atproto.com/articles/atproto-for-distsys-engineers) - Technical deep dive