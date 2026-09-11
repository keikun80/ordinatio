.PHONY: help setup test lint build run-backend run-frontend up down verify-phase0 verify-phase1

help:
	@echo "AI Orchestrator (aiorche) Build & Management Commands"
	@echo ""
	@echo "  make setup          - Initialize Python backend (uv) and Frontend dependencies"
	@echo "  make test           - Run backend pytest and frontend build verification"
	@echo "  make run-backend    - Run FastAPI backend locally (http://localhost:8000)"
	@echo "  make run-frontend   - Run React Vite frontend locally (http://localhost:5173)"
	@echo "  make up             - Run local Docker Compose air-gapped stack"
	@echo "  make down           - Stop local Docker Compose stack"
	@echo "  make verify-phase0  - Run Phase 0 Definition-of-Done verification script"
	@echo "  make verify-phase1  - Run Phase 1 Definition-of-Done verification script"

setup:
	@echo "==> Setting up backend dependencies..."
	@cd backend && uv sync
	@echo "==> Setting up frontend dependencies..."
	@cd frontend && npm install

test:
	@echo "==> Running backend unit tests..."
	@cd backend && uv run pytest -v
	@echo "==> Running frontend build validation..."
	@cd frontend && npm run build

run-backend:
	@cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

run-frontend:
	@cd frontend && npm run dev

up:
	@docker compose up -d

down:
	@docker compose down

verify-phase0:
	@bash scripts/verify-phase0.sh

verify-phase1:
	@bash scripts/verify-phase1.sh

verify-phase2:
	@bash scripts/verify-phase2.sh

# Kubernetes (Pod 배포 및 관리)
k8s-deploy:
	@echo "==> Deploying Phase 0 & Phase 1 Pods to Kubernetes (aiorche namespace)..."
	@kubectl apply -k deploy/k8s/
	@kubectl rollout status deployment/postgres -n aiorche --timeout=60s
	@kubectl rollout status deployment/redis -n aiorche --timeout=60s
	@kubectl rollout status deployment/envoy -n aiorche --timeout=60s
	@kubectl rollout status deployment/backend -n aiorche --timeout=60s
	@kubectl rollout status deployment/frontend -n aiorche --timeout=60s

k8s-status:
	@kubectl get pods,svc,configmap -n aiorche -o wide

k8s-delete:
	@kubectl delete -k deploy/k8s/
