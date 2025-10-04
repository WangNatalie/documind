# Database Schema & Migration History

## Current Version: 4

### Database Name
`pdf_viewer_v0`

## Migration History

### Version 1 (Initial)
**Created:** Initial setup
**Stores:**
- `docs` - Document metadata
  - Key: `docHash`
  - Indexes: `by-updatedAt`
- `pages` - Page text and metadata
  - Key: `[docHash, page]` (compound)
  - Indexes: `by-docHash`

### Version 2
**Created:** Chunking support
**Stores:**
- `chunks` - Document chunks for AI processing
  - Key: `id`
  - Indexes: `by-docHash`, `by-docHash-index`
- `chunkTasks` - Background chunk processing tasks
  - Key: `taskId`
  - Indexes: `by-docHash`, `by-status`

### Version 3
**Created:** Annotations - Highlights
**Stores:**
- `highlights` - Text highlights with multiple colors
  - Key: `id`
  - Indexes: `by-docHash`, `by-page`
  - Schema: `{ id, docHash, page, rects: HighlightRect[], color, createdAt }`

### Version 4
**Created:** Annotations - Notes
**Stores:**
- `notes` - Text notes with hover tooltips
  - Key: `id`
  - Indexes: `by-docHash`, `by-page`
  - Schema: `{ id, docHash, page, rects: HighlightRect[], text, createdAt }`

**Migration:** If `notes` store already existed from v3, migrates any old records with `rect` (singular) to `rects[]` (array) to support multi-line selections.

## Schema Types

### HighlightRect
```typescript
{
  top: number;      // 0..1 normalized or absolute pixels
  left: number;     // 0..1 normalized or absolute pixels
  width: number;    // 0..1 normalized or absolute pixels
  height: number;   // 0..1 normalized or absolute pixels
}
```

### HighlightRecord
```typescript
{
  id: string;                  // Format: docHash:page:timestamp
  docHash: string;
  page: number;
  rects: HighlightRect[];      // Multiple rects for multi-line selections
  color: string;               // e.g., "yellow", "green", "blue"
  createdAt: number;           // Unix timestamp
}
```

### NoteRecord
```typescript
{
  id: string;                  // Format: docHash:page:timestamp
  docHash: string;
  page: number;
  rects: HighlightRect[];      // Multiple rects for multi-line selections
  text: string;                // User's note text
  createdAt: number;           // Unix timestamp
}
```

## Coordinate System

All highlights and notes use **normalized coordinates** (0..1 fractions of page dimensions) to ensure they scale correctly when zooming. The viewer converts these to pixel coordinates at render time.

## Migration Safety

Each migration is guarded with `if (oldVersion < N)` checks and only creates stores if they don't exist. This ensures:
- **Idempotent migrations** - Safe to run multiple times
- **Incremental upgrades** - Users can upgrade from any version to latest
- **Data preservation** - Existing data is never lost, only transformed

## Developer Notes

When adding a new migration:
1. Increment `DB_VERSION` constant at top of `src/db/index.ts`
2. Add new `if (oldVersion < N)` block in `upgrade()` callback
3. Create new stores or add indexes as needed
4. If changing existing store schema, implement data migration
5. Add console.log statements for debugging
6. Update this document with migration details
7. Test migration by:
   - Creating test data at old version
   - Bumping version and verifying data migrates correctly
   - Checking browser DevTools → Application → IndexedDB

## Inspecting Current DB in Browser

```javascript
// List all databases
indexedDB.databases().then(dbs => console.log(dbs));

// Delete database (destructive!)
indexedDB.deleteDatabase('pdf_viewer_v0').onsuccess = () => console.log('deleted');
```

Or use DevTools → Application → IndexedDB → `pdf_viewer_v0`
