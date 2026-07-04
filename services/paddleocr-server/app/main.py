import logging
import os
import tempfile
import threading
from pathlib import Path
from typing import Any, Optional

# PaddlePaddle C++ inference engine cannot open paths with non-ASCII chars
# (e.g. Chinese username in home dir). Must set before importing paddleocr/paddlex.
if not os.environ.get("PADDLE_PDX_CACHE_HOME"):
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    _cache_dir = os.path.abspath(os.path.join(_script_dir, "..", ".paddlex_cache"))
    os.environ["PADDLE_PDX_CACHE_HOME"] = _cache_dir

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from paddleocr import PaddleOCR


logger = logging.getLogger("paddleocr-server")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

# 在导入 PaddlePaddle 推理引擎之前禁用 IR 优化（避免 AMD CPU 上 SIGILL 崩溃）
os.environ.setdefault("FLAGS_enable_ir_optim", "0")
os.environ.setdefault("FLAGS_enable_analysis_optim", "0")
os.environ.setdefault("GLOG_v", "1")

app = FastAPI(title="AI Knowledge PaddleOCR Server")

_ocr_lock = threading.Lock()
_ocr_instances: dict[str, PaddleOCR] = {}


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_ocr(lang: str) -> PaddleOCR:
    normalized_lang = (lang or os.getenv("PADDLEOCR_LANG", "ch")).strip() or "ch"
    with _ocr_lock:
        if normalized_lang in _ocr_instances:
            return _ocr_instances[normalized_lang]

        # AMD CPU 上 PaddlePaddle 的方向分类器推理会触发 SIGILL，强制关闭
        # PaddleOCR 3.x: use_angle_cls → use_textline_orientation
        # use_doc_orientation_classify / use_doc_unwarping 同样依赖分类器推理，一并关闭
        use_textline_orientation = _bool_env("PADDLEOCR_USE_ANGLE_CLS", False)
        logger.info(
            "Loading PaddleOCR model lang=%s use_textline_orientation=%s",
            normalized_lang,
            use_textline_orientation,
        )
        ocr = PaddleOCR(
            use_textline_orientation=use_textline_orientation,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            lang=normalized_lang,
        )
        _ocr_instances[normalized_lang] = ocr
        return ocr


def _as_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _collect_lines(value: Any) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []

    if value is None:
        return lines

    if hasattr(value, "json"):
        json_value = getattr(value, "json")
        if callable(json_value):
            try:
                value = json_value()
            except TypeError:
                value = json_value
        else:
            value = json_value

    if hasattr(value, "to_json"):
        try:
            value = value.to_json()
        except Exception:
            pass

    if isinstance(value, dict):
        payload = value.get("res", value)
        texts = payload.get("rec_texts") or payload.get("texts")
        scores = payload.get("rec_scores") or payload.get("scores") or []
        boxes = payload.get("dt_polys") or payload.get("boxes") or []
        if isinstance(texts, list):
            for index, text in enumerate(texts):
                if isinstance(text, str) and text.strip():
                    score = scores[index] if isinstance(scores, list) and index < len(scores) else None
                    box = boxes[index] if isinstance(boxes, list) and index < len(boxes) else None
                    lines.append({"text": text.strip(), "score": _as_float(score), "box": box})

        for key in ("data", "result", "results", "lines", "items", "pages"):
            lines.extend(_collect_lines(payload.get(key)))
        return lines

    if isinstance(value, (tuple, list)):
        if len(value) >= 2 and isinstance(value[0], str):
            text = value[0].strip()
            if text:
                lines.append({"text": text, "score": _as_float(value[1]), "box": None})
                return lines

        if (
            len(value) >= 2
            and isinstance(value[1], (tuple, list))
            and len(value[1]) >= 1
            and isinstance(value[1][0], str)
        ):
            text = value[1][0].strip()
            if text:
                score = value[1][1] if len(value[1]) >= 2 else None
                lines.append({"text": text, "score": _as_float(score), "box": value[0]})
                return lines

        for item in value:
            lines.extend(_collect_lines(item))

    return lines


def _run_ocr(image_path: str, lang: str) -> dict[str, Any]:
    ocr = _get_ocr(lang)
    # PaddleOCR 3.x: predict() 返回 Result 对象列表（迭代器）
    # 每个 Result 有 .json 方法，返回 {'res': {'rec_texts': [...], 'rec_scores': [...], 'dt_polys': [...]}}
    # 现有 _collect_lines() 已兼容此格式
    result = ocr.predict(input=image_path)

    lines = _collect_lines(result)
    text = "\n".join(line["text"] for line in lines if line.get("text")).strip()
    return {"code": 0, "text": text, "lines": lines}


def _suffix_for_upload(upload: UploadFile) -> str:
    suffix = Path(upload.filename or "").suffix.lower()
    return suffix if suffix else ".png"


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ocr")
@app.post("/recognize")
async def recognize(
    image: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    lang: str = Form("ch"),
) -> dict[str, Any]:
    upload = image or file
    if upload is None:
        raise HTTPException(status_code=400, detail="Missing multipart file field: image or file")

    content = await upload.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    tmp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=_suffix_for_upload(upload)) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        return await run_in_threadpool(_run_ocr, tmp_path, lang)
    except Exception as exc:
        logger.exception("PaddleOCR failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
