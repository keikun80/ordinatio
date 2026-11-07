# ==============================================================================
# AI Orchestrator Standalone Appliance Control Makefile
# ==============================================================================

.PHONY: help up down restart status logs init-admin backup

help:
	@echo "AI Orchestrator Standalone Appliance Commands"
	@echo ""
	@echo "  make up         - 오프라인 이미지 자동 로드 및 스택 원스톱 기동"
	@echo "  make down       - 어플라이언스 스택 안전 중지"
	@echo "  make restart    - 어플라이언스 스택 재기동"
	@echo "  make status     - 5대 컨테이너 헬스체크 및 포트 상태 확인"
	@echo "  make logs       - 전체 서비스 실시간 통합 로그 확인"
	@echo "  make init-admin - 초기 관리자 계정 생성 및 비밀번호 재설정"
	@echo "  make backup     - PostgreSQL 메타데이터 원클릭 백업"
	@echo ""

up:
	@bash scripts/offline-load.sh
	@if [ ! -f .env ]; then \
		echo "==> Generating production .env with secure random secrets..."; \
		cp .env.example .env; \
		RAND_SECRET=$$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p); \
		RAND_PG=$$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | xxd -p); \
		if sed --version >/dev/null 2>&1; then \
			sed -i "s|REPLACE_SECRET_KEY|$${RAND_SECRET}|g" .env; \
			sed -i "s|REPLACE_POSTGRES_PASSWORD|$${RAND_PG}|g" .env; \
		else \
			sed -i '' "s|REPLACE_SECRET_KEY|$${RAND_SECRET}|g" .env; \
			sed -i '' "s|REPLACE_POSTGRES_PASSWORD|$${RAND_PG}|g" .env; \
		fi; \
	fi
	@echo "==> Starting AI Orchestrator Appliance Stack..."
	@docker compose up -d
	@bash scripts/wait-healthy.sh

down:
	@docker compose down

restart: down up

status:
	@docker compose ps

logs:
	@docker compose logs -f --tail=100

init-admin:
	@docker exec -it aiorche-backend python -m app.scripts.init_admin $(ARGS)

backup:
	@mkdir -p backups
	@BACKUP_FILE="backups/aiorche_backup_$$(date +%Y%m%d_%H%M%S).sql"; \
	echo "==> Exporting database backup to $${BACKUP_FILE}..."; \
	docker exec aiorche-postgres pg_dump -U postgres aiorche_db > "$${BACKUP_FILE}"; \
	echo "✅ Database backup complete: $${BACKUP_FILE}"

