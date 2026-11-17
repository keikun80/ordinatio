# Ordinatio Release Notes - v1.0.1

**Release Date**: 2026-11-17  
**Release Type**: Maintenance & Reliability Hotfix Release  
**Target Architecture**: Air-Gapped On-Premise Appliance & Cloud-Adjacent Hybrid Appliance  
**Git Tag**: `v1.0.1`  

---

## 🌟 주요 개선 및 버그 수정 사항 (Key Improvements & Fixes)

1. **L7 게이트웨이 테스트 호출 타임아웃 세분화 및 지능형 폴백 ([ADR-10](file:///home/keikun/project/ordinatio/architecture/00_core_and_blueprint/PRE_13_GAP_ANALYSIS_PHASE_0_TO_6.md))**:
   - 대규모 LLM(vLLM, SGLang 등)의 추론 생성 지연(7~15초 이상)을 온전히 수용하도록 `ReadTimeout`을 120.0초로 상향.
   - `ConnectTimeout`을 10.0초로 분리하고, 도커 내부망 호스트 DNS 미해석 시 즉각 중단하지 않고 로컬 루프백(`127.0.0.1:8080`, `localhost:8080`)으로 안전하게 시도하는 체인 폴백 구현.
2. **Envoy L7 엣지 게이트웨이 업스트림 네트워크 안정화**:
   - Envoy 컨테이너 ➔ 호스트 백엔드 프록시 통신을 위해 Docker 브릿지 게이트웨이 IP(`172.20.0.1:8000`)를 업스트림 클러스터로 바인딩하여 패킷 드롭 및 DNS 실패 원천 차단.
3. **AWS ALB 및 엔터프라이즈 리버스 프록시 연동 지원**:
   - `ProxyHeadersMiddleware` 및 `get_client_real_ip`를 적용하여 이중 프록시(ALB + Envoy) 환경에서도 엔드 유저의 실제 클라이언트 IP를 정확히 추출.
   - Envoy `xff_num_trusted_hops: 1` 설정 및 프론트엔드 브라우저 동적 API Origin 감지(`detectApiBaseUrl`) 적용.
4. **금융 PII 탐지 규칙 셋 관리 자동화 (`SCR-COMP-01`)**:
   - PII 규칙 생성 모달에서 식별 항목 유형(주민등록번호, 은행 계좌, 신용카드, 여권 등) 선택 시 표준 정규식 및 기본 조치(MASK/BLOCK)가 자동으로 입력되도록 편의 기능 추가.
5. **가상키 생성 모달 (`SCR-VK-M01`) 모델 카탈로그 연동성 강화**:
   - 등록된 모델이 없을 경우 라우팅/카탈로그 탭으로 즉시 이동할 수 있는 빈 상태 배너 및 바로가기 버튼 제공.
   - 모달 열기 시 백엔드 `getModels()` 실시간 재조회 및 로컬 스토리지 캐시 폴백 적용.
6. **관제 홈 (`OverviewTab`) 정화 및 100% 실데이터화**:
   - 하드코딩된 더미 경보를 전면 제거하고, 100% 데이터베이스 및 Envoy 연동 실데이터 시스템 상태만 표출.
7. **엔터프라이즈 클린 설치 모드 지원**:
   - `SEED_DEMO_DATA=False` 및 정화된 `init.sql`을 통해 데모 부서/키/가상 모델 없이 Super Admin만 생성하는 순수 클린 프로덕션 배포 지원.
8. **비보안 HTTP 클립보드 복사 폴백**:
   - HTTPS 미적용 사내 폐쇄망 브라우저 환경에서도 키 및 설정 복사가 가능하도록 `document.execCommand('copy')` 폴백 구현.

---

## 🧪 테스트 검증 현황

- **백엔드 자동화 테스트**: **102 / 102 Tests 100% PASS** (`cd ordinatio/backend && uv run pytest -v`)
- **프론트엔드 프로덕션 빌드**: **Vite Build PASS** (`cd ordinatio/frontend && npm run build`)
- **오프라인 Standalone 설치 파이프라인**: **7 / 7 Tests 100% PASS** (`make verify-standalone-install`)

---

## 💻 공식 지원 환경

- **Rocky Linux 9 (RHEL 9)**: Kernel 5.14, Docker CE 27.x
- **Ubuntu 24.04 LTS**: Kernel 6.8, Docker CE 27.x
- **Amazon Linux 2023**: Kernel 6.1, Docker CE 25.x
