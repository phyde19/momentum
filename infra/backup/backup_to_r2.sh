#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f ".env" ]]; then
  echo "Missing .env file. Copy .env.example to .env first."
  exit 1
fi

set -a
source .env
set +a

required_vars=(
  POSTGRES_DB
  POSTGRES_USER
  BACKUP_S3_BUCKET
  BACKUP_S3_PREFIX
  BACKUP_S3_ENDPOINT
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required env var: ${var_name}"
    exit 1
  fi
done

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p backups
raw_dump_path="backups/${POSTGRES_DB}_${timestamp}.dump"
final_path="${raw_dump_path}"
object_key="${BACKUP_S3_PREFIX}/${POSTGRES_DB}_${timestamp}.dump"

echo "Creating database dump..."
docker compose --env-file .env -f infra/docker-compose.local.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc > "${raw_dump_path}"

if [[ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]]; then
  encrypted_path="${raw_dump_path}.enc"
  echo "Encrypting dump..."
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "${raw_dump_path}" \
    -out "${encrypted_path}" \
    -pass "pass:${BACKUP_ENCRYPTION_PASSPHRASE}"
  rm -f "${raw_dump_path}"
  final_path="${encrypted_path}"
  object_key="${object_key}.enc"
fi

echo "Uploading to Cloudflare R2..."
aws s3 cp "${final_path}" "s3://${BACKUP_S3_BUCKET}/${object_key}" \
  --endpoint-url "${BACKUP_S3_ENDPOINT}" \
  --region "${BACKUP_AWS_REGION:-auto}"

echo "Backup complete: s3://${BACKUP_S3_BUCKET}/${object_key}"
