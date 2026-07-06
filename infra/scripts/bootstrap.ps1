# PowerShell 版本的一键启动脚本
# 用法：在项目根目录执行 .\infra\scripts\bootstrap.ps1

$ErrorActionPreference = "Stop"
$ROOT_DIR = (Resolve-Path "$PSScriptRoot/../..").Path
Set-Location $ROOT_DIR

function Step($n, $total, $title) {
    Write-Host ""
    Write-Host "[$n/$total] $title" -ForegroundColor Cyan
}
function Ok($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  !!  $msg" -ForegroundColor Yellow }
function Err($msg)  { Write-Host "  XX  $msg" -ForegroundColor Red }

# 检测 Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Err "未检测到 Docker，请先安装 Docker Desktop: https://www.docker.com/products/docker-desktop/"
    exit 1
}

# 1. 检查 .env
Step 1 5 "检查 .env"
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Warn ".env 不存在，已从 .env.example 复制，请稍后编辑 DASHSCOPE_API_KEY"
} else {
    Ok ".env 已存在"
}

# 2. 启动 Docker 服务
Step 2 5 "启动 Docker (Postgres / Redis / MinIO / Neo4j)"
docker compose up -d
Ok "docker compose up -d 已执行"

# 3. 等待依赖就绪
Step 3 5 "等待依赖就绪"

# Postgres
Write-Host "  - 等待 Postgres ..."
$pgReady = $false
for ($i = 1; $i -le 30; $i++) {
    $out = docker exec ai-knowledge-postgres pg_isready -U "ai_knowledge" 2>&1
    if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
    Start-Sleep -Seconds 1
}
if ($pgReady) { Ok "Postgres 就绪" } else { Warn "Postgres 启动超时（可稍后重试）" }

# Redis
Write-Host "  - 等待 Redis ..."
$redisReady = $false
for ($i = 1; $i -le 20; $i++) {
    $out = docker exec ai-knowledge-redis redis-cli ping 2>&1
    if ($LASTEXITCODE -eq 0 -and $out -match "PONG") { $redisReady = $true; break }
    Start-Sleep -Seconds 1
}
if ($redisReady) { Ok "Redis 就绪" } else { Warn "Redis 未就绪" }

# MinIO
Write-Host "  - 等待 MinIO ..."
$minioReady = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:9000/minio/health/live" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { $minioReady = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}
if ($minioReady) { Ok "MinIO 就绪" } else { Warn "MinIO 未就绪" }

# Neo4j
Write-Host "  - 等待 Neo4j ..."
$neoReady = $false
for ($i = 1; $i -le 60; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:7474" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { $neoReady = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}
if ($neoReady) { Ok "Neo4j 就绪" } else { Warn "Neo4j 仍在启动（容器已起，可能需要更长时间）" }

# 4. 安装依赖
Step 4 5 "安装依赖"
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Warn "未检测到 pnpm，尝试通过 npm 安装..."
    npm i -g pnpm@9
}
pnpm install
Ok "pnpm install 完成"

# 5. Prisma & 启动提示
Step 5 5 "初始化 Prisma"
try {
    pnpm --filter @ai-knowledge/api prisma:generate 2>&1 | Out-Host
    Ok "prisma generate 完成"
} catch {
    Warn "prisma generate 失败，请稍后手动执行"
}

try {
    pnpm --filter @ai-knowledge/api prisma:migrate:deploy 2>&1 | Out-Host
    Ok "prisma migrate deploy 完成"
} catch {
    Warn "prisma migrate deploy 失败，请检查 Postgres 是否就绪后重试"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  启动完成！接下来执行：" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  pnpm seed           # 写入演示数据 (admin@demo.com / demo123)"
Write-Host "  pnpm dev            # 启动 API (9999) + Web (8888)"
Write-Host ""
Write-Host "  打开 http://localhost:8888 体验"
Write-Host "  MinIO 控制台: http://localhost:9001 (minio_admin / minio_password)"
Write-Host "  Neo4j 浏览器:  http://localhost:7474 (neo4j / neo4j_dev_password)"
