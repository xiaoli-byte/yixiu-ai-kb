"""Check if PaddleOCR models are downloaded; download if missing.

Run this before starting uvicorn to ensure models are cached locally:
    python check_models.py

Exits 0 if models are ready, 1 on failure.
"""
import os
import sys
import tempfile

# Set env vars BEFORE importing paddleocr/paddlex (same as app/main.py)
if not os.environ.get("PADDLE_PDX_CACHE_HOME"):
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    _cache_dir = os.path.abspath(os.path.join(_script_dir, ".paddlex_cache"))
    os.environ["PADDLE_PDX_CACHE_HOME"] = _cache_dir

os.environ.setdefault("FLAGS_enable_ir_optim", "0")
os.environ.setdefault("FLAGS_enable_analysis_optim", "0")
os.environ.setdefault("GLOG_v", "1")
os.environ.setdefault("PADDLEOCR_USE_ANGLE_CLS", "false")

_MODELS = ("PP-OCRv6_medium_det", "PP-OCRv6_medium_rec")


def models_exist() -> bool:
    cache_dir = os.environ["PADDLE_PDX_CACHE_HOME"]
    models_dir = os.path.join(cache_dir, "official_models")
    return all(
        os.path.isfile(os.path.join(models_dir, name, "inference.pdiparams"))
        for name in _MODELS
    )


def download_models() -> None:
    from PIL import Image, ImageDraw
    from paddleocr import PaddleOCR

    # Generate a minimal test image with some text-like strokes
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        img = Image.new("RGB", (200, 60), color="white")
        draw = ImageDraw.Draw(img)
        draw.text((10, 20), "OCR test", fill="black")
        img.save(tmp_path)

        ocr = PaddleOCR(
            use_textline_orientation=False,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            lang=os.environ.get("PADDLEOCR_LANG", "ch"),
        )
        ocr.predict(input=tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


if __name__ == "__main__":
    if models_exist():
        print("OK: Models already downloaded")
        sys.exit(0)

    print("Downloading PaddleOCR models (PP-OCRv6_medium, ~133MB)...")
    print("This may take 1-2 minutes on first run.")
    try:
        download_models()
    except Exception as exc:
        print(f"ERROR: Model download failed: {exc}", file=sys.stderr)
        sys.exit(1)

    if models_exist():
        print("OK: Models downloaded successfully")
        sys.exit(0)

    print("ERROR: Models still missing after download attempt", file=sys.stderr)
    sys.exit(1)
