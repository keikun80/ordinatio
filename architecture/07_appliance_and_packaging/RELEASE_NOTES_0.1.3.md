# Ordinatio Release Notes - 0.1.3

**Release Date**: 2026-11-23  
**Release Type**: Official Enterprise Release (100% Air-Gapped Clean Architecture)  
**Target Architecture**: Air-Gapped On-Premise Appliance & Cloud-Adjacent Hybrid Appliance  
**Git Tag**: `0.1.3`  
**Quality Status**: **114 / 114 Backend Tests PASS (100%), Standalone 7 / 7 PASS, Frontend Vite Build PASS**

---

## 🌟 최신 릴리즈 요약 및 핵심 성과 (Release Highlights)

본 0.1.3 릴리즈는 Ordinatio의 공식 상용급 릴리즈로서, 이전 모든 구버전(v1.0.0, v1.0.1, v1.0.2)의 개발 마일스톤과 안정화 패치를 통합하고, **가짜/모의 코드 완전 박멸, 소스코드 실구현 기반 테스트 스위트 100% 정합화(114 Tests PASS)**를 달성한 단일 통합 버전입니다.

---

## 🚀 주요 구현 및 엔지니어링 기능

1. **선언적 외부 환경설정 분리 (`install.conf`) & 무인 자동 설치**:
   - `ordinatio/deploy/install.conf.example` 템플릿 기반 100% 무인(Silent/Unattended) 설치 지원.
   - `-c | --config <PATH>` 옵션 및 계층적 설정 우선순위(`CLI 플래그 > install.conf > Defaults`) 적용.
   - `chmod 600` 보안 권한 축소를 자동 적용하여 DB 암호 및 관리자 초기 비밀번호 유출 원천 차단.

2. **런타임 하드코딩 제거 및 파라미터 완전 외부화**:
   - L7 게이트웨이 라우팅 타임아웃(`GATEWAY_READ_TIMEOUT=120.0`, `GATEWAY_CONNECT_TIMEOUT=10.0`) 설정 외부화.
   - Envoy 컨테이너 ➔ 호스트 백엔드 브릿지 IP(`DOCKER_BRIDGE_GATEWAY_IP=172.20.0.1`) 환경변수화 및 동적 치환.
   - 프론트엔드/백엔드/게이트웨이 포트 및 관리자 계정 정보 완전 분리.

3. **6대 핵심 기능 전수 실체화 및 모의 코드 제거**:
   - **실측 레디니스 프로브**: 실제 DB `SELECT 1` 지연시간(`database_latency_ms`) 및 Redis 소켓 핑 지연시간 실측.
   - **Zero-PII 기술지원 번들**: 실제 호스트 OS 정보, 실제 AuditLog 감사 통계, 실제 RoutingPolicy 목록을 포함한 실체화 ZIP 아카이브 생성.
   - **시맨틱 캐시 실시간 적중률**: `SemanticCache`의 실제 적중률(`hit_rate_pct`)을 텔레메트리 허브와 실시간 연동.
   - **TokenRateLimiter 분산 슬라이딩 윈도우**: Redis Sorted Set 기반 슬라이딩 윈도우 및 장애 시 인메모리 무장애 폴백.
   - **Envoy xDS 실시간 동기화 & ACK 프로빙**: 동적 라우팅 배포 시 Envoy Admin 포트를 실시간 프로브하여 ACK 검증.
   - **솔루션 버전 0.1.3 일원화**: 백엔드, 프론트엔드, 인스톨러, Docker 이미지 전반 버전 일치화.

4. **WORM 불변 감사 포렌식 & PII 보안 거버넌스**:
   - PostgreSQL INSERT-only WORM 불변 감사 로그 테이블 및 SHA-256 Merkle Hash-chain 무결성 전수 검증.
   - MASK / HASH / BLOCK 초경량 정규식 PII 인라인 마스킹 엔진 (<2ms).
   - 금융권 3대 보안 제약(30분 활동만료, 5회 오류 시 15분 잠금, 단일 세션 보장) 및 PBAC 세부 권한 매트릭스.

5. **단일 어플라이언스 인스톨러 & 컨테이너 이미지**:
   - RHEL 9 / Rocky Linux 9 / Ubuntu 24.04 호환 단일 호스트 무인 설치 툴(`install.sh`).
   - 공식 Docker Hub 최신 프로덕션 이미지:
     - `keikun808/ordinatio-backend:0.1.3` (`latest`)
     - `keikun808/ordinatio-frontend:0.1.3` (`latest`)

---

## 🧪 자동화 테스트 검증 현황

| 검증 영역 | 테스트 스위트 | 검증 결과 |
| :--- | :--- | :---: |
| **백엔드 단위/통합 테스트** | `ordinatio/backend/tests/` (114개 테스트) | ✅ **114 / 114 PASS (100%)** |
| **Standalone 무인 설치기** | `scripts/verify-standalone-install.sh` (7개 단계) | ✅ **7 / 7 PASS (100%)** |
| **프론트엔드 프로덕션 빌드** | `ordinatio/frontend` (Vite 6.4.3) | ✅ **Vite Build PASS (2.27s)** |
| **전 메뉴 통합 E2E 검증** | `scripts/verify-all-menus.sh` (10개 시나리오) | ✅ **10 / 10 PASS (100%)** |
