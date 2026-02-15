#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <object-key-under-prefix>"
  echo "Example: $0 postgres/productivity_20260215T180000Z.dump.enc"
  exit 1
fi

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

object_key="$1"
mkdir -p backups
download_path="backups/restore_input.dump"

echo "Downloading backup from Cloudflare R2..."
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${object_key}" "${download_path}" \
  --endpoint-url "${BACKUP_S3_ENDPOINT}" \
  --region "${BACKUP_AWS_REGION:-auto}"

restore_path="${download_path}"
if [[ "${object_key}" == *.enc ]]; then
  if [[ -z "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]]; then
    echo "BACKUP_ENCRYPTION_PASSPHRASE is required for encrypted backups."
    exit 1
  fi
  decrypted_path="${download_path%.dump}.decrypted.dump"
  echo "Decrypting backup..."
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "${download_path}" \
    -out "${decrypted_path}" \
    -pass "pass:${BACKUP_ENCRYPTION_PASSPHRASE}"
  restore_path="${decrypted_path}"
fi

echo "Restoring into postgres container..."
cat "${restore_path}" | docker compose --env-file .env -f infra/docker-compose.local.yml exec -T postgres \
  pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists

echo "Restore complete."
