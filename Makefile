.PHONY: local-up local-down local-logs local-ps deploy-up deploy-down

local-up:
	docker compose --env-file .env -f infra/docker-compose.local.yml up -d --build

local-down:
	docker compose --env-file .env -f infra/docker-compose.local.yml down

local-logs:
	docker compose --env-file .env -f infra/docker-compose.local.yml logs -f

local-ps:
	docker compose --env-file .env -f infra/docker-compose.local.yml ps

deploy-up:
	docker compose --env-file .env -f infra/docker-compose.deploy.yml up -d --build

deploy-down:
	docker compose --env-file .env -f infra/docker-compose.deploy.yml down
