# Document Search Management Design

## Summary

This design implements the full "知识库文档管理与智能搜索优化 PRD" for the AI knowledge base. The goal is to turn document search and document management into real backend-backed capabilities, not a UI-only adjustment.

The implementation will cover document-level permissions, folder permission inheritance, search permission filtering, hot search statistics, search history de-duplication, document batch operations, parse retry, archive/delete behavior, AI answer citation filtering, and two redesigned frontend pages based on `knowledge-management-design/`.

## Current State

The frontend already has:

- `apps/web/src/app/(dashboard)/search/page.tsx`, with keyword/semantic/hybrid search, search history, sorting, topK, loading and empty states.
- `apps/web/src/app/(dashboard)/documents/page.tsx`, with upload, folder/tag filtering, status filtering, document preview/detail, edit and delete actions.
- Tailwind, lucide icons, and local utility classes in `apps/web/src/app/globals.css`.

The backend already has:

- `SearchService`, with BM25, vector, hybrid, trigram fallback, safe highlights, search history, and per-user history APIs.
- `DocumentsService`, with upload, list, detail, update, delete, tag operations, deduplication, parsing queue integration, and graph cleanup.
- Prisma models for users, departments, folders, documents, document contents, chunks, tags, search histories, QA messages, graph data, and refresh tokens.
- Role-level resource permissions, but not document-level subject permissions.

The PRD gaps are:

- No document permission table or document-level permission evaluation.
- No folder permission inheritance.
- Search does not filter by document access, `searchable`, `permissionScope`, file type, update time, parse status, uploader, department, or category.
- QA recall does not yet filter by document `aiReferenceEnabled`.
- Hot search statistics and trending are missing.
- Search history does not yet de-duplicate by keyword.
- Document management lacks PRD table fields, batch action bar, permission modal, batch permission setting, archive, logical delete, parse retry, and richer filters.
- Frontend pages do not yet match the density and structure in `knowledge-management-design/pages`.

## Design Principles

- Backend permission checks are the security boundary. The frontend only reflects backend results.
- All document exposure surfaces use the same document access service: document list, detail, download, search, QA recall, graph/evidence links when applicable.
- Permissions default to private and explicit. If there is no clear grant, the document is not visible.
- Document-specific permissions override inherited folder permissions.
- Batch operations return per-document outcomes so partial failures are visible and recoverable.
- The UI remains a dense management tool: restrained visual styling, compact controls, predictable navigation, and no marketing-style sections.

## Data Model

### Document Fields

Extend `Document` with:

- `permissionScope`: string, default `PRIVATE`, values `PRIVATE`, `MEMBERS`, `DEPARTMENTS`, `COMPANY`, `PUBLIC`, `ADMIN`.
- `searchable`: boolean, default `true`.
- `aiReferenceEnabled`: boolean, default `true`.
- `archived`: boolean, default `false`.
- `deletedAt`: nullable timestamp.
- `deletedBy`: nullable user id.

These fields support list display, filtering, and quick exclusion. They are not sufficient alone for sensitive access checks.

### DocumentPermission

Add `document_permissions`:

- `id`
- `tenantId`
- `documentId`
- `subjectType`: `USER`, `DEPARTMENT`, `ROLE`
- `subjectId`
- `canView`
- `canDownload`
- `canEdit`
- `canDelete`
- `canManagePermission`
- `createdBy`
- `createdAt`
- `updatedAt`

Unique key: `(tenantId, documentId, subjectType, subjectId)`.

### FolderPermission

Add `folder_permissions`:

- Same subject and action fields as `document_permissions`.
- `folderId`
- `permissionScope`
- `searchable`
- `aiReferenceEnabled`
- `createdBy`
- `createdAt`
- `updatedAt`

New uploads into a folder inherit this default permission set unless an explicit document permission is applied afterward.

### PermissionAuditLog

Add `permission_audit_logs`:

- `id`
- `tenantId`
- `actorId`
- `targetType`: `DOCUMENT`, `FOLDER`, `BATCH`
- `targetId`
- `action`: `SET_PERMISSION`, `BATCH_SET_PERMISSION`, `FOLDER_INHERIT`, `ARCHIVE`, `DELETE`, `RESTORE`, `MOVE`
- `mode`: `APPEND`, `OVERWRITE`, or `DIRECT`
- `before`
- `after`
- `createdAt`

This table records permission changes and high-risk operations.

### SearchEvent and HotSearchKeyword

Add `search_events`:

- `id`
- `tenantId`
- `userId`
- `keyword`
- `categoryId`
- `resultCount`
- `eventType`: `SEARCH`, `RESULT_CLICK`, `DOCUMENT_VIEW`, `DOCUMENT_DOWNLOAD`
- `createdAt`

Add `hot_search_keywords` for administrator-managed boost/pin:

- `id`
- `tenantId`
- `keyword`
- `categoryId`
- `pinned`
- `weight`
- `enabled`
- `createdBy`
- `createdAt`
- `updatedAt`

`GET /search/hot` computes hot terms from `search_events` plus administrator weight.

## Permission Rules

Use this priority order:

1. Super admin can manage all tenant documents.
2. Admin can manage documents in their authorized tenant scope.
3. Explicit document permissions override folder inheritance.
4. User grants override department grants when both exist.
5. Role grants apply after user and department grants.
6. Owner has view/edit/manage rights for their own document unless deleted or restricted by an admin-only scope.
7. No explicit permission means not visible.
8. Delete and permission management require explicit action rights.

`permissionScope` maps to default visibility:

- `PRIVATE`: owner plus explicit subjects.
- `MEMBERS`: explicit users.
- `DEPARTMENTS`: explicit departments.
- `COMPANY`: all authenticated tenant users can view.
- `PUBLIC`: all users who can access the system can view.
- `ADMIN`: admin and super admin only.

Download, edit, delete, and manage permissions still require action-level grants.

## Backend Services

### DocumentAccessService

Create a document access service responsible for:

- Building SQL fragments or Prisma filters for visible document ids.
- Checking a single document action: view, download, edit, delete, manage permission.
- Applying folder inheritance on upload and folder permission propagation.
- Returning per-document access flags for frontend display.
- Filtering search and QA candidates before sensitive fields are returned.

Document list, detail, download, search, QA recall, and batch operations must call this service.

### DocumentsService Changes

`DocumentsService.list` will accept:

- `q`
- `status`
- `folderId`
- `tags`
- `fileType`
- `permissionScope`
- `uploaderId`
- `departmentId`
- `uploadedFrom`
- `uploadedTo`
- `archived`
- `page`
- `pageSize`
- `scope`: `mine`, `public`, `department`, `archive`, `all`

It returns:

- document fields
- `fileType`
- `permissionScope`
- `searchable`
- `aiReferenceEnabled`
- `canView`
- `canDownload`
- `canEdit`
- `canDelete`
- `canManagePermission`
- parse failure reason

### Batch Operations

Add:

- `POST /documents/batch`
- `PUT /documents/batch/permissions`

`POST /documents/batch` supports:

- `DOWNLOAD`
- `DELETE`
- `MOVE`
- `ARCHIVE`
- `RESTORE`

The response contains:

- `successCount`
- `failedCount`
- `items`: document id, status, message

High-risk operations use frontend confirmation and backend permission checks.

### Parse Retry

Add:

- `POST /documents/:id/parse/retry`

Only failed documents can be retried. The service sets status to parsing/pending, clears or retains the failure reason as appropriate, and re-enqueues the document.

### Logical Delete

Document delete becomes logical by setting `deletedAt` and `deletedBy`. Search, list, QA, and graph entry points exclude deleted documents. Existing hard-delete cleanup can remain as an internal maintenance path, not the default user action.

## Search Design

### Search API

Keep current `POST /search` for compatibility and add PRD-compatible `GET /search`.

Parameters:

- `keyword` or `q`
- `fileType`
- `categoryId` or `tagId`
- `permissionScope`
- `updateTimeRange`
- `parseStatus`
- `uploaderId`
- `departmentId`
- `sort`
- `page`
- `pageSize`
- `viewMode`

`sort` supports:

- `relevance`
- `updatedAt`
- `hot`
- `views`
- `downloads`
- `name`

`hot`, `views`, and `downloads` are sorted from `search_events` aggregates. If a document has no matching aggregate, its metric value is `0` and relevance remains the secondary tie-breaker.

### Search Filtering

All SQL search strategies add conditions for:

- current tenant
- not deleted
- not archived unless archive search is explicitly allowed
- `searchable = true`
- current user has view access
- requested filters

The search response includes permission-safe fields only:

- title
- highlight
- category/tag path
- updated time
- permission scope
- file type
- access flags

Documents without view access are not returned. Documents without download access return `canDownload = false`.

### Search History

Search history remains per tenant and user. Repeated searches for the same normalized keyword update the latest record instead of creating duplicates.

### Hot Search

Add:

- `GET /search/hot?range=today|week|month|all&categoryId=&limit=`

Hot score:

```text
searchCount * 1 + clickCount * 2 + viewCount * 3 + downloadCount * 4 + pinnedWeight
```

The service filters empty terms, configured sensitive terms, low-quality zero-result terms, and obvious abnormal traffic. The configured sensitive term list lives in backend configuration and the zero-result filter excludes keywords whose latest search events have no results and no follow-up click, view, or download events.

## AI Recall Design

QA recall must filter candidate chunks through the same document access rules:

- `canView = true`
- `aiReferenceEnabled = true`
- not deleted
- not archived unless archive recall is explicitly enabled

The answer citations must never include title, text, summary, or download links for documents that fail access checks. This is enforced after candidate retrieval as a final safety pass even if SQL already filters candidates.

## Frontend Design

### Visual Style

Match the `knowledge-management-design/` references:

- White main canvas with light gray sidebar.
- Blue primary color and pale blue selected states.
- 4px to 8px radii for tools, tabs, tables, and modals.
- 32px toolbar controls.
- 12px to 14px table and metadata text.
- Dense, scan-friendly management layout.
- Lucide icons for common tool buttons.

### Search Page

Default state:

- Centered search input with hint text `请输入文档标题、内容关键词`.
- Search button and advanced search entry.
- Hot search panel with time range tabs.
- Search history chips with clear action.
- Recommended categories.

Result state:

- Top search bar.
- Active filter tags with individual remove buttons.
- Filter controls for file type, update time, category, permission scope, and more filters.
- Result count.
- Sort selector.
- List/grid segmented view control.
- Permission notice: `部分内容因权限限制未展示`.
- Result cards/rows with file icon, title, highlighted snippet, source/category, updated time, permission scope, file type, view/download/favorite actions.
- Loading, empty, and error states.

### Document Management Page

Left navigation:

- 我的文档
- 公共文档
- 部门文档
- 文档归档

Toolbar:

- Search input
- Batch upload
- New folder
- File type
- Parse status
- Permission scope
- More filters
- Refresh

Table columns:

- Selection checkbox
- Document name
- File type
- Upload time
- Uploader
- Parse status
- Permission scope
- Actions

Batch bar:

- Selected count
- Batch download
- Batch delete
- Batch move
- Batch archive
- Batch set permissions
- Cancel selection

Permission modal:

- Document name or selected count
- Current permission scope
- Permission scope radio group
- Visible object selection
- Operation permissions
- Searchable switch
- AI reference switch
- Apply to child folders/documents
- Append/overwrite mode for batch permissions
- Save/cancel

## Frontend File Structure

Search page components:

- `SearchPage`
- `SearchLanding`
- `SearchFilters`
- `SearchResultsToolbar`
- `SearchResultList`
- `SearchResultGrid`
- `SearchHistoryPanel`
- `HotSearchPanel`

Document page components:

- `DocumentManagementPage`
- `DocumentScopeNav`
- `DocumentToolbar`
- `BatchActionBar`
- `DocumentTable`
- `PermissionModal`
- `DocumentMoveModal`
- `ConfirmDialog`

The final structure should keep existing API services under `apps/web/src/services` and endpoint wrappers under `apps/web/src/lib/api/endpoints`.

## Testing Strategy

### Backend Unit Tests

Add tests for:

- document access priority rules
- user, department, and role grants
- document permission overriding folder inheritance
- search history de-duplication
- hot search score calculation and range filtering
- batch permission append and overwrite modes
- parse retry status transition

### Backend Integration or Service Tests

Add tests that verify:

- search never returns documents without view permission
- search excludes `searchable = false`
- search returns `canDownload = false` for view-only documents
- QA recall excludes `aiReferenceEnabled = false`
- document list respects scope navigation and filters
- batch operations return partial success and failure details

### Frontend Tests

Use existing Vitest patterns:

- source/markup tests for page structure and required labels
- `renderToStaticMarkup` for extracted pure components where possible

Cover:

- search default state includes hot search, history, and recommended categories
- search result state includes filter tags, sort, view toggle, and permission notice
- document management includes PRD table columns and batch action bar
- permission modal contains scope, subject, action permissions, searchable, AI reference, inheritance, and save/cancel controls

### Manual Visual Verification

Run the app locally and verify:

- `/search` default and result states match the design references.
- `/documents` matches the management-table density and toolbar structure.
- permission modal is usable on desktop and narrow widths.
- no text overlaps or spills out of controls.

## Rollout Plan

1. Add Prisma schema changes and migration.
2. Add backend types and validation schemas.
3. Implement `DocumentAccessService`.
4. Update document list/detail/upload/delete/batch/permissions/retry endpoints.
5. Update search filters, permission filtering, history de-duplication, and hot search endpoints.
6. Update QA recall permission filtering.
7. Update frontend API types and endpoint wrappers.
8. Rebuild search page from the approved design.
9. Rebuild document management page from the approved design.
10. Run backend tests, frontend tests, type checks, and visual verification.

## Risks and Mitigations

- Permission leakage: every sensitive query must use `DocumentAccessService`, and tests must assert invisible documents never appear.
- Search index delay: service-level permission checks run at query time, independent of index freshness.
- Batch mistakes: destructive and overwrite actions require confirmation and audit logs.
- Migration risk: add nullable/defaulted columns first, backfill sensible defaults, then enforce indexes and constraints.
- Large UI files: split frontend into focused components before adding complex behavior.

## Acceptance Criteria Mapping

- Search history, hot search, filters, and results are on one search page.
- Hot search terms trigger search and combine with filters.
- Filters combine, display as removable tags, and can be cleared.
- Results support highlight, sorting, list/grid view, permission scope, and file type display.
- Documents without view permission never appear in search results.
- View-only documents hide download actions.
- Loading, default, empty, and no-permission states are present.
- Admin users can manage authorized documents.
- Document management supports file type, parse status, permission scope, uploader/time/category/archive filters.
- Single and batch document permission settings are supported.
- Permission changes affect document list, search results, downloads, detail access, and AI recall.
- Failed parse documents show reasons and can be retried.
- Role-specific visible documents and actions follow backend permission rules.
