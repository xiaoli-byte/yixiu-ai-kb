# 修复回收站：让删除的文档进入回收站并支持恢复

## Context

用户在文档管理页面删除文档后，回收站里找不到该文档。根因是系统中"删除"和"归档"两个概念被混淆：

- **删除操作**（`remove` 方法）：设置 `deletedAt = new Date()`（软删除）
- **回收站查询**（scope="archive"）：过滤条件是 `d.archived = TRUE`，与 `deletedAt` 无关
- **可见性 SQL**（`visibleDocumentWhereSql`）：所有查询都包含 `d.deleted_at IS NULL`，即使改了回收站查询条件，已删除文档仍会被过滤掉

需要修复后端查询逻辑让回收站正确显示已删除文档，同时添加前端"恢复"功能。

## 修改方案

### 1. 后端：`document-access.service.ts` — 添加 `includeDeleted` 参数

给 `visibleDocumentWhereSql` 方法添加 `includeDeleted = false` 参数。当 `includeDeleted` 为 `true` 时，跳过 `deleted_at IS NULL` 条件。

同样给 `getAccessFlags`、`canAccessDocument`、`assertDocumentAccess` 添加 `includeDeleted = false` 参数，透传到 `visibleDocumentWhereSql`。

关键修改点：
- [document-access.service.ts:126-139](file:///i:/ai-knowledge/apps/api/src/modules/documents/document-access.service.ts#L126-L139)：`visibleDocumentWhereSql` 返回的 SQL 中，将 `AND ${alias}.deleted_at IS NULL` 改为条件输出
- [document-access.service.ts:151](file:///i:/ai-knowledge/apps/api/src/modules/documents/document-access.service.ts#L151)：`getAccessFlags` 透传参数
- [document-access.service.ts:142-149](file:///i:/ai-knowledge/apps/api/src/modules/documents/document-access.service.ts#L142-L149)：`canAccessDocument` 透传参数
- [document-access.service.ts:297-305](file:///i:/ai-knowledge/apps/api/src/modules/documents/document-access.service.ts#L297-L305)：`assertDocumentAccess` 透传参数

### 2. 后端：`documents.service.ts` — 修改 list 查询和 RESTORE 操作

**list 方法**（[documents.service.ts:80-168](file:///i:/ai-knowledge/apps/api/src/modules/documents/documents.service.ts#L80-L168)）：
- 调用 `visibleDocumentWhereSql` 时，当 `scope === "archive"` 传 `includeDeleted: true`
- archive scope 的过滤条件从 `d.archived = TRUE` 改为 `d.deleted_at IS NOT NULL`

修改后的 scope 过滤逻辑：
```ts
if (opts.scope === "archive") {
  filters.push("d.deleted_at IS NOT NULL");
} else if (typeof opts.archived === "boolean") {
  filters.push(`d.archived = ${opts.archived ? "TRUE" : "FALSE"}`);
} else {
  filters.push("d.archived = FALSE");
}
```

**applyBatchAction 方法**（[documents.service.ts:610-660](file:///i:/ai-knowledge/apps/api/src/modules/documents/documents.service.ts#L610-L660)）：
- `assertDocumentAccess` 调用时，当 `action === "RESTORE"` 传 `includeDeleted: true`
- RESTORE handler 清除 `deletedAt: null` 和 `archived: false`（目前只清 `archived`）

### 3. 前端：`BatchActionBar.tsx` — 添加恢复按钮

- 新增 `onRestore?: () => void` 可选 prop
- 当 `onRestore` 存在时显示"恢复"按钮（使用 `RotateCcw` 图标）
- 当 `onRestore` 存在时（即在回收站中）隐藏"批量归档"按钮

### 4. 前端：`page.tsx` — 条件传递恢复处理器

- 当 `scope === "archive"` 时，传递 `onRestore={() => void runBatch("RESTORE")}`
- 当 `scope === "archive"` 时，不传递 `onArchive`（隐藏归档按钮）
- `runBatch` 的确认对话框增加 RESTORE 判断

### 5. 测试更新

**`document-access.service.spec.ts`**：
- 新增测试：`visibleDocumentWhereSql` 传 `includeDeleted: true` 时，SQL 不包含 `deleted_at IS NULL`

**`documents.service.spec.ts`**：
- 更新现有 list 测试：`visibleDocumentWhereSql` 被调用时第四个参数（includeDeleted）的断言
- 新增测试：archive scope 查询 `deleted_at IS NOT NULL`
- 更新 RESTORE 批量操作测试：验证 `deletedAt: null` 被清除

**`page.spec.ts`**：
- 更新 `resolveArchivedQuery` 相关断言（如果函数签名变化）

## 验证方式

1. `npx tsc --noEmit` — 类型检查
2. `npx vitest run` — 全部测试通过
3. `npx next lint` — 前端 lint
4. 手动验证：删除一个文档 → 进入回收站 → 看到已删除文档 → 选中文档 → 点击"恢复" → 文档回到正常列表
