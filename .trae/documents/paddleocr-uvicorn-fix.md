# PaddleOCR 本地服务启动修复计划

## 摘要

修复 `start.ps1` 中 uvicorn 启动失败的问题（`ModuleNotFoundError: No module named 'app'`），然后验证本地 PaddleOCR 服务的 `/health` 和 `/ocr` 接口可用。

## 当前状态分析

### 已完成的工作
- `services/paddleocr-server/.venv` 虚拟环境已创建（Python 3.11.9）
- `paddlepaddle-gpu==3.2.2`（CUDA 12.6）已安装
- `paddleocr>=3.3.0`（实际 3.7.0）已安装
- `fastapi` / `uvicorn` 已安装
- [main.py](file:///i:/ai-knowledge/services/paddleocr-server/app/main.py) 已迁移到 PaddleOCR 3.x API（`use_textline_orientation` + `ocr.predict()`）
- Docker 相关配置已注释，`.env.production` 已指向 `http://localhost:10096/ocr`
- [README.md](file:///i:/ai-knowledge/services/paddleocr-server/README.md) 已更新

### 当前 Bug

[start.ps1](file:///i:/ai-knowledge/services/paddleocr-server/start.ps1) 第 121-122 行：

```powershell
$appDir = Join-Path $SCRIPT_DIR "app"
& $venvPython -m uvicorn app.main:app --host 0.0.0.0 --port 10096 --app-dir $appDir
```

其中 `$SCRIPT_DIR = I:\ai-knowledge\services\paddleocr-server`，`$appDir = I:\ai-knowledge\services\paddleocr-server\app`。

**根因**：uvicorn 的 `--app-dir` 参数将该目录添加到 `sys.path`。当 `--app-dir` 指向 `app/` 目录本身时，Python 在该目录内查找名为 `app` 的包，即查找 `app/app/main.py`，此路径不存在。

**正确做法**：`--app-dir` 应指向包含 `app/` 包的父目录（即 `$SCRIPT_DIR`），这样 Python 才能找到 `app/main.py`。

## 提议的修改

### 1. 修复 [start.ps1](file:///i:/ai-knowledge/services/paddleocr-server/start.ps1)

将第 121-122 行：

```powershell
$appDir = Join-Path $SCRIPT_DIR "app"
& $venvPython -m uvicorn app.main:app --host 0.0.0.0 --port 10096 --app-dir $appDir
```

改为：

```powershell
# uvicorn 的 --app-dir 会将该目录加入 sys.path，必须指向 app/ 包的父目录
& $venvPython -m uvicorn app.main:app --host 0.0.0.0 --port 10096 --app-dir $SCRIPT_DIR
```

理由：模块路径 `app.main:app` 要求 `app` 是一个可被导入的包，因此 `--app-dir` 必须指向包含 `app/` 目录的父目录 `$SCRIPT_DIR`，而不是 `app/` 本身。

### 2. 验证服务

修改后执行：

1. **确保端口空闲**：检查 10096 端口是否被占用，若被占用则终止占用进程。
2. **后台启动服务**：通过 `start.ps1` 启动 uvicorn（首次启动不发起 OCR 请求，避免阻塞）。
3. **测试健康端点**：
   ```powershell
   curl http://localhost:10096/health
   ```
   预期返回 `{"status":"ok"}`。
4. **测试 OCR 端点**：使用已有的 [test-ocr-curl.ps1](file:///i:/ai-knowledge/test-ocr-curl.ps1)，首次会下载 PP-OCRv6_medium 模型（约 133MB，3-5 分钟）。
   ```powershell
   .\test-ocr-curl.ps1
   ```
   预期返回包含 `"text":"Hello GPU OCR 2026"` 的 JSON。
5. **确认 NestJS 集成**：检查 `.env.production` 中 `PADDLEOCR_HTTP_URL=http://localhost:10096/ocr` 已生效（之前会话已修改）。

## 假设与决策

- **不修改 `main.py`**：代码已正确迁移到 PaddleOCR 3.x API，无需改动。
- **不添加 `__init__.py`**：Python 3.11 支持命名空间包，且 `--app-dir` 修正后 `app.main` 可正常导入；添加 `__init__.py` 是不必要的改动。
- **不修改 `requirements.txt`**：依赖已正确安装。
- **首次启动仅验证 `/health`**：OCR 请求会触发模型下载（3-5 分钟），先验证服务能启动和响应，再单独发起 OCR 测试。
- **后台启动 uvicorn**：使用 `run_in_background=true` 让 Shell 在后台运行 uvicorn，否则会阻塞整个会话。

## 验证步骤

1. 运行 `start.ps1` 后台启动服务
2. `curl http://localhost:10096/health` 返回 `{"status":"ok"}`
3. （可选）运行 `test-ocr-curl.ps1` 验证 OCR 端到端功能（需等待模型下载）
4. 确认 NestJS `OcrService` 的 `PADDLEOCR_HTTP_URL` 指向 `http://localhost:10096/ocr`
