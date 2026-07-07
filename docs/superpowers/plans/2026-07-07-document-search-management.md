# Document Search Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full document management and intelligent search PRD with real backend permissions, hot search, batch document operations, QA recall filtering, and redesigned search/documents pages.

**Architecture:** Add a document access layer as the single backend security boundary, then route document list/detail/download/search/QA/batch operations through it. Extend Prisma and shared schemas first, then implement API services, then rebuild the frontend around typed endpoint wrappers and small UI components matching `knowledge-management-design/`.

**Tech Stack:** TypeScript, NestJS, Prisma, PostgreSQL, Zod, Next.js App Router, React, Tailwind CSS, lucide-react, Vitest.

---

## Scope Check

This is a large cross-subsystem change. It remains one plan because the subsystems share one invariant: document access rules must be consistent across document management, search, and QA recall. The tasks below are ordered so each commit leaves the codebase in a testable state.

## File Structure

- Modify `apps/api/src/database/prisma/schema.prisma`: add document permission fields, permission tables, hot search event tables, audit tables, archive/delete fields.
- Create migration directory under `apps/api/src/database/prisma/migrations/0007_document_search_management/`.
- Modify `packages/schemas/src/document.ts`: shared document permission, filter, batch operation, parse retry, and permission modal contracts.
- Modify `packages/schemas/src/search.ts`: shared search filter, hot search, and extended result contracts.
- Modify `packages/schemas/src/index.ts`: export new schemas.
- Create `apps/api/src/modules/documents/document-access.service.ts`: central permission evaluator and SQL fragment builder.
- Create `apps/api/src/modules/documents/document-access.service.spec.ts`: role, owner, subject grant, scope, and inheritance tests.
- Modify `apps/api/src/modules/documents/documents.module.ts`: provide `DocumentAccessService`.
- Modify `apps/api/src/modules/documents/documents.controller.ts`: list filters, batch operations, permission endpoints, parse retry.
- Modify `apps/api/src/modules/documents/documents.service.ts`: permission-aware list/detail/upload/update/delete/batch/retry.
- Modify `apps/api/src/modules/search/search.controller.ts`: add `GET /search`, `GET /search/hot`, click/view/download event endpoints if needed.
- Modify `apps/api/src/modules/search/search.service.ts`: permission-aware search filters, hot search, history de-duplication.
- Modify `apps/api/src/modules/search/search.service.spec.ts`: schema, hot score, history de-duplication, permission filtering unit tests.
- Modify `apps/api/src/modules/qa/qa.service.ts`: pass user context into search and final-filter citations.
- Modify `apps/api/src/modules/qa/qa.service.spec.ts`: QA excludes `aiReferenceEnabled=false` and inaccessible citations.
- Modify `apps/web/src/types/api/documents.ts` and `apps/web/src/types/api/search.ts`: mirror shared contracts.
- Modify `apps/web/src/lib/api/endpoints/documents.ts` and `apps/web/src/lib/api/endpoints/search.ts`: add typed endpoint wrappers.
- Modify `apps/web/src/services/documents.ts` and `apps/web/src/services/search.ts`: export new endpoint methods.
- Create `apps/web/src/components/search/*`: landing, filters, toolbars, list/grid, history, hot search.
- Replace `apps/web/src/app/(dashboard)/search/page.tsx`: compose search components.
- Create `apps/web/src/components/documents/*`: scope nav, toolbar, batch bar, table, permission modal, move modal, confirm dialog.
- Replace `apps/web/src/app/(dashboard)/documents/page.tsx`: compose document management components.
- Add frontend page/component specs next to changed components.

## Task 1: Shared Contracts and Database Shape

**Files:**
- Modify: `packages/schemas/src/document.ts`
- Modify: `packages/schemas/src/search.ts`
- Modify: `packages/schemas/src/index.ts`
- Modify: `apps/api/src/database/prisma/schema.prisma`
- Create: `apps/api/src/database/prisma/migrations/0007_document_search_management/migration.sql`
- Test: `apps/api/src/modules/search/search.service.spec.ts`

- [ ] **Step 1: Write failing schema tests**

Add these tests to `apps/api/src/modules/search/search.service.spec.ts` under a new `describe("Document/search PRD schemas", ...)` block:

```ts
import {
  DocumentBatchOperationRequest,
  DocumentPermissionScope,
  DocumentPermissionUpdateRequest,
  SearchListQuery,
  HotSearchQuery,
} from "@ai-knowledge/schemas";

describe("Document/search PRD schemas", () => {
  it("accepts document permission updates with AI and search switches", () => {
    const parsed = DocumentPermissionUpdateRequest.parse({
      permissionScope: "COMPANY",
      entries: [
        {
          subjectType: "ROLE",
          subjectId: "viewer",
          canView: true,
          canDownload: false,
          canEdit: false,
          canDelete: false,
          canManagePermission: false,
        },
      ],
      searchable: true,
      aiReferenceEnabled: false,
      applyToChildren: false,
      mode: "APPEND",
    });

    expect(parsed.permissionScope).toBe("COMPANY");
    expect(parsed.aiReferenceEnabled).toBe(false);
  });

  it("accepts search filters and hot search ranges", () => {
    expect(DocumentPermissionScope.parse("DEPARTMENTS")).toBe("DEPARTMENTS");
    expect(SearchListQuery.parse({ keyword: "制度", fileType: "PDF", sort: "updatedAt" }).sort).toBe("updatedAt");
    expect(HotSearchQuery.parse({ range: "week", limit: "20" }).limit).toBe(20);
  });

  it("accepts batch archive and move document operations", () => {
    expect(
      DocumentBatchOperationRequest.parse({
        action: "MOVE",
        documentIds: ["doc-1", "doc-2"],
        folderId: "folder-1",
      }).action,
    ).toBe("MOVE");
  });
});
```

- [ ] **Step 2: Run schema tests and confirm they fail**

Run:

```bash
pnpm exec vitest run apps/api/src/modules/search/search.service.spec.ts
```

Expected: FAIL because the imported schema names do not exist.

- [ ] **Step 3: Add shared document schemas**

In `packages/schemas/src/document.ts`, add these exports after `Role`:

```ts
export const DocumentPermissionScope = z.enum([
  "PRIVATE",
  "MEMBERS",
  "DEPARTMENTS",
  "COMPANY",
  "PUBLIC",
  "ADMIN",
]);
export type DocumentPermissionScope = z.infer<typeof DocumentPermissionScope>;

export const PermissionSubjectType = z.enum(["USER", "DEPARTMENT", "ROLE"]);
export type PermissionSubjectType = z.infer<typeof PermissionSubjectType>;

export const PermissionMode = z.enum(["APPEND", "OVERWRITE", "DIRECT"]);
export type PermissionMode = z.infer<typeof PermissionMode>;

export const DocumentPermissionEntry = z.object({
  subjectType: PermissionSubjectType,
  subjectId: z.string().min(1),
  canView: z.boolean().default(true),
  canDownload: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canManagePermission: z.boolean().default(false),
});
export type DocumentPermissionEntry = z.infer<typeof DocumentPermissionEntry>;

export const DocumentPermissionUpdateRequest = z.object({
  permissionScope: DocumentPermissionScope,
  entries: z.array(DocumentPermissionEntry).default([]),
  searchable: z.boolean().default(true),
  aiReferenceEnabled: z.boolean().default(true),
  applyToChildren: z.boolean().default(false),
  mode: PermissionMode.default("DIRECT"),
});
export type DocumentPermissionUpdateRequest = z.infer<typeof DocumentPermissionUpdateRequest>;

export const DocumentBatchAction = z.enum(["DOWNLOAD", "DELETE", "MOVE", "ARCHIVE", "RESTORE"]);
export type DocumentBatchAction = z.infer<typeof DocumentBatchAction>;

export const DocumentBatchOperationRequest = z.object({
  action: DocumentBatchAction,
  documentIds: z.array(z.string().min(1)).min(1).max(200),
  folderId: z.string().optional(),
});
export type DocumentBatchOperationRequest = z.infer<typeof DocumentBatchOperationRequest>;
```

Extend `DocumentDto` with:

```ts
  permissionScope: DocumentPermissionScope.default("PRIVATE"),
  searchable: z.boolean().default(true),
  aiReferenceEnabled: z.boolean().default(true),
  archived: z.boolean().default(false),
  deletedAt: z.string().nullable().optional(),
  canView: z.boolean().default(false),
  canDownload: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canManagePermission: z.boolean().default(false),
```

Extend `DocumentListQuery` with:

```ts
  folderId: z.string().optional(),
  tags: z.string().optional(),
  fileType: z.string().optional(),
  permissionScope: DocumentPermissionScope.optional(),
  uploaderId: z.string().optional(),
  departmentId: z.string().optional(),
  uploadedFrom: z.string().optional(),
  uploadedTo: z.string().optional(),
  archived: z.coerce.boolean().optional(),
  scope: z.enum(["mine", "public", "department", "archive", "all"]).default("all"),
```

- [ ] **Step 4: Add shared search schemas**

In `packages/schemas/src/search.ts`, extend `SearchSortBy`:

```ts
export const SearchSortBy = z.enum(["relevance", "time", "name", "updatedAt", "hot", "views", "downloads"]);
```

Add:

```ts
export const SearchListQuery = z.object({
  keyword: z.string().optional(),
  q: z.string().optional(),
  fileType: z.string().optional(),
  categoryId: z.string().optional(),
  tagId: z.string().optional(),
  permissionScope: z.enum(["PRIVATE", "MEMBERS", "DEPARTMENTS", "COMPANY", "PUBLIC", "ADMIN"]).optional(),
  updateTimeRange: z.enum(["all", "today", "7d", "30d", "custom"]).default("all"),
  parseStatus: z.string().optional(),
  uploaderId: z.string().optional(),
  departmentId: z.string().optional(),
  sort: SearchSortBy.default("relevance"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  viewMode: z.enum(["list", "grid"]).default("list"),
});
export type SearchListQuery = z.infer<typeof SearchListQuery>;

export const HotSearchQuery = z.object({
  range: z.enum(["today", "week", "month", "all"]).default("today"),
  categoryId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(10),
});
export type HotSearchQuery = z.infer<typeof HotSearchQuery>;

export const HotSearchItem = z.object({
  keyword: z.string(),
  hotScore: z.number(),
  searchCount: z.number().int(),
  clickCount: z.number().int(),
  viewCount: z.number().int(),
  downloadCount: z.number().int(),
  trend: z.enum(["up", "down", "flat"]),
  categoryId: z.string().nullable().optional(),
  pinned: z.boolean().default(false),
});
export type HotSearchItem = z.infer<typeof HotSearchItem>;
```

Extend `SearchHit` with:

```ts
  permissionScope: z.string().optional(),
  canDownload: z.boolean().default(false),
  categoryPath: z.string().nullable().optional(),
```

- [ ] **Step 5: Export new schemas**

Update `packages/schemas/src/index.ts` to export all new document and search symbols.

- [ ] **Step 6: Modify Prisma schema and migration**

Add fields to `Document`:

```prisma
  permissionScope      String    @default("PRIVATE") @map("permission_scope")
  searchable           Boolean   @default(true)
  aiReferenceEnabled   Boolean   @default(true) @map("ai_reference_enabled")
  archived             Boolean   @default(false)
  deletedAt            DateTime? @map("deleted_at")
  deletedBy            String?   @map("deleted_by")
```

Add models `DocumentPermission`, `FolderPermission`, `PermissionAuditLog`, `SearchEvent`, and `HotSearchKeyword` with table and index names from the design spec.

Create `apps/api/src/database/prisma/migrations/0007_document_search_management/migration.sql` with matching `ALTER TABLE` and `CREATE TABLE` statements.

- [ ] **Step 7: Run tests and generate Prisma client**

Run:

```bash
pnpm --filter @ai-knowledge/api prisma:generate
pnpm exec vitest run apps/api/src/modules/search/search.service.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/schemas/src/document.ts packages/schemas/src/search.ts packages/schemas/src/index.ts apps/api/src/database/prisma/schema.prisma apps/api/src/database/prisma/migrations/0007_document_search_management/migration.sql apps/api/src/modules/search/search.service.spec.ts
git commit -m "feat: add document search management contracts"
```

## Task 2: Document Access Service

**Files:**
- Create: `apps/api/src/modules/documents/document-access.service.ts`
- Create: `apps/api/src/modules/documents/document-access.service.spec.ts`
- Modify: `apps/api/src/modules/documents/documents.module.ts`

- [ ] **Step 1: Write failing access service tests**

Create `apps/api/src/modules/documents/document-access.service.spec.ts` with tests for these behaviors:

```ts
import { describe, expect, it, vi } from "vitest";
import { DocumentAccessService } from "./document-access.service";

function createService() {
  const db = { tenantId: "tenant-1", userId: "user-1", query: vi.fn(), queryOne: vi.fn() };
  return { service: new DocumentAccessService(db as any), db };
}

describe("DocumentAccessService", () => {
  it("allows super admins to manage documents", async () => {
    const { service } = createService();
    await expect(
      service.canAccessDocument("doc-1", "MANAGE_PERMISSION", {
        userId: "admin-1",
        tenantId: "tenant-1",
        role: "super_admin",
      }),
    ).resolves.toBe(true);
  });

  it("builds a visibility SQL fragment scoped to tenant, owner, role, department, and grants", () => {
    const { service } = createService();
    const fragment = service.visibleDocumentWhereSql("d", {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "viewer",
      departmentId: "dept-1",
    });

    expect(fragment.sql).toContain("d.tenant_id = $1");
    expect(fragment.sql).toContain("d.deleted_at IS NULL");
    expect(fragment.sql).toContain("document_permissions");
    expect(fragment.values).toEqual(["tenant-1", "user-1", "viewer", "dept-1"]);
  });

  it("maps access flags from rows without exposing missing grants", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([
      { document_id: "doc-1", can_view: true, can_download: false, can_edit: false, can_delete: false, can_manage_permission: false },
    ]);

    await expect(
      service.getAccessFlags(["doc-1"], {
        userId: "user-1",
        tenantId: "tenant-1",
        role: "viewer",
      }),
    ).resolves.toEqual({
      "doc-1": {
        canView: true,
        canDownload: false,
        canEdit: false,
        canDelete: false,
        canManagePermission: false,
      },
    });
  });
});
```

- [ ] **Step 2: Run the access service tests and confirm they fail**

Run:

```bash
pnpm exec vitest run apps/api/src/modules/documents/document-access.service.spec.ts
```

Expected: FAIL because `document-access.service.ts` does not exist.

- [ ] **Step 3: Implement `DocumentAccessService`**

Create the service with these public APIs:

```ts
export type DocumentAction = "VIEW" | "DOWNLOAD" | "EDIT" | "DELETE" | "MANAGE_PERMISSION";
export interface DocumentUserContext {
  userId: string;
  tenantId: string;
  role: string;
  departmentId?: string | null;
}
export interface SqlFragment {
  sql: string;
  values: unknown[];
}
export interface DocumentAccessFlags {
  canView: boolean;
  canDownload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManagePermission: boolean;
}
```

Implement:

- `visibleDocumentWhereSql(alias, user): SqlFragment`
- `canAccessDocument(documentId, action, user): Promise<boolean>`
- `getAccessFlags(documentIds, user): Promise<Record<string, DocumentAccessFlags>>`
- `assertDocumentAccess(documentId, action, user): Promise<void>`
- `applyInheritedFolderPermissions(documentId, folderId, actorId): Promise<void>`
- `writeAuditLog(input): Promise<void>`

The SQL fragment must exclude `deleted_at`, include tenant, owner, company/public/admin scope, role grant, department grant, and user grant paths.

- [ ] **Step 4: Provide service in module**

Update `apps/api/src/modules/documents/documents.module.ts` to include `DocumentAccessService` in providers and exports.

- [ ] **Step 5: Run access tests**

Run:

```bash
pnpm exec vitest run apps/api/src/modules/documents/document-access.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/documents/document-access.service.ts apps/api/src/modules/documents/document-access.service.spec.ts apps/api/src/modules/documents/documents.module.ts
git commit -m "feat: add document access service"
```

## Task 3: Permission-Aware Document APIs

**Files:**
- Modify: `apps/api/src/modules/documents/documents.controller.ts`
- Modify: `apps/api/src/modules/documents/documents.service.ts`
- Modify: `apps/api/src/modules/documents/documents.module.ts`
- Test: `apps/api/src/modules/documents/documents.service.spec.ts`

- [ ] **Step 1: Write failing document service tests**

Create `apps/api/src/modules/documents/documents.service.spec.ts` with tests that verify:

- `list()` calls `DocumentAccessService.visibleDocumentWhereSql`.
- upload applies folder inheritance when `folderId` is present.
- logical delete sets `deletedAt` and does not hard-delete.
- batch archive returns per-document results.
- parse retry rejects non-FAILED documents and re-enqueues FAILED documents.

Use `vi.fn()` mocks for Prisma, `DatabaseService`, storage, queue, Neo4j, and `DocumentAccessService`.

- [ ] **Step 2: Run document service tests and confirm they fail**

Run:

```bash
pnpm exec vitest run apps/api/src/modules/documents/documents.service.spec.ts
```

Expected: FAIL because the service does not call `DocumentAccessService` and the new APIs are missing.

- [ ] **Step 3: Update controller query and permission endpoints**

In `DocumentsController`, extend `list()` query parameters to include all PRD filters. Add routes:

```ts
@Get(":id/permissions")
async getPermissions(@Param("id") id: string, @CurrentUser() user: any) {
  return this.docs.getPermissions(id, user);
}

@Put(":id/permissions")
async setPermissions(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: any) {
  return this.docs.setPermissions(id, body, user);
}

@Put("batch/permissions")
async setBatchPermissions(@Body() body: unknown, @CurrentUser() user: any) {
  return this.docs.setBatchPermissions(body, user);
}

@Post("batch")
async batch(@Body() body: unknown, @CurrentUser() user: any) {
  return this.docs.batch(body, user);
}

@Post(":id/parse/retry")
async retryParse(@Param("id") id: string, @CurrentUser() user: any) {
  return this.docs.retryParse(id, user);
}
```

Import and use Zod schemas from `@ai-knowledge/schemas` inside controller or service for request parsing.

- [ ] **Step 4: Update service behavior**

In `DocumentsService`:

- Inject `DocumentAccessService`.
- Use `visibleDocumentWhereSql` for list queries.
- Attach access flags to returned rows.
- Call `assertDocumentAccess(id, "VIEW", user)` for detail.
- Call `assertDocumentAccess(id, "DELETE", user)` for delete.
- Make delete logical by updating `deletedAt` and `deletedBy`.
- Apply folder inheritance after upload when a folder has permissions.
- Implement `getPermissions`, `setPermissions`, `setBatchPermissions`, `batch`, and `retryParse`.

- [ ] **Step 5: Run document tests**

Run:

```bash
pnpm exec vitest run apps/api/src/modules/documents/document-access.service.spec.ts apps/api/src/modules/documents/documents.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/documents/documents.controller.ts apps/api/src/modules/documents/documents.service.ts apps/api/src/modules/documents/documents.module.ts apps/api/src/modules/documents/documents.service.spec.ts
git commit -m "feat: add permission-aware document operations"
```

## Task 4: Permission-Aware Search and Hot Search

**Files:**
- Modify: `apps/api/src/modules/search/search.controller.ts`
- Modify: `apps/api/src/modules/search/search.service.ts`
- Modify: `apps/api/src/modules/search/search.module.ts`
- Modify: `apps/api/src/modules/search/search.service.spec.ts`

- [ ] **Step 1: Write failing search tests**

Add tests for:

- `recordHistory()` de-duplicates normalized query for a user.
- `hotScore()` calculates weighted score.
- `hotSearch()` filters zero-result terms without click/view/download.
- `search()` passes user context into SQL filtering and excludes `searchable=false`.

- [ ] **Step 2: Run search tests and confirm they fail**

Run:

```bash
pnpm exec vitest run apps/api/src/modules/search/search.service.spec.ts
```

Expected: FAIL because hot search and permission-aware search are not implemented.

- [ ] **Step 3: Inject document access into search module**

Import `DocumentsModule` or provide `DocumentAccessService` so `SearchService` can use `visibleDocumentWhereSql`.

- [ ] **Step 4: Extend search controller**

Add:

```ts
@Get()
async getSearch(@Query() query: unknown, @CurrentUser() user: any) {
  return this.search.searchList(query, user);
}

@Get("hot")
async hot(@Query() query: unknown) {
  return this.search.listHotSearch(query);
}
```

Keep existing `POST /search` behavior but pass user context into `SearchService.search`.

- [ ] **Step 5: Update search service**

Implement:

- `searchList(rawQuery, user)`
- `listHotSearch(rawQuery)`
- `recordSearchEvent(input)`
- `recordHistory()` as upsert/delete+insert by normalized keyword
- sort metrics for `hot`, `views`, and `downloads` from `search_events`

Update `bm25`, `bm25Chinese`, `bm25English`, `vector`, and `trgmSearch` SQL to include:

- tenant
- not deleted
- not archived unless requested
- searchable
- visible document fragment
- PRD filters

- [ ] **Step 6: Run search tests**

Run:

```bash
pnpm exec vitest run apps/api/src/modules/search/search.service.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/search/search.controller.ts apps/api/src/modules/search/search.service.ts apps/api/src/modules/search/search.module.ts apps/api/src/modules/search/search.service.spec.ts
git commit -m "feat: add permission-aware search and hot terms"
```

## Task 5: QA Recall Permission Filtering

**Files:**
- Modify: `apps/api/src/modules/qa/qa.service.ts`
- Modify: `apps/api/src/modules/qa/qa.module.ts`
- Modify: `apps/api/src/modules/qa/qa.service.spec.ts`

- [ ] **Step 1: Write failing QA tests**

In `qa.service.spec.ts`, add tests that mock `search.search()` returning mixed hits and assert:

- `aiReferenceEnabled=false` documents are excluded before citations are emitted.
- inaccessible document hits are not included in context or citations.

- [ ] **Step 2: Run QA tests and confirm they fail**

Run:

```bash
pnpm exec vitest run apps/api/src/modules/qa/qa.service.spec.ts
```

Expected: FAIL because QA does not final-filter citations by document access.

- [ ] **Step 3: Inject access service and filter hits**

In `QaService.ask()`:

- Pass user context into `this.search.search`.
- After `topHits`, call `DocumentAccessService.getAccessFlags`.
- Keep only hits with `canView=true`.
- Keep only hits whose document has `aiReferenceEnabled=true`; fetch this flag with a single SQL query keyed by document id.
- Build citations and context from filtered hits only.

- [ ] **Step 4: Protect document file and markdown routes**

Update `getDocumentPresignedUrl` and `getDocumentMarkdown` to require `VIEW` access, and update `getDocumentFile` to require `DOWNLOAD` access before returning the file stream.

- [ ] **Step 5: Run QA tests**

Run:

```bash
pnpm exec vitest run apps/api/src/modules/qa/qa.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/qa/qa.service.ts apps/api/src/modules/qa/qa.module.ts apps/api/src/modules/qa/qa.service.spec.ts
git commit -m "feat: filter qa recall by document permissions"
```

## Task 6: Frontend API Types and Endpoint Wrappers

**Files:**
- Modify: `apps/web/src/types/api/documents.ts`
- Modify: `apps/web/src/types/api/search.ts`
- Modify: `apps/web/src/types/api/index.ts`
- Modify: `apps/web/src/lib/api/endpoints/documents.ts`
- Modify: `apps/web/src/lib/api/endpoints/search.ts`
- Modify: `apps/web/src/services/documents.ts`
- Modify: `apps/web/src/services/search.ts`
- Test: `apps/web/src/lib/api/endpoints/search.spec.ts`
- Test: `apps/web/src/lib/api/endpoints/documents.spec.ts`

- [ ] **Step 1: Write failing endpoint tests**

Add tests that verify:

- `searchList()` calls `apiClient.get("/search", { query })`.
- `getHotSearch()` calls `apiClient.get("/search/hot", { query })`.
- `batchDocuments()` calls `apiClient.post("/documents/batch", body)`.
- `setBatchPermissions()` calls `apiClient.put("/documents/batch/permissions", body)`.
- `retryParse()` calls `apiClient.post("/documents/:id/parse/retry")`.

- [ ] **Step 2: Run frontend endpoint tests and confirm they fail**

Run:

```bash
pnpm exec vitest run apps/web/src/lib/api/endpoints/search.spec.ts apps/web/src/lib/api/endpoints/documents.spec.ts
```

Expected: FAIL because endpoint wrappers are missing.

- [ ] **Step 3: Add frontend types**

Mirror the shared document/search contract in `apps/web/src/types/api/documents.ts` and `apps/web/src/types/api/search.ts`. Export all new types from `apps/web/src/types/api/index.ts`.

- [ ] **Step 4: Add endpoint wrappers and service exports**

Add document endpoint functions:

- `getDocumentPermissions`
- `setDocumentPermissions`
- `setBatchDocumentPermissions`
- `batchDocuments`
- `retryDocumentParse`

Add search endpoint functions:

- `searchList`
- `getHotSearch`
- `recordSearchEvent`

Export each function through `apps/web/src/services`.

- [ ] **Step 5: Run endpoint tests**

Run:

```bash
pnpm exec vitest run apps/web/src/lib/api/endpoints/search.spec.ts apps/web/src/lib/api/endpoints/documents.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/types/api/documents.ts apps/web/src/types/api/search.ts apps/web/src/types/api/index.ts apps/web/src/lib/api/endpoints/documents.ts apps/web/src/lib/api/endpoints/search.ts apps/web/src/services/documents.ts apps/web/src/services/search.ts apps/web/src/lib/api/endpoints/search.spec.ts apps/web/src/lib/api/endpoints/documents.spec.ts
git commit -m "feat: add document search frontend API contracts"
```

## Task 7: Search Page Components

**Files:**
- Create: `apps/web/src/components/search/HotSearchPanel.tsx`
- Create: `apps/web/src/components/search/SearchHistoryPanel.tsx`
- Create: `apps/web/src/components/search/SearchFilters.tsx`
- Create: `apps/web/src/components/search/SearchLanding.tsx`
- Create: `apps/web/src/components/search/SearchResultsToolbar.tsx`
- Create: `apps/web/src/components/search/SearchResultList.tsx`
- Create: `apps/web/src/components/search/SearchResultGrid.tsx`
- Replace: `apps/web/src/app/(dashboard)/search/page.tsx`
- Test: `apps/web/src/app/(dashboard)/search/page.spec.ts`

- [ ] **Step 1: Write failing page structure test**

Create `apps/web/src/app/(dashboard)/search/page.spec.ts` using source assertions:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("SearchPage PRD structure", () => {
  it("composes search landing, filters, hot terms, history, and result views", () => {
    expect(source).toContain("SearchLanding");
    expect(source).toContain("SearchFilters");
    expect(source).toContain("SearchResultsToolbar");
    expect(source).toContain("SearchResultList");
    expect(source).toContain("SearchResultGrid");
    expect(source).toContain("HotSearchPanel");
    expect(source).toContain("SearchHistoryPanel");
  });
});
```

- [ ] **Step 2: Run the search page test and confirm it fails**

Run:

```bash
pnpm exec vitest run 'apps/web/src/app/(dashboard)/search/page.spec.ts'
```

Expected: FAIL because the page does not compose these components.

- [ ] **Step 3: Build pure search components**

Implement components with props and no direct API calls except in the page. Use 4px/8px radii, compact 32px controls, lucide icons, and PRD labels:

- `热门搜索`
- `搜索历史`
- `推荐分类`
- `高级搜索`
- `清空筛选`
- `权限范围`
- `相关度排序`
- `部分内容因权限限制未展示`

- [ ] **Step 4: Replace page orchestration**

In `page.tsx`:

- Load history and hot search on mount.
- Keep filter state in URL query via `useSearchParams` and `router.replace`.
- Run search on Enter, search button, hot term click, history click, and filter changes.
- Toggle list/grid view.
- Render default state when no keyword and no active filter exists.
- Render result state when keyword or filter exists.

- [ ] **Step 5: Run search page tests and web build**

Run:

```bash
pnpm exec vitest run 'apps/web/src/app/(dashboard)/search/page.spec.ts'
pnpm --filter @ai-knowledge/web build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/search apps/web/src/app/(dashboard)/search/page.tsx apps/web/src/app/(dashboard)/search/page.spec.ts
git commit -m "feat: redesign intelligent search page"
```

## Task 8: Document Management Page Components

**Files:**
- Create: `apps/web/src/components/documents/DocumentScopeNav.tsx`
- Create: `apps/web/src/components/documents/DocumentToolbar.tsx`
- Create: `apps/web/src/components/documents/BatchActionBar.tsx`
- Create: `apps/web/src/components/documents/DocumentTable.tsx`
- Create: `apps/web/src/components/documents/PermissionModal.tsx`
- Create: `apps/web/src/components/documents/DocumentMoveModal.tsx`
- Create: `apps/web/src/components/documents/ConfirmDialog.tsx`
- Replace: `apps/web/src/app/(dashboard)/documents/page.tsx`
- Test: `apps/web/src/app/(dashboard)/documents/page.spec.ts`
- Test: `apps/web/src/components/documents/PermissionModal.spec.ts`

- [ ] **Step 1: Write failing document page structure tests**

Create `apps/web/src/app/(dashboard)/documents/page.spec.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("DocumentsPage PRD structure", () => {
  it("composes scope nav, toolbar, batch actions, table, and permission modal", () => {
    expect(source).toContain("DocumentScopeNav");
    expect(source).toContain("DocumentToolbar");
    expect(source).toContain("BatchActionBar");
    expect(source).toContain("DocumentTable");
    expect(source).toContain("PermissionModal");
  });
});
```

Create `apps/web/src/components/documents/PermissionModal.spec.ts` with `renderToStaticMarkup` and assert labels:

- `权限范围`
- `可见对象`
- `操作权限`
- `是否允许搜索`
- `是否允许AI问答引用`
- `追加权限`
- `覆盖权限`

- [ ] **Step 2: Run document page tests and confirm they fail**

Run:

```bash
pnpm exec vitest run 'apps/web/src/app/(dashboard)/documents/page.spec.ts' apps/web/src/components/documents/PermissionModal.spec.ts
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Build document components**

Implement components with typed props. The table columns must be:

- selection checkbox
- document name
- file type
- upload time
- uploader
- parse status
- permission scope
- actions

The scope nav labels must be:

- 我的文档
- 公共文档
- 部门文档
- 文档归档

- [ ] **Step 4: Replace page orchestration**

In `page.tsx`:

- Load documents with PRD filters.
- Support scope nav.
- Support selected document ids.
- Open `PermissionModal` for single and batch permission settings.
- Use `ConfirmDialog` for delete/archive/overwrite permissions.
- Call `documentsApi.batch`, `documentsApi.setPermissions`, `documentsApi.setBatchPermissions`, and `documentsApi.retryParse`.
- Preserve existing PDF and Markdown preview behavior.

- [ ] **Step 5: Run document page tests and web build**

Run:

```bash
pnpm exec vitest run 'apps/web/src/app/(dashboard)/documents/page.spec.ts' apps/web/src/components/documents/PermissionModal.spec.ts
pnpm --filter @ai-knowledge/web build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/documents apps/web/src/app/(dashboard)/documents/page.tsx apps/web/src/app/(dashboard)/documents/page.spec.ts
git commit -m "feat: redesign document management page"
```

## Task 9: End-to-End Verification and Visual Check

**Files:**
- Modify only files required by build or test failures found in this task.

- [ ] **Step 1: Run backend-focused tests**

Run:

```bash
pnpm exec vitest run apps/api/src/modules/documents/document-access.service.spec.ts apps/api/src/modules/documents/documents.service.spec.ts apps/api/src/modules/search/search.service.spec.ts apps/api/src/modules/qa/qa.service.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run frontend-focused tests**

Run:

```bash
pnpm exec vitest run apps/web/src/lib/api/endpoints/search.spec.ts apps/web/src/lib/api/endpoints/documents.spec.ts 'apps/web/src/app/(dashboard)/search/page.spec.ts' 'apps/web/src/app/(dashboard)/documents/page.spec.ts' apps/web/src/components/documents/PermissionModal.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run builds**

Run:

```bash
pnpm --filter @ai-knowledge/api build
pnpm --filter @ai-knowledge/web build
```

Expected: PASS.

- [ ] **Step 4: Start local app**

Run:

```bash
pnpm --filter @ai-knowledge/web dev
```

Expected: Next.js starts on `http://localhost:8888`.

- [ ] **Step 5: Browser visual verification**

Open:

- `http://localhost:8888/search`
- `http://localhost:8888/documents`

Verify:

- search default state matches design reference: centered search, hot search, history, recommended categories.
- search result state has filter tags, filter controls, sort, list/grid toggle, and compact result rows.
- documents page has left scope nav, toolbar, batch action bar after selection, PRD table columns, and permission modal.
- no text overlaps at desktop width and narrow responsive width.

- [ ] **Step 6: Final status check**

Run:

```bash
git status --short
```

Expected: only intentional implementation files are changed.

- [ ] **Step 7: Commit verification fixes**

If Step 1 through Step 5 required fixes:

```bash
git add <changed-files>
git commit -m "fix: polish document search management verification"
```

If no fixes were required, skip this commit.
