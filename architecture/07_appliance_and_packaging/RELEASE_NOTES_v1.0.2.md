# AI Orchestrator Release Notes - v1.0.2

**Release Date**: 2026-11-17  
**Release Type**: Feature Enhancement & Configuration Externalization Release  
**Target Architecture**: Air-Gapped On-Premise Appliance & Cloud-Adjacent Hybrid Appliance  
**Git Tag**: `v1.0.2`  

---

## 🌟 주요 개선 및 변경 사항 (Key Improvements & Changes)

1. **선언적 외부 환경설정 파일 분리 지원 (`install.conf`)**:
   - `aiorche/deploy/install.conf.example` 및 `aiorche/deploy/standalone/install.conf.example` 제공.
   - 대화형 프롬프트 입력 없이 사전에 준비된 `install.conf` 파일을 참조하여 100% 무인(Silent/Unattended) 설치 완벽 지원.
   - `-c | --config <PATH>` 옵션 지원 및 계층적 설정 탐색 우선순위 (`CLI 플래그 > install.conf > Built-in Defaults`) 적용.
   - 설정 파일 로드 시 `chmod 600` 보안 권한 축소를 자동 적용하여 DB 암호 및 관리자 초기 비밀번호 유출 원천 차단.

2. **런타임 하드코딩 제거 및 파라미터 외부화**:
   - L7 게이트웨이 라우팅 타임아웃(`GATEWAY_READ_TIMEOUT=120.0`, `GATEWAY_CONNECT_TIMEOUT=10.0`) 백엔드 Pydantic Settings(`config.py`) 외부화.
   - Envoy 컨테이너 ➔ 호스트 백엔드 브릿지 IP(`DOCKER_BRIDGE_GATEWAY_IP=172.20.0.1`) 환경변수화 및 `envoy.yaml` 자동 동적 치환 지원.
   - 프론트엔드/백엔드/게이트웨이 포트(`BACKEND_PORT=8000`, `FRONTEND_PORT=80`, `ENVOY_PORT=8080`) 및 관리자 계정 정보 완전 분리.

3. **Standalone 설치 파이프라인 및 검증 스위트 고도화**:
   - `verify-standalone-install.sh` 테스트 4번에 `--config` CLI 플래그 및 `deploy/install.conf.example` 템플릿 무결성 전수 검증 추가 (7/7 PASS 유지).
   - 인스톨러 및 어플라이언스 제어 버전 v1.0.2 동기화.

---

## 🧪 테스트 검증 현황

- **백엔드 자동화 테스트**: **102 / 102 Tests 100% PASS** (`cd aiorche/backend && uv run pytest -v`)
- **프론트엔드 프로덕션 빌드**: **Vite Build PASS** (`cd aiorche/frontend && npm run build`)
- **오프라인 Standalone 설치 파이프라인**: **7 / 7 Tests 100% PASS** (`make verify-standalone-install`)

---

## 💻 공식 지원 환경

- **Rocky Linux 9 (RHEL 9)**: Kernel 5.14, Docker CE 27.x
- **Ubuntu 24.04 LTS**: Kernel 6.8, Docker CE 27.x
- **Amazon Linux 2023**: Kernel 6.1, Docker CE 25.x
