# Amazon Linux 2023 Vagrant 오프라인 어플라이언스 단일 번들 설치 검증 보고서 (PRE_44)

## 1. 개요 및 목적
본 문서는 Rocky Linux 9(PRE_41) 및 Ubuntu 24.04 LTS(PRE_43) 검증에 이어, AWS 클라우드/온프레미스 하이브리드 표준 OS인 **Amazon Linux 2023 (AL2023)** 가상 머신 환경에서 `dist/` 디렉터리의 최신 단일 오프라인 압축 번들(`aiorche-appliance-v1.0.0.tar.gz`)을 통한 원클릭 무인 설치 및 `make up` 스탠드얼론 기동 검증 결과를 기록합니다.

---

## 2. 테스트 환경 사양

| 구분 | 사양 및 설정 |
| :--- | :--- |
| **호스트 OS** | macOS Intel (`x86_64`) |
| **가상화 도구** | Vagrant v2.4.9, Oracle VM VirtualBox v7.2.20 |
| **가상머신 OS** | **Amazon Linux 2023.9.20251020, Linux 6.1.157-176.223.amzn2023.x86_64** |
| **VM 베이스 박스** | `bento/amazonlinux-2023` (v202510.26.0) |
| **VM 하드웨어** | 4 vCPU, 8192 MB (8GB) RAM |
| **네트워크 구성** | NAT (포트포워딩: 5173, 8000, 8080, 9901) + Host-Only 사설망 (`192.168.56.10`) |
| **패키지 관리** | `dnf` (AL2023 공식 ALAS 리포지토리) |
| **컨테이너 엔진** | Docker Engine v25.0.13 (Amazon Linux 패키지) & Docker Compose Plugin v2.33.1 |
| **보안/SELinux** | SELinux Permissive 환경, 컨테이너 볼륨 권한 정상 매핑 |

---

## 3. AL2023 환경 맞춤형 대응 내역

1. **`curl-minimal` 패키지 충돌 해소**:
   - AL2023 기본 이미지에 사전 탑재된 `curl-minimal`과 일반 `curl` 패키지 충돌 문제를 `dnf install -y --allowerasing ...` 플래그를 적용하여 해결.
2. **Docker Compose Plugin 설치 표준화**:
   - AL2023 전용 Docker CLI 플러그인 디렉터리(`/usr/local/lib/docker/cli-plugins/docker-compose`)에 v2.33.1 바이너리를 배치하여 `docker compose` 명령 완전 호환성 확보.
3. **관리자 비밀번호 일관성 보장**:
   - `provision.sh` 내 초기 관리자 부트스트랩 시 UI 안내 및 기본값과 동일한 **`admin1234!`**를 적용하여 불일치 원천 제거.

---

## 4. 검증 시나리오 및 실행 증적

### 4.1. SHA-256 무결성 검증
```bash
==> 번들 발견: /opt/aiorche-src/오케스트레이터/aiorche/dist/aiorche-appliance-v1.0.0.tar.gz
==> SHA-256 무결성 검증 수행...
aiorche-appliance-v1.0.0.tar.gz: OK
✅ SHA-256 무결성 검증 성공!
```

### 4.2. 아카이브 압축 해제 및 `make up` 구동
```text
==> Loading packaged offline Docker images...
Loaded image: aiorche-backend:prod
Loaded image: aiorche-frontend:prod
Loaded image: postgres:15-alpine
Loaded image: redis:7-alpine
Loaded image: envoyproxy/envoy:v1.31.2
==> Generating production .env with secure random secrets...
==> Starting AI Orchestrator Appliance Stack...
 Container aiorche-postgres  Creating
 Container aiorche-redis  Creating
 Container aiorche-backend  Creating
 Container aiorche-frontend  Creating
 Container aiorche-envoy  Creating
==> Waiting for 5 appliance services to achieve healthy state...
  • Checking aiorche-postgres...  [HEALTHY]
  • Checking aiorche-redis...     [HEALTHY]
  • Checking aiorche-backend...   [HEALTHY]
  • Checking aiorche-envoy...     [HEALTHY]
  • Checking aiorche-frontend...  [HEALTHY]

========================================================================
🎉 AI Orchestrator Appliance Successfully Started! (Air-Gapped)
========================================================================
  • Web Console (UI)    : http://10.0.2.15:5173
  • L7 AI Gateway       : http://10.0.2.15:8080/v1
  • API Documentation   : http://127.0.0.1:8000/docs
  • Initial Admin User  : admin
  • Initial Password    : admin1234!
========================================================================
```

---

## 5. 엔드투엔드 서비스 검증 결과

| 검증 항목 | 대상 엔드포인트 / 명령 | 기대 결과 | 실행 결과 | 판정 |
| :--- | :--- | :--- | :--- | :---: |
| **컨테이너 상태** | `make status` | 5개 컨테이너 모두 `Up (healthy)` | 5/5 healthy 유지 | **PASS** |
| **Web Console UI** | `GET http://localhost:5173/` | HTTP 200 (웹 UI 정상 로드) | HTTP 200 | **PASS** |
| **Backend Health** | `GET http://localhost:8000/api/v1/health` | HTTP 200, `status: UP` JSON | `{"status":"UP",...}` 반환 | **PASS** |
| **Envoy Admin** | `GET http://127.0.0.1:9901/ready` | HTTP 200, `LIVE` 응답 | HTTP 200, LIVE | **PASS** |
| **Envoy L7 Gateway** | `GET http://localhost:8080/v1/models` | HTTP 200 (L7 라우팅 관문) | HTTP 200 | **PASS** |
| **호스트 로그인 (Direct)** | `POST http://localhost:8000/api/v1/auth/login` | `admin / admin1234!` 로그인 성공 | 18개 전 권한 발급 완료 | **PASS** |
| **호스트 로그인 (Proxy)** | `POST http://localhost:5173/api/v1/auth/login` | Nginx 프록시 경유 로그인 성공 | 18개 전 권한 발급 완료 | **PASS** |
| **DB 원클릭 백업** | `make backup` | `backups/aiorche_backup_*.sql` 생성 | 24KB SQL 덤프 생성 완료 | **PASS** |

### 5.1. 호스트 머신에서의 슈퍼관리자 인증 응답
```json
{
  "username": "admin",
  "role": "SUPER_ADMIN",
  "permissions_count": 18,
  "token_type": "bearer",
  "expires_in": 3600
}
```

---

## 6. 결론
1. **Amazon Linux 2023** 환경에서도 단일 오프라인 압축 번들(`aiorche-appliance-v1.0.0.tar.gz`)이 외부 인터넷 의존성 없이 `make up`만으로 100% 정상 자립 기동되었습니다.
2. 초기 관리자 비밀번호를 UI 안내와 동일한 **`admin1234!`**로 일원화하여, 호스트 브라우저에서 `http://localhost:5173` 접속 시 즉시 성공적인 로그인이 가능함을 실증 검증하였습니다.
3. 이로써 AI Orchestrator Standalone 어플라이언스는 **엔터프라이즈 3대 주요 리눅스 배포판군(Rocky Linux 9, Ubuntu 24.04 LTS, Amazon Linux 2023)** 전체에서 완전한 이식성과 신뢰성을 확보하였습니다.

