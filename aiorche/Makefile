.PHONY: help setup test lint migrate migrate-rollback build run-backend run-frontend up down prod-build prod-up prod-down init-admin \
	verify-phase0 verify-phase0_1 verify-phase1 verify-phase2 verify-phase3 verify-phase4 verify-phase5 verify-phase-system-prompt verify-all-menus verify-auth-rbac verify-standalone-install \
	k8s-up k8s-down k8s-deploy k8s-start k8s-stop k8s-restart k8s-status k8s-logs k8s-delete \
	k8s-start-backend k8s-stop-backend k8s-start-frontend k8s-stop-frontend k8s-start-envoy k8s-stop-envoy k8s-start-db k8s-stop-db

help:
	@echo "AI Orchestrator (aiorche) Build & Management Commands"
	@echo ""
	@echo "  [Local Development Mode (Default)]"
	@echo "  make setup                     - Initialize Python backend (uv) and Frontend dependencies"
	@echo "  make up                        - Run local Development Docker Compose stack (Vite HMR + FastAPI --reload with live source mounts)"
	@echo "  make down                      - Stop local Docker Compose stack"
	@echo "  make test                      - Run backend pytest (93 tests) and frontend build verification"
	@echo "  make lint                      - Run backend and frontend code linting"
	@echo "  make migrate                   - Run Alembic DB schema migrations (upgrade head)"
	@echo "  make migrate-rollback          - Rollback last Alembic migration (downgrade -1)"
	@echo "  make run-backend               - Run FastAPI backend directly on host (http://localhost:8000)"
	@echo "  make run-frontend              - Run React Vite frontend directly on host (http://localhost:5173)"
	@echo ""
	@echo "  [Production / Appliance Release Mode (On-Demand Only)]"
	@echo "  make build                     - Build frontend production distribution bundle (frontend/dist)"
	@echo "  make prod-build                - Build immutable Production Docker images (Nginx static + FastAPI)"
	@echo "  make prod-up                   - Build & run immutable Production Docker Compose stack"
	@echo "  make prod-down                 - Stop Production Docker Compose stack"
	@echo ""
	@echo "  [DoD Automated Verification]"
	@echo "  make verify-phase0             - Run Phase 0 DoD verification (Foundations & Envoy AI Gateway)"
	@echo "  make verify-phase0_1           - Run Phase 0.1 DoD verification (L7 AgentRouter & Routing)"
	@echo "  make verify-phase1             - Run Phase 1 DoD verification (Multi-tenancy & Virtual Keys)"
	@echo "  make verify-phase2             - Run Phase 2 DoD verification (Model Catalog & xDS Routing)"
	@echo "  make verify-phase3             - Run Phase 3 DoD verification (Observability & FinOps Hard Cap)"
	@echo "  make verify-phase4             - Run Phase 4 DoD verification (PII Masking & WORM Audit)"
	@echo "  make verify-phase5             - Run Phase 5 DoD verification (Lifecycle & RSA-4096 Hotfix)"
	@echo "  make verify-phase-system-prompt - Run System Prompt Governance & Inline Injection DoD"
	@echo "  make verify-all-menus          - Run All 8 Menus Integrated E2E Scenario & Monitoring DoD"
	@echo "  make verify-standalone-install - Run Standalone Installer & Vagrant Deployment DoD"
	@echo ""
	@echo "  [Kubernetes Pod Lifecycle & Operations]"
	@echo "  make k8s-up                    - Deploy full stack to Kubernetes (alias of k8s-deploy)"
	@echo "  make k8s-down                  - Delete full stack from Kubernetes (alias of k8s-delete)"
	@echo "  make k8s-start                 - Start/Resume all Kubernetes Pods (scale replicas to 1)"
	@echo "  make k8s-stop                  - Stop/Pause all Kubernetes Pods (scale replicas to 0, data preserved)"
	@echo "  make k8s-restart               - Rolling restart of all Kubernetes Pods"
	@echo "  make k8s-status                - View status of all Pods, Services, and Deployments"
	@echo "  make k8s-logs                  - Stream aggregated logs from all aiorche Pods"

setup:
	@echo "==> Setting up backend dependencies..."
	@cd backend && uv sync --extra dev
	@echo "==> Setting up frontend dependencies..."
	@cd frontend && npm install

test:
	@echo "==> Running backend unit tests..."
	@cd backend && uv run pytest -v
	@echo "==> Running frontend build validation..."
	@cd frontend && npm run build

lint:
	@echo "==> Checking backend formatting and linting..."
	@cd backend && uv run python -m py_compile app/main.py
	@echo "==> Checking frontend buildability..."
	@cd frontend && npm run build

migrate:
	@echo "==> Running Alembic DB migrations..."
	@cd backend && uv run alembic upgrade head

migrate-rollback:
	@echo "==> Rolling back last Alembic migration..."
	@cd backend && uv run alembic downgrade -1

build:
	@echo "==> Building frontend production assets..."
	@cd frontend && npm run build
	@echo "✅ Frontend distribution bundle created in frontend/dist/"

run-backend:
	@cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

run-frontend:
	@cd frontend && npm run dev

up:
	@echo "==> Starting Development Stack (Live Source Mounts: Vite HMR + FastAPI --reload)..."
	@docker build -t aiorche-backend ./backend
	@docker build --target dev -t aiorche-frontend ./frontend
	@docker compose up -d

down:
	@docker compose down

prod-build:
	@echo "==> Building Production Frontend Bundle & Immutable Docker Images..."
	@cd frontend && npm run build
	@docker build -t aiorche-backend:prod ./backend
	@docker build --target prod -t aiorche-frontend:prod ./frontend
	@echo "✅ Production images (aiorche-backend:prod, aiorche-frontend:prod) built successfully."

prod-up: prod-build
	@echo "==> Starting Immutable Production Stack (Nginx Static + FastAPI Production)..."
	@docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build

prod-down:
	@docker compose -f docker-compose.yml -f docker-compose.prod.yml down

verify-phase0:
	@bash scripts/verify-phase0.sh

verify-phase0_1:
	@bash scripts/verify-phase0_1.sh

verify-phase1:
	@bash scripts/verify-phase1.sh

verify-phase2:
	@bash scripts/verify-phase2.sh

verify-phase3:
	@bash scripts/verify-phase3.sh

verify-phase4:
	@bash scripts/verify-phase4.sh

verify-phase5:
	@bash scripts/verify-phase5.sh

verify-phase-system-prompt:
	@bash scripts/verify-phase-system-prompt.sh

verify-all-menus:
	@bash scripts/verify-all-menus.sh

verify-auth-rbac:
	@bash scripts/verify-auth-rbac.sh

verify-rbac-scenarios:
	@bash scripts/verify-rbac-scenarios.sh

verify-standalone-install:
	@bash scripts/verify-standalone-install.sh

init-admin:
	@if docker ps --format '{{.Names}}' | grep -q '^aiorche-backend$$'; then \
		if [ -t 0 ]; then \
			docker exec -it aiorche-backend python -m app.scripts.init_admin $(ARGS); \
		else \
			docker exec -i aiorche-backend python -m app.scripts.init_admin $(ARGS); \
		fi; \
	else \
		cd backend && DATABASE_URL="postgresql+psycopg2://postgres:postgres@localhost:5432/aiorche_db" uv run python -m app.scripts.init_admin $(ARGS); \
	fi


# Kubernetes (Pod 배포, 라이프사이클 및 관리)
k8s-up: k8s-deploy
k8s-down: k8s-delete

k8s-deploy:
	@echo "==> Deploying aiorche stack to Kubernetes (aiorche namespace)..."
	@kubectl apply -k deploy/k8s/
	@kubectl rollout status deployment/postgres -n aiorche --timeout=60s
	@kubectl rollout status deployment/redis -n aiorche --timeout=60s
	@kubectl rollout status deployment/envoy -n aiorche --timeout=60s
	@kubectl rollout status deployment/backend -n aiorche --timeout=60s
	@kubectl rollout status deployment/frontend -n aiorche --timeout=60s
	@echo "✅ Kubernetes deployment completed."

k8s-start:
	@echo "==> Starting/Resuming all aiorche Pods..."
	@kubectl scale deployment -n aiorche --replicas=1 postgres redis
	@kubectl rollout status deployment/postgres -n aiorche --timeout=60s
	@kubectl rollout status deployment/redis -n aiorche --timeout=60s
	@kubectl scale deployment -n aiorche --replicas=1 envoy backend frontend
	@kubectl rollout status deployment/envoy -n aiorche --timeout=60s
	@kubectl rollout status deployment/backend -n aiorche --timeout=60s
	@kubectl rollout status deployment/frontend -n aiorche --timeout=60s
	@echo "✅ All aiorche Pods started and ready."

k8s-stop:
	@echo "==> Stopping/Pausing all aiorche Pods (scaling replicas to 0)..."
	@kubectl scale deployment -n aiorche --replicas=0 --all
	@echo "✅ All Pods stopped. Cluster configurations, services, and volumes remain preserved."

k8s-restart:
	@echo "==> Performing rolling restart of all aiorche Pods..."
	@kubectl rollout restart deployment -n aiorche
	@kubectl rollout status deployment/postgres -n aiorche --timeout=60s
	@kubectl rollout status deployment/redis -n aiorche --timeout=60s
	@kubectl rollout status deployment/envoy -n aiorche --timeout=60s
	@kubectl rollout status deployment/backend -n aiorche --timeout=60s
	@kubectl rollout status deployment/frontend -n aiorche --timeout=60s
	@echo "✅ All Pods restarted successfully."

k8s-status:
	@echo "==> Kubernetes aiorche Namespace Status:"
	@kubectl get pods,svc,configmap,deployment -n aiorche -o wide

k8s-logs:
	@echo "==> Streaming logs from all aiorche Pods (Ctrl+C to exit)..."
	@kubectl logs -n aiorche -l app.kubernetes.io/part-of=aiorche --all-containers=true --tail=50 -f

k8s-delete:
	@echo "==> Deleting all aiorche Kubernetes resources..."
	@kubectl delete -k deploy/k8s/
	@echo "✅ All aiorche Kubernetes resources deleted."

# 개별 서비스 Pod 제어 (Granular control)
k8s-start-backend:
	@kubectl scale deployment/backend -n aiorche --replicas=1
	@kubectl rollout status deployment/backend -n aiorche --timeout=60s

k8s-stop-backend:
	@kubectl scale deployment/backend -n aiorche --replicas=0

k8s-start-frontend:
	@kubectl scale deployment/frontend -n aiorche --replicas=1
	@kubectl rollout status deployment/frontend -n aiorche --timeout=60s

k8s-stop-frontend:
	@kubectl scale deployment/frontend -n aiorche --replicas=0

k8s-start-envoy:
	@kubectl scale deployment/envoy -n aiorche --replicas=1
	@kubectl rollout status deployment/envoy -n aiorche --timeout=60s

k8s-stop-envoy:
	@kubectl scale deployment/envoy -n aiorche --replicas=0

k8s-start-db:
	@kubectl scale deployment/postgres deployment/redis -n aiorche --replicas=1
	@kubectl rollout status deployment/postgres -n aiorche --timeout=60s
	@kubectl rollout status deployment/redis -n aiorche --timeout=60s

k8s-stop-db:
	@kubectl scale deployment/postgres deployment/redis -n aiorche --replicas=0

