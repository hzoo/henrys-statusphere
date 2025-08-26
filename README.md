# Henry Statusphere

Minimal AT Protocol app - share emoji statuses.

## Quick Start

```bash
bun install
bun run dev
# Visit http://127.0.0.1:3001
```

## How It Works

1. **You post** → Your status goes to AT Protocol (your personal data server)
2. **Jetstream listens** → Captures all status posts from the network  
3. **Timeline shows** → Aggregated statuses from everyone

## Project Structure

- `src/index.ts` - Web server & API
- `src/lib/oauth.ts` - Bluesky authentication  
- `src/jetstream.ts` - Real-time network listener
- `src/pages/app.ts` - Client-side UI
- `lexicons/xyz.statusphere.status.json` - Status record schema
- `src/db.ts` - SQLite storage

## Core Concepts

### Custom Lexicon (Schema)

Defines the structure of a status record:

```json
{
  "status": "😊",
  "createdAt": "2024..."
}
```

### Posting to AT Protocol

```typescript
rpc.post("com.atproto.repo.createRecord", {
  input: {
    repo: did,
    collection: "xyz.statusphere.status", 
    record: statusRecord
  }
})
```

### Listening to Network

```typescript
const subscription = new JetstreamSubscription({
  wantedCollections: ["xyz.statusphere.status"]
});
```

## Testing

You can view your status records directly on the AT Protocol network using ATP Tools:

```
https://atp.tools/at:/alice.bsky.social/xyz.statusphere.status
```

## Extending

1. Modify `lexicons/xyz.statusphere.status.json`
2. Run `bun run generate` to update TypeScript types
3. Add new fields to your status records

## Learn More

- [AT Protocol Docs](https://atproto.com)
- [Bluesky API](https://docs.bsky.app)
- [ATP Tools](https://atp.tools) - Explore AT Protocol records