# Ordinatio Release Notes - v1.0.0

**Release Date**: 2026-11-08  
**Release Type**: Major Production GA Release  
**Target Architecture**: Air-Gapped On-Premise Appliance  

---

## 🌟 주요 기능 하이라이트 (Key Features)

1. **단일 아카이브 완전 자립 패키징**:
   - `ordinatio-appliance-v1.0.0.tar.gz` 하나로 5대 핵심 도커 이미지, 오프라인 로더, 헬스체커, 관리용 Makefile을 원스톱 제공.
2. **Envoy L7 인텔리전트 AI 게이트웨이**:
   - OpenAI 호환 API 규격 지원 (`/v1/chat/completions`).
   - 가상 API 키(`sk-ord-*`) 기반 테넌트 분리 및 토큰 버킷 레이트 리미팅.
3. **엔터프라이즈 거버넌스 및 보안**:
   - Microsoft Presidio 기반 고속 개인정보(PII) 실시간 마스킹.
   - WORM(Write Once, Read Many) 불변 감사 로그 및 SHA-256 서명 체인 무결성 보장.
   - 5대 역할(`super_admin`, `admin`, `operator`, `auditor`, `user`) 기반 동적 RBAC/PBAC.
4. **공급망 보안 및 RSA-4096 서명**:
   - 벤더 공인 RSA-4096 비대칭 서명 및 SHA-256/512 이중 체크섬 동봉.
   - 원클릭 무결성 검증기(`verify-release.sh`) 및 CycloneDX 1.5 규격 SBOM 제공.

---

## 💻 공식 지원 및 검증 완료 운영체제

| OS 배포판 | 커널 / 런타임 | 검증 상태 |
| :--- | :--- | :---: |
| **Rocky Linux 9 (RHEL 9)** | Kernel 5.14, Docker CE 27.x | **100% PASS** |
| **Ubuntu 24.04 LTS** | Kernel 6.8, Docker CE 27.x | **100% PASS** |
| **Amazon Linux 2023** | Kernel 6.1, Docker CE 25.x | **100% PASS** |

---

## 🔑 기본 접속 계정

- **URL**: `http://<호스트IP>:5173`
- **사용자명**: `admin`
- **초기 비밀번호**: `admin1234!`
*(최초 로그인 후 관리자 콘솔에서 즉시 비밀번호를 변경하시기 바랍니다.)*
