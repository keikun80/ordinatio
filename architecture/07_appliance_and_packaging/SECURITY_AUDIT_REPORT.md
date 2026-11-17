# Ordinatio 엔터프라이즈 보안 감사 보고서 (v1.0.0)

## 1. 보안 아키텍처 개요
Ordinatio는 금융, 공공, 대기업의 엄격한 보안 요구사항을 충족하도록 설계된 **100% 폐쇄망(Air-Gapped) 전용 어플라이언스**입니다.

## 2. 7대 핵심 보안 제어 표준 (Security Controls)
1. **Zero External Egress (망분리 완전 자립)**:
   - 외부 SaaS, 퍼블릭 CDN, 원격 텔레메트리 호출이 전무하며, 모든 정적 리소스 및 폰트는 자체 번들링되어 제공됩니다.
2. **비대칭 암호화 서명 (Cryptographic Supply Chain)**:
   - 릴리즈 번들은 RSA-4096 비대칭 키로 서명되며, 수신 측에서 `verify-release.sh`를 통해 위·변조 여부를 실시간 검증합니다.
3. **최소 권한 원칙 (Non-Root Containers)**:
   - 백엔드(FastAPI) 및 프론트엔드(Nginx) 컨테이너는 격리된 비루트(`appuser`, UID 10001) 권한으로 구동됩니다.
4. **암호화 자격 증명 관리**:
   - 가상 API 키(`sk-ord-*`)는 DB에 Argon2id 단방향 솔트 해시 알고리즘으로 저장되어 평문 유출이 불가능합니다.
5. **PII 실시간 마스킹 (Presidio)**:
   - 주민등록번호, 신용카드, 이메일, 전화번호 등 민감 개인정보는 L7 게이트웨이 유입 즉시 마스킹 처리됩니다.
6. **WORM (Write Once, Read Many) 불변 감사 로그**:
   - 모든 제어 및 라우팅 이벤트는 SHA-256 서명 체인으로 연결되어 임의 변조 시 변조 탐지 알람이 발동됩니다.
7. **세밀한 역할 기반 접근 통제 (RBAC/PBAC)**:
   - 5대 시스템 역할(`super_admin`, `admin`, `operator`, `auditor`, `user`)과 세분화된 권한 매트릭스로 불필요한 기능 접근을 차단합니다.

## 3. 타사 OS 호환성 및 검증 완료 내역
- **Rocky Linux 9 (RHEL 9)**: 검증 완료 (100% PASS)
- **Ubuntu 24.04 LTS**: 검증 완료 (100% PASS)
- **Amazon Linux 2023**: 검증 완료 (100% PASS)
