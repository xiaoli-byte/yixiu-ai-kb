# PaddleOCR 从 Docker 迁移到本地 Windows 安装

## Context

当前项目的 PaddleOCR 以 Docker 容器方式运行,但容器内模型下载困难、调试不便。用户希望改为本地安装,直接使用 RTX 3070 GPU 推理。s

参考文档：<https://www.paddleocr.ai/latest/version3.x/inference_deployment/local_inference/high_performance_inference.html>

关键约束:

- Python 3.13(默认)不被 PaddlePaddle 支持,需用 Python 3.11.9(`py -3.11`)
- AMD Ryzen 3700X 有 SIMD 指令兼容问题,必须禁用 IR 优化和方向分类器
- RTX 3070 (8GB VRAM, 驱动 595.97) 支持 CUDA 12.6
- 保持 FastAPI HTTP 包装层不变,NestJS 侧 `ocr.service.ts` 无需改动

模型选择: **PP-OCRv6\_medium**(PaddleOCR 3.x 默认模型,检测 59.4MB + 识别 73.3MB,精度 83.2%,RTX 3070 完全够用)

## 实施步骤

### 1. 更新 `services/paddleocr-server/requirements.txt`

```
fastapi==0.115.6
uvicorn[standard]==0.32.1
python-multipart==0.0.20
paddlepaddle-gpu==3.2.2
paddleocr>=3.3.0
```

说明: 删除 `numpy<2.0`(PaddlePaddle 3.x 原生支持 numpy 2.x);paddlepaddle-gpu 实际安装需通过 start.ps1 指定 cu126 源。

### 2. 更新 `services/paddleocr-server/app/main.py`

**`_get_ocr()`** **函数**(第 34-48 行)— 适配 PaddleOCR 3.x API:

- `use_angle_cls` → `use_textline_orientation`
- 新增 `use_doc_orientation_classify=False`、`use_doc_unwarping=False`(3.x 新增的可选模块,同样依赖分类器推理)
- 删除 `show_log=False`(3.x 不再支持)和 `try/except TypeError` 回退

**`_run_ocr()`** **函数**(第 121-132 行)— 适配 predict() API:

- 删除 `hasattr(ocr, "ocr")` 分支,直接使用 `ocr.predict(input=image_path)`
- 删除 `cls=` 参数(3.x 由构造函数控制)
- `predict()` 返回 Result 对象列表,现有 `_collect_lines()` 已兼容(处理 `.json()` 方法、`res` key、`rec_texts` 等字段)

**不变的部分**: `_collect_lines()`、`/health`、`/ocr` 端点、环境变量设置(`FLAGS_enable_ir_optim=0` 等)

### 3. 新建 `services/paddleocr-server/start.ps1`

PowerShell 启动脚本,职责:

1. 检查 `py -3.11` 可用性
2. 在 `services/paddleocr-server/.venv` 创建虚拟环境(幂等,已存在则跳过)
3. 安装依赖:先装 `paddlepaddle-gpu==3.2.2`(cu126 源,失败回退 cu118),再装 `paddleocr` + fastapi 等
4. 设置环境变量:`FLAGS_enable_ir_optim=0`、`FLAGS_enable_analysis_optim=0`、`CUDA_VISIBLE_DEVICES=0`、`PADDLEOCR_USE_ANGLE_CLS=false`
5. 启动 `uvicorn app.main:app --host 0.0.0.0 --port 10096 --app-dir app`

### 4. 注释 Docker 配置

**`docker-compose.yml`**(第 114-144 行): 注释 paddleocr 服务块和 `paddleocr_models` 卷,添加说明注释指向 `start.ps1`

**`docker-compose.prod.yml`**:

- 注释 paddleocr 服务块(第 119-140 行)和 `paddleocr_models` 卷(第 229 行)
- api 服务的 `PADDLEOCR_HTTP_URL` 改为 `http://host.docker.internal:10096/ocr`(第 171 行)
- api 服务的 `depends_on` 移除 paddleocr 条件(第 187-188 行)

### 5. 更新 `.env.production`

- 第 59 行: `PADDLEOCR_HTTP_URL=http://paddleocr:10096/ocr` → `http://localhost:10096/ocr`
- 第 65 行: `PADDLEOCR_USE_ANGLE_CLS=true` → `false`(AMD CPU 兼容性)

### 6. 更新文档

- `services/paddleocr-server/README.md`: 添加本地安装章节,保留 Docker 方式作为备选
- `README.md`(第 36、40-47、78 行): 说明 PaddleOCR 需通过 `start.ps1` 启动
- `docs/USAGE.md`(第 374-385 行): FAQ 中 `docker compose up -d paddleocr` 改为 `start.ps1`

## 不需要修改的文件

- `apps/api/src/modules/documents/ocr.service.ts` — 通过环境变量读取 URL,HTTP 接口不变
- `apps/api/src/modules/queue/document.processor.ts` — 调用 OcrService,不直接引用 PaddleOCR
- `.env`、`.env.example` — 已使用 localhost:10096
- `test-ocr.ps1`、`test-ocr-curl.ps1` — 端口不变

## 验证

1. **依赖验证**: `.venv\Scripts\python.exe -c "import paddle; print(paddle.__version__); paddle.utils.run_check()"` — 确认 GPU 可用
2. **服务启动**: `.\services\paddleocr-server\start.ps1` — 首次运行创建 venv + 安装依赖(10-20 分钟)
3. **健康检查**: `curl http://localhost:10096/health` — 期望 `{"status":"ok"}`
4. **OCR 测试**: `.\test-ocr-curl.ps1` — 首次请求下载模型(3-5 分钟),期望返回识别文本
5. **端到端**: 启动 `docker compose up -d`(不含 paddleocr)+ `start.ps1` + `pnpm dev`,通过 Web 上传图片验证

