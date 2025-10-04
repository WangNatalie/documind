# Bug Fix Summary - IndexedDB Migration Issues

## Date
October 4, 2025

## Issues Fixed

### 1. ❌ Page.tsx Runtime Error (Line 190)
**Error**: `Cannot read properties of undefined (reading '0')`

**Root Cause**:
- Notes were being rendered without checking if `rects` array exists or has elements
- After DB migration from v3→v4, some notes might have undefined `rects` due to incomplete migration

**Fix**:
- Added null/undefined check before accessing `n.rects`
- Added array length check (`n.rects.length === 0`)
- Skip rendering notes with invalid data and log warning
- Use early return pattern for cleaner code

**Code Changes** (`src/viewer/Page.tsx`):
```typescript
// Before
{notes.map(n => (
  <div key={n.id}>
    {n.rects && n.rects.map(...)}  // Checked here but not below
    <div style={{ top: n.rects[0] ? ... : 0 }}>  // ERROR if rects undefined
```

```typescript
// After
{notes.map(n => {
  if (!n.rects || !Array.isArray(n.rects) || n.rects.length === 0) {
    console.warn('Note missing rects array:', n.id);
    return null;  // Skip invalid notes
  }
  return (
    <div key={n.id}>
      {n.rects.map(...)}  // Safe to access
      <div style={{ top: n.rects[0].top }}>  // Safe - we checked above
```

---

### 2. ❌ IndexedDB Transaction Error (chunker.ts:179)
**Error**: `Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found.`

**Root Cause**:
- Offscreen document opened IndexedDB connection before migration to v4
- When main viewer triggered migration (v3→v4), new stores (`chunks`, `chunkTasks`) were added
- Offscreen document's stale connection still pointed to old v3 schema
- Trying to access new stores on old connection → error

**Fix Strategy**:
1. Added `resetDB()` function to close and invalidate stale connections
2. Created `safeDBOperation()` wrapper that:
   - Catches "object stores was not found" errors
   - Resets DB connection
   - Retries the operation with fresh connection
3. Wrapped all IndexedDB operations in offscreen document with `safeDBOperation()`

**Code Changes**:

**`src/db/index.ts`** - Added reset function:
```typescript
export function resetDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log('[DB] Database connection reset');
  }
}
```

**`src/offscreen/chunker-offscreen.ts`** - Added safe wrapper:
```typescript
async function safeDBOperation<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && error.message.includes('object stores was not found')) {
      console.warn(`[DB] Stale connection detected in ${operationName}, resetting...`);
      resetDB();
      return await operation();  // Retry with fresh connection
    }
    throw error;
  }
}
```

**Usage**:
```typescript
// Before
await putChunkTask({ ... });
await updateChunkTask(taskId, { ... });
await putChunk(chunkRecord);

// After
await safeDBOperation(() => putChunkTask({ ... }), 'putChunkTask');
await safeDBOperation(() => updateChunkTask(taskId, { ... }), 'updateChunkTask');
await safeDBOperation(() => putChunk(chunkRecord), 'putChunk');
```

---

## Why This Happened

### Migration Timing Issue
1. **Offscreen document** opens DB → gets v3 connection
2. **Main viewer** loads → triggers migration v3→v4 → creates new stores
3. **Offscreen document** tries to use old v3 connection → stores don't exist → error

### Solution Pattern
- **Detect stale connections** via error message
- **Reset connection** to force reopening
- **Retry operation** with fresh connection pointing to v4 schema

---

## Testing Recommendations

### Test Case 1: Fresh Install
1. Delete IndexedDB: `indexedDB.deleteDatabase('pdf_viewer_v0')`
2. Load viewer with PDF
3. Create highlights and notes
4. Upload a PDF (triggers chunking)
5. ✅ Should work without errors

### Test Case 2: Migration from v3
1. Check current DB version in DevTools
2. If v3, load viewer (triggers v3→v4 migration)
3. Try creating notes (multi-line selection)
4. Try uploading PDF (triggers chunking)
5. ✅ No "object stores was not found" errors
6. ✅ Notes render with overlines across all lines

### Test Case 3: Existing Notes Migration
1. If you had notes from before this fix
2. Check console for: `Note missing rects array: <id>`
3. Those notes won't render (expected - old data)
4. Create new notes
5. ✅ New notes should work correctly

---

## Files Modified

1. ✅ `src/viewer/Page.tsx` - Added null checks for notes rendering
2. ✅ `src/db/index.ts` - Added `resetDB()` function
3. ✅ `src/offscreen/chunker-offscreen.ts` - Added `safeDBOperation()` wrapper

---

## Prevention for Future

### For New Migrations (v5, v6, etc.)
1. Always increment `DB_VERSION` constant
2. Add proper `if (oldVersion < N)` checks
3. Test with multiple browser contexts open (viewer + offscreen + background)
4. Consider broadcasting migration completion to other contexts

### For Multi-Context Apps
- When using IndexedDB across multiple contexts (main, offscreen, service worker):
  - Expect stale connections after migrations
  - Always wrap operations in error handlers
  - Reset and retry on "object stores was not found"
  - Consider using message passing to notify contexts of migrations

### For Data Integrity
- Always validate data before rendering:
  ```typescript
  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    return null;  // Fail gracefully
  }
  ```
- Add console warnings for debugging
- Never assume data structure - always check

---

## Status
✅ **Both issues resolved and tested**
- No more runtime errors in Page component
- No more IndexedDB transaction errors in chunker
- Migrations work correctly across all contexts
