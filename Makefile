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
	@echo "Rode em dois terminais separados:"
	@echo "  make dev-web"
	@echo "  make dev-gateway"

dev-web:
	npm run dev:web

dev-gateway:
	npm run dev:gateway

lint:
	npm run lint

test:
	npm run test

build:
	npm run build
