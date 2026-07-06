#!/usr/bin/env bash
# MinIO bucket 初始化（容器启动后手动执行一次）
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

env_value() {
  local key="$1"
  if [ -f "$ROOT_DIR/.env" ]; then
    sed -n "s/^${key}=//p" "$ROOT_DIR/.env" | tail -n 1
  fi
}

if [ "${MINIO_ROOT_USER+x}" = "x" ]; then
  ROOT_USER="$MINIO_ROOT_USER"
else
  ROOT_USER="$(env_value MINIO_ROOT_USER)"
fi

if [ "${MINIO_ROOT_PASSWORD+x}" = "x" ]; then
  ROOT_PASSWORD="$MINIO_ROOT_PASSWORD"
else
  ROOT_PASSWORD="$(env_value MINIO_ROOT_PASSWORD)"
fi

if [ "${S3_BUCKET+x}" = "x" ]; then
  BUCKET="$S3_BUCKET"
else
  BUCKET="$(env_value S3_BUCKET)"
fi

if [ -z "$ROOT_USER" ] || [ -z "$ROOT_PASSWORD" ] || [ -z "$BUCKET" ]; then
  echo "MINIO_ROOT_USER, MINIO_ROOT_PASSWORD and S3_BUCKET are required" >&2
  exit 1
fi

echo "Creating bucket $BUCKET ..."
docker exec -i ai-knowledge-minio mc alias set local http://localhost:9000 "$ROOT_USER" "$ROOT_PASSWORD" >/dev/null
docker exec -i ai-knowledge-minio mc mb --ignore-existing "local/$BUCKET"
docker exec -i ai-knowledge-minio mc anonymous set download "local/$BUCKET"
echo "Bucket $BUCKET ready."
