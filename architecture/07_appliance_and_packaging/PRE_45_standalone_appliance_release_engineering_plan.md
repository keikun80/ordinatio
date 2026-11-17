# Ordinatio 오프라인 어플라이언스 릴리즈 엔지니어링 계획서 (PRE_45)

## 1. 릴리즈 개요 및 배경

본 문서는 `ordinatio/dist/` 디렉터리에 생성된 독립형 오프라인 어플라이언스 번들(`ordinatio-appliance-v1.0.0.tar.gz`)을 **엔터프라이즈 및 공공·금융 고객사 폐쇄망(Air-Gapped) 환경에 안전하고 신뢰성 있게 릴리즈(Release)**하기 위한 소프트웨어 공학 표준 배포 계획서입니다.

Ordinatio는 외부 SaaS 및 퍼블릭 인터넷 호출이 100% 차단된 환경에서 작동하므로, 일반적인 클라우드 SaaS 배포와 달리 **"아티팩트 자체의 암호학적 무결성, 오프라인 전자서명, 공급망 보안(SBOM), 3대 엔터프라이즈 OS 실증 증적 및 고객사 전입 검증 도구 동봉"**이 핵심 요건입니다.

---

## 2. 릴리즈 배포 패키지 구성 규격 (Release Artifact Taxonomy)

고객사 인도 및 릴리즈 저장소 배포 시 생성되는 아티팩트 디렉터리 구조입니다:

```text
dist/release/v1.0.0/
├── ordinatio-appliance-v1.0.0.tar.gz          # [핵심] 5대 Docker 이미지, compose, Makefile 포함 본체 번들 (384MB)
├── ordinatio-appliance-v1.0.0.tar.gz.sha256   # SHA-256 체크섬 파일
├── ordinatio-appliance-v1.0.0.tar.gz.sha512   # SHA-512 체크섬 파일 (금융권 감사 대응)
├── ordinatio-appliance-v1.0.0.tar.gz.sig      # RSA-4096 비대칭 키 전자서명 파일
├── ordinatio-vendor-public.pem                # 벤더 공식 RSA-4096 서명 검증용 공개키
├── SBOM-ordinatio-v1.0.0.json                 # 공급망 보안 소프트웨어 자재명세서 (CycloneDX/SPDX 형식)
├── SECURITY_AUDIT_REPORT.md                 # 컨테이너 취약점(CVE) 점검 및 보안 하드닝 리포트
├── OFFLINE_INSTALL_GUIDE.md                 # 1분 퀵스타트 및 운영자 핸드북
├── verify-release.sh                        # 고객사 수신 후 원클릭 무결성 및 서명 검증 스크립트
└── RELEASE_NOTES_v1.0.0.md                  # 기능 명세, 보안 패치, 지원 OS 및 변경 이력
```

### 아티팩트 상세 명세

| 파일명 | 용도 및 규격 | 필수 여부 |
| :--- | :--- | :---: |
| `ordinatio-appliance-v{VER}.tar.gz` | 단일 오프라인 어플라이언스 설치 아카이브 (Docker 5종 이미지 내장) | **필수** |
| `.sha256` / `.sha512` | 파일 손상 및 전송 오류 탐지용 해시 체크섬 | **필수** |
| `.sig` | RSA-4096 비대칭 키 기반 위변조 방지 전자서명 (PKCS#1 v1.5 / PSS) | **필수** |
| `ordinatio-vendor-public.pem` | 고객사 보안팀이 패키지 위변조 여부를 오프라인 검증할 수 있는 공인 공개키 | **필수** |
| `SBOM-*.json` | 오픈소스 라이선스 및 패키지 의존성 추적 자재명세서 (CycloneDX 1.5) | 엔터프라이즈 권고 |
| `verify-release.sh` | 수신 측에서 `sha256sum`, `openssl dgst`를 자동 실행하는 검증기 | **필수** |
| `OFFLINE_INSTALL_GUIDE.md` | 인터넷 없는 환경에서 `tar -xzf` 및 `make up` 실행 안내서 | **필수** |
| `RELEASE_NOTES_*.md` | 해당 버전의 릴리즈 요약, 지원 OS, 마이그레이션 가이드 | **필수** |

---

## 3. 5단계 릴리즈 생명주기 파이프라인 (5-Stage Release Lifecycle)

```
[Stage 1: Pre-Release Quality Gate] ➔ 무회귀 테스트 & 3대 OS 가상머신 DoD 검증 확인
       ▼
[Stage 2: Production Build] ➔ make prod-build 최신 번들 빌드
       ▼
[Stage 3: Cryptographic Signing & SBOM] ➔ SHA-256/512 해싱, RSA-4096 서명, SBOM 생성
       ▼
[Stage 4: Version Tagging & Git Release] ➔ git tag -s v1.0.0 및 릴리즈 노트 확정
       ▼
[Stage 5: Enterprise Handover Packaging] ➔ 납품용 단일 아카이브 패키징 및 채널별 배포
```

### Stage 1: 릴리즈 사전 품질 게이트 (Pre-Release Quality Gate)
릴리즈 번들을 생성하기 전 다음 4대 게이트웨이를 100% 통과해야 합니다:
1. **백엔드 단위/통합 테스트**: `make test` (Pytest 93/93 전수 PASS)
2. **프론트엔드 프로덕션 빌드**: `npm run build` (Vite 번들링 에러 0건)
3. **RBAC/PBAC 권한 시나리오**: `make verify-rbac-scenarios` (API 193건 + UI 80건 100% PASS)
4. **3대 엔터프라이즈 OS 실환경 설치 실증**:
   - Rocky Linux 9 (RHEL 9): PASS ([`testdocs/PRE_41`](../testdocs/PRE_41_rocky_linux_vagrant_offline_installation_test_results.md))
   - Ubuntu 24.04 LTS: PASS ([`testdocs/PRE_43`](../testdocs/PRE_43_ubuntu_24_vagrant_offline_installation_test_results.md))
   - Amazon Linux 2023: PASS ([`testdocs/PRE_44`](../testdocs/PRE_44_amazon_linux_2023_vagrant_offline_installation_test_results.md))

### Stage 2: 프로덕션 빌드 실행 (`make prod-build`)
- 최신 프론트엔드 정적 파일 컴파일 (`npm run build`)
- 최신 도커 이미지 5종 패키징 (`ordinatio-backend:prod`, `ordinatio-frontend:prod`, postgres, redis, envoy)
- `dist/ordinatio-appliance-v{VERSION}.tar.gz` 아카이브 생성.

### Stage 3: 암호학적 서명 및 무결성 아티팩트 생성
1. **이중 체크섬 계산**:
   ```bash
   sha256sum ordinatio-appliance-v1.0.0.tar.gz > ordinatio-appliance-v1.0.0.tar.gz.sha256
   sha512sum ordinatio-appliance-v1.0.0.tar.gz > ordinatio-appliance-v1.0.0.tar.gz.sha512
   ```
2. **RSA-4096 비대칭 전자서명**:
   벤더 개인키(`release-private.pem`)를 사용하여 번들 다이제스트에 서명:
   ```bash
   openssl dgst -sha256 -sign release-private.pem -out ordinatio-appliance-v1.0.0.tar.gz.sig ordinatio-appliance-v1.0.0.tar.gz
   ```
3. **공개키 검증 증적 확인**:
   ```bash
   openssl dgst -sha256 -verify ordinatio-vendor-public.pem -signature ordinatio-appliance-v1.0.0.tar.gz.sig ordinatio-appliance-v1.0.0.tar.gz
   # 출력: Verified OK
   ```

### Stage 4: Git 버전 태깅 및 릴리즈 노트 발행
1. **시맨틱 버저닝 (SemVer 2.0.0)** 준수: `v1.0.0`
2. **Git 서명 태그 생성**:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0: Standalone Offline Air-Gapped Appliance"
   git push origin v1.0.0
   ```
3. **릴리즈 노트(`RELEASE_NOTES_v1.0.0.md`) 발행**:
   - 신규 기능: Envoy L7 인텔리전트 라우팅, 가상키/멀티테넌시, Presidio 고속 PII 마스킹, WORM 불변 감사, 동적 RBAC
   - 지원 OS: Rocky Linux 9, RHEL 9, AlmaLinux 9, Ubuntu 24.04 LTS, Amazon Linux 2023
   - 초기 계정: `admin` / `admin1234!`

### Stage 5: 고객사 인도 채널별 패키징 및 유통
고객사의 반입 승인 프로세스에 맞춰 다음 세 가지 채널 규격으로 패키징합니다:
1. **채널 A: 보안 전용 USB / 외장 매체 인도용 패키지**
   - 상기 아티팩트 10종을 단일 압축본(`ordinatio-delivery-v1.0.0.zip`)으로 묶어 보안 봉인 매체로 전달.
2. **채널 B: 사내 프라이빗 아티팩토리(Nexus / Harbor / JFrog) 적재**
   - 원클릭 cURL 스크립트로 고객사 폐쇄망 레지스트리에 아티팩트 업로드.
3. **채널 C: 사내 프라이빗 오브젝트 스토리지 (S3 / MinIO)**
   - `s3://customer-airgap-releases/ordinatio/v1.0.0/` 업로드.

---

## 4. 고객사 전입 검증 도구 (`verify-release.sh`) 규격

고객사 인프라/보안 담당자가 패키지를 전달받은 즉시 터미널에서 신뢰성을 판정할 수 있도록 스크립트를 제공합니다:

```bash
#!/usr/bin/env bash
# verify-release.sh - Ordinatio Customer Delivery Verifier
set -euo pipefail

echo "==> 1. Checking SHA-256 Checksum..."
sha256sum -c ordinatio-appliance-v1.0.0.tar.gz.sha256

echo "==> 2. Verifying RSA-4096 Cryptographic Signature..."
openssl dgst -sha256 -verify ordinatio-vendor-public.pem \
    -signature ordinatio-appliance-v1.0.0.tar.gz.sig \
    ordinatio-appliance-v1.0.0.tar.gz

echo "🎉 [SUCCESS] The release artifact is authentic, intact, and officially signed by the vendor."
```

---

## 5. 자동화 릴리즈 명령어 계획 (`make release`)

Makefile에 릴리즈 자동화 파이프라인을 구축하여 휴먼 에러를 방지합니다:

```makefile
# Makefile 릴리즈 타깃 예시
release:
	@bash scripts/release-appliance.sh --version $(VERSION)
```

`scripts/release-appliance.sh`의 자동 실행 내용:
1. `make test` 및 DoD 자가 진단 실행
2. `make prod-build`로 최신 tar.gz 생성
3. SHA-256 / SHA-512 체크섬 자동 계산
4. RSA-4096 전자서명 파일 및 공개키 동봉
5. `verify-release.sh`, `OFFLINE_INSTALL_GUIDE.md`, `RELEASE_NOTES.md` 통합
6. `dist/release/v$(VERSION)/` 디렉터리에 인도용 번들 완제본 생성

---

## 6. 결론 및 기대 효과

1. **완벽한 공급망 보안 및 위변조 방지**:
   - SHA-256/512 이중 체크섬과 RSA-4096 비대칭 서명을 결합하여 망분리 이동 과정에서의 데이터 손상 및 임의 변조를 100% 방지합니다.
2. **운영자 편의성 극대화**:
   - 고객사 보안팀은 `verify-release.sh` 한 줄로 신뢰성을 판정하고, 인프라팀은 `tar -xzf && make up` 한 줄로 시스템을 즉각 기동할 수 있습니다.
3. **엔터프라이즈 컴플라이언스 완벽 충족**:
   - 3대 리눅스 배포판(Rocky 9, Ubuntu 24.04, AL2023) 실증 증적 및 금융권 수준의 보안 보고서를 제공함으로써 대기업 및 금융기관의 보안성 심의를 원패스로 통과할 수 있습니다.

