# Henry Statusphere

> Based off https://atproto.com/guides/applications and statusphere.xyz

*Note: This is just me documenting my own learning/understanding of atproto/lexicons + making a somewhat minimalistic app (jetstream, sqlite, client side oauth)

## Notes

*"everyone has their own database"*

- There's no singular database - you always post to your own database only
- Apps are indexers that selectively listen to whatever lexicons they want
- If Bluesky (the app) dies, your data survives on your server. If the status app dies, your statuses still exist in the PDS.
- Someone could create a wildly popular lexicon through a completely different app/UI
- Your app could index Bluesky posts + status updates + any other records, or focus on just one type
- Innovation can happen at the data layer (new lexicons) independent of the app layer

Example: You post `xyz.statusphere.status` → Statusphere (the app) shows it. Bluesky (the app) ignores it. If you post `app.bsky.feed.post` → Bluesky shows it. Same firehose, different indexing.

## Records

```
at://alice.bsky.social/xyz.statusphere.status/3jzfcijpj2z2a
    └─ user's domain   └─ record type      └─ rkey (record key)
```

The domain can be your own website (`henryzoo.com`) or use Bluesky's (`alice.bsky.social`). 

While Bluesky hosts the default PDS/relay infrastructure, others are creating their own and self-hosting.

The **rkey** is usually timestamp-based (auto-generated) but can be fixed like `"self"` for profiles.

```typescript
// Statusphere record
{ $type: 'xyz.statusphere.status', status: '😊', createdAt: '...' }

// Bluesky post record  
{ $type: 'app.bsky.feed.post', text: 'yo', createdAt: '...' }
```

## Building Apps

The AT Protocol pattern:

1. **Design schema** - Define record types (like `xyz.statusphere.status`)
2. **Create database** - For aggregating records into views (SQLite)
3. **Write records** - Build app to post to users' repos
4. **Listen to firehose** - Aggregate data across the network

```typescript
// Post to your database
await rpc.post("com.atproto.repo.createRecord", {
  input: { repo: did, collection: "xyz.statusphere.status", record }
})

// Listen to everyone's database
new JetstreamSubscription({ wantedCollections: ["xyz.statusphere.status"] })
```

## Quick Start

```bash
bun install
bun run dev
# Visit http://127.0.0.1:3001
```

## Learn More

- [AT Protocol Docs](https://atproto.com)
- [ATP Tools](https://atp.tools) - Explore records
- [Ethos](https://atproto.com/articles/atproto-ethos) and [for Distributed Systems Engineers](https://atproto.com/articles/atproto-for-distsys-engineers)