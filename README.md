# Henry Statusphere

> Based off https://atproto.com/guides/applications and statusphere.xyz

*Note: This is just me documenting my own learning/understanding of atproto/lexicons + making a somewhat minimalistic app (jetstream, sqlite, client side oauth)*

## Notes

*"everyone has their own database"*

- Users post to their own database, there's no central repository
  - If Bluesky (the app) dies, your post data (`app.bsky.feed.post`) still exist in the repo
  - If the status app dies, your statuses (`xyz.statusphere.status`) still exist in the repo
- Apps are selective indexers that choose what to listen for (not all types of data)
  - Apps can collaborate in that they all choose to use the same lexicons
  - Your app could index Bluesky posts + status updates + any other records, or focus on just one type
  - Innovation can happen at the data layer (new lexicons) independent of the app layer

### Records

```
at://alice.bsky.social/xyz.statusphere.status/3jzfcijpj2z2a
    └─ user's domain   └─ record type      └─ rkey (record key)
```

> the **rkey** is usually timestamp-based (auto-generated) but can be fixed like `"self"` for profiles.

### Domain/Identifier

- `alice.bsky.social` - Handle pointing to a DID (decentralized identifier)
- `henryzoo.com` - Custom domain (if you own it and set up DNS)
- `did:plc:abc123...` - The actual DID (cryptographic identifier)

> While Bluesky hosts the default PDS/relay infrastructure, you can self-host.

```typescript
// Statusphere record (this app)
{ $type: 'xyz.statusphere.status', status: '😊', createdAt: '...' }

// Bluesky post record  
{ $type: 'app.bsky.feed.post', text: 'yo', createdAt: '...' }
```

## Building an app

### 1. Design your lexicon
Define record schemas for your use case:
```typescript
// xyz.statusphere.status lexicon
{
  $type: 'xyz.statusphere.status',
  status: string,     // emoji/character (maxLength: 32)  
  createdAt: string   // ISO datetime
}
```

### 2. Create local database
Apps need fast local queries, so index relevant data:
```sql
CREATE TABLE statuses (
  uri TEXT PRIMARY KEY,           -- at://did/collection/rkey
  did TEXT NOT NULL,             -- user's identifier  
  status TEXT NOT NULL,          -- emoji content
  created_at TEXT NOT NULL,      -- user's timestamp
  indexed_at TEXT DEFAULT NOW()  -- when we saw it
);
```

### 3. Write records to user repos
```typescript
await rpc.post("com.atproto.repo.createRecord", {
  input: {
    repo: userDid,                        // their repo
    collection: "xyz.statusphere.status", // your lexicon
    record: { $type: "xyz.statusphere.status", status: "😊", createdAt: "..." }
  }
});
```

### 4. Listen to the firehose  
```typescript
new JetstreamSubscription({ 
  wantedCollections: ["xyz.statusphere.status"] 
});
```

## Quick Start

- [Bun](https://bun.sh) runtime
- A Bluesky account for testing

```bash
bun install
bun run dev
```

Visit **http://127.0.0.1:3001** and sign in with your Bluesky account.

## Learn More

- [AT Protocol Docs](https://atproto.com)
- [ATP Tools](https://atp.tools) - Explore records
- [Ethos](https://atproto.com/articles/atproto-ethos) and [for Distributed Systems Engineers](https://atproto.com/articles/atproto-for-distsys-engineers)