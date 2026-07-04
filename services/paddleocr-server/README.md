# PaddleOCR Server

Lightweight HTTP wrapper for PaddleOCR 3.x, provides `/health` and `/ocr` endpoints on port 10096.

## 本地安装（Windows）

### 前置要求

- Python 3.11（通过 `py -3.11` 可用）
- NVIDIA GPU + 驱动（RTX 3070 驱动 ≥ 550.54.14 即可）

### 启动

```powershell
# 在项目根目录执行
.\services\paddleocr-server\start.ps1
```

脚本会自动：
1. 用 Python 3.11 创建 `.venv` 虚拟环境
2. 安装 `paddlepaddle-gpu==3.2.2`（CUDA 12.6 源，失败回退 CUDA 11.8）
3. 安装 `paddleocr>=3.3.0` + FastAPI
4. 检查模型是否已下载（检测 `inference.pdiparams` 文件），缺失则自动下载 PP-OCRv6_medium 模型（~133MB，1-2 分钟）
5. 设置环境变量（AMD CPU 兼容性、GPU 推理、ASCII 缓存路径）
6. 启动 uvicorn（端口 10096）

首次运行时第 4 步会下载模型；后续启动跳过下载直接启动服务（约 3 秒）。

### 验证

```powershell
curl http://localhost:10096/health
# {"status":"ok"}
```

## API

```bash
curl -F "image=@sample.png" -F "lang=ch" http://localhost:10096/ocr
```

Response:

```json
{
  "code": 0,
  "text": "recognized text",
  "lines": [
    { "text": "recognized text", "score": 0.99, "box": null }
  ]
}
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PADDLEOCR_LANG` | `ch` | 识别语言 |
| `PADDLEOCR_USE_ANGLE_CLS` | `false` | 文本行方向分类（AMD CPU 必须为 false） |
| `PADDLE_PDX_CACHE_HOME` | `<脚本目录>/.paddlex_cache` | 模型缓存目录（必须为 ASCII 路径，避免中文用户名） |
| `FLAGS_enable_ir_optim` | `0` | 禁用 IR 优化（AMD CPU 兼容性） |
| `FLAGS_enable_analysis_optim` | `0` | 禁用分析优化（AMD CPU 兼容性） |
| `CUDA_VISIBLE_DEVICES` | `0` | GPU 设备编号 |
| `FLAGS_use_cuda` | `true` | 启用 GPU 推理 |

## PaddleOCR 3.x API 说明

- 构造函数: `PaddleOCR(use_textline_orientation=..., use_doc_orientation_classify=..., use_doc_unwarping=..., lang=...)`
- 推理: `ocr.predict(input=image_path)` 返回 Result 对象列表
- 默认模型: PP-OCRv6_medium（检测 59.4MB + 识别 73.3MB）
