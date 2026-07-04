# PaddleOCR Local Service Startup Script
# Usage: run from project root: .\services\paddleocr-server\start.ps1
# First run creates venv and installs dependencies (10-20 minutes)
# Subsequent runs start uvicorn directly

$ErrorActionPreference = "Continue"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Definition
$VENV_DIR = Join-Path $SCRIPT_DIR ".venv"

function Step($n, $total, $title) {
    Write-Host ""
    Write-Host "[$n/$total] $title" -ForegroundColor Cyan
}
function Ok($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  !!  $msg" -ForegroundColor Yellow }
function Err($msg)  { Write-Host "  XX  $msg" -ForegroundColor Red }

# 1. Check Python 3.11
Step 1 5 "Check Python 3.11"
$pyVersion = & py -3.11 --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Err "Python 3.11 not available. Install from: https://www.python.org/downloads/release/python-3119/"
    exit 1
}
Ok "Python 3.11 available: $pyVersion"

# 2. Create/activate virtual environment
Step 2 5 "Virtual Environment"
if (-not (Test-Path "$VENV_DIR\Scripts\python.exe")) {
    Warn "venv does not exist, creating..."
    & py -3.11 -m venv $VENV_DIR
    if ($LASTEXITCODE -ne 0) {
        Err "venv creation failed"
        exit 1
    }
    Ok "venv created: $VENV_DIR"
} else {
    Ok "venv exists: $VENV_DIR"
}

$venvPython = "$VENV_DIR\Scripts\python.exe"
$venvPip = "$VENV_DIR\Scripts\pip.exe"

# 3. Install dependencies
Step 3 5 "Install Dependencies"
& $venvPython -m pip install --upgrade pip 2>&1 | Out-Null

# Helper: check if a pip package is installed
function IsPipInstalled($pkg) {
    $output = & $venvPip show $pkg 2>&1
    return $LASTEXITCODE -eq 0
}

# paddlepaddle-gpu must be installed from CUDA 12.6 source (wheel includes CUDA/cuDNN runtime)
if (IsPipInstalled "paddlepaddle-gpu") {
    Ok "paddlepaddle-gpu already installed"
} else {
    Warn "Installing paddlepaddle-gpu 3.2.2 (CUDA 12.6)..."
    & $venvPython -m pip install paddlepaddle-gpu==3.2.2 -i https://www.paddlepaddle.org.cn/packages/stable/cu126/ 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Warn "CUDA 12.6 source failed, trying CUDA 11.8..."
        & $venvPython -m pip install paddlepaddle-gpu==3.2.2 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/ 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Err "paddlepaddle-gpu installation failed"
            exit 1
        }
    }
    Ok "paddlepaddle-gpu installed"
}

# Install paddleocr
if (IsPipInstalled "paddleocr") {
    Ok "paddleocr already installed"
} else {
    Warn "Installing paddleocr..."
    & $venvPip install "paddleocr>=3.3.0" 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Err "paddleocr installation failed"
        exit 1
    }
    Ok "paddleocr installed"
}

# Install fastapi/uvicorn
if (IsPipInstalled "fastapi") {
    Ok "fastapi/uvicorn already installed"
} else {
    Warn "Installing fastapi/uvicorn..."
    & $venvPip install "fastapi==0.115.6" "uvicorn[standard]==0.32.1" "python-multipart==0.0.20" 2>&1 | Out-Host
    Ok "fastapi/uvicorn installed"
}

# 4. Check/download models
Step 4 5 "Check Models"

# Set cache env var early so Test-Path checks the right location
$env:PADDLE_PDX_CACHE_HOME = Join-Path $SCRIPT_DIR ".paddlex_cache"
$detParams = Join-Path $env:PADDLE_PDX_CACHE_HOME "official_models\PP-OCRv6_medium_det\inference.pdiparams"
$recParams = Join-Path $env:PADDLE_PDX_CACHE_HOME "official_models\PP-OCRv6_medium_rec\inference.pdiparams"

if ((Test-Path $detParams) -and (Test-Path $recParams)) {
    Ok "Models already downloaded"
} else {
    Warn "Downloading PaddleOCR models (PP-OCRv6_medium, ~133MB, 1-2 min)..."
    & $venvPython "$SCRIPT_DIR\check_models.py"
    if ($LASTEXITCODE -ne 0) {
        Err "Model download failed"
        exit 1
    }
    Ok "Models downloaded"
}

# 5. Set environment variables and start uvicorn
Step 5 5 "Start PaddleOCR Service"

# AMD CPU compatibility: must set before importing PaddlePaddle
$env:FLAGS_enable_ir_optim = "0"
$env:FLAGS_enable_analysis_optim = "0"
$env:GLOG_v = "1"

# GPU inference config
$env:CUDA_VISIBLE_DEVICES = "0"
$env:FLAGS_use_cuda = "true"

# PaddleOCR config
if (-not $env:PADDLEOCR_LANG) { $env:PADDLEOCR_LANG = "ch" }
# AMD CPU: angle classifier triggers SIGILL, must disable
$env:PADDLEOCR_USE_ANGLE_CLS = "false"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  PaddleOCR Service Starting..." -ForegroundColor Green
Write-Host "  Port: 10096" -ForegroundColor Green
Write-Host "  Health: http://localhost:10096/health" -ForegroundColor Green
Write-Host "  OCR: http://localhost:10096/ocr" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Models are pre-downloaded and ready" -ForegroundColor Green
Write-Host ""

# uvicorn --app-dir adds the dir to sys.path; must point to parent of app/ package
& $venvPython -m uvicorn app.main:app --host 0.0.0.0 --port 10096 --app-dir $SCRIPT_DIR
