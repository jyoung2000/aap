# JobPilot developer shortcuts
.PHONY: up down build logs seed test backend-test frontend extension fmt

up:            ## Build & start the full stack (app on :1456)
	docker compose up --build -d && docker compose ps

down:          ## Stop the stack
	docker compose down

build:         ## Build images (frontend + extension + backend)
	docker compose build

logs:          ## Tail app + worker logs
	docker compose logs -f app worker

seed:          ## Seed demo data into the running stack
	docker compose exec app python -m app.seed

test: backend-test ## Run all tests

backend-test:  ## Run backend test suite (SQLite, no external services)
	cd backend && DATABASE_URL=sqlite:///./test.db DATA_DIR=./data SERVER_EXECUTOR_MODE=simulate pytest -q

frontend:      ## Build the frontend into backend/app/static
	cd frontend && npm install && npm run build

extension:     ## Build Chrome + Firefox extension bundles
	cd extension && npm install && npm run bundle

help:          ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-14s %s\n", $$1, $$2}'
