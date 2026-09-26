.PHONY: install dev dev-native lint test build docker-up docker-down

install:
	npm install

# --- variante com Docker ---
dev:
	docker compose up --build

docker-down:
	docker compose down

# --- variante sem Docker (roda cada serviço nativamente) ---
dev-native:
	@echo "Rode em três terminais separados:"
	@echo "  make dev-web"
	@echo "  make dev-gateway"
	@echo "  make dev-analysis"

dev-web:
	npm run dev:web

dev-gateway:
	npm run dev:gateway

dev-analysis:
	cd services/analysis-service && . .venv/bin/activate && uvicorn analysis_service.api.main:app --reload --port 8001

lint:
	npm run lint

test:
	npm run test

build:
	npm run build
