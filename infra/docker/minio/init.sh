#!/usr/bin/env bash
# MinIO bucket 初始化（容器启动后手动执行一次）
set -euo pipefail

ENDPOINT=${MINIO_ENDPOINT:-localhost:9000}
ROOT_USER=${MINIO_ROOT_USER:-minio_admin}
ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-minio_password}
BUCKET=${S3_BUCKET:-ai-knowledge-docs}

echo "Creating bucket $BUCKET at $ENDPOINT ..."
docker exec -i ai-knowledge-minio mc alias set local http://localhost:9000 "$ROOT_USER" "$ROOT_PASSWORD" >/dev/null
docker exec -i ai-knowledge-minio mc mb --ignore-existing "local/$BUCKET"
docker exec -i ai-knowledge-minio mc anonymous set download "local/$BUCKET"
echo "Bucket $BUCKET ready."