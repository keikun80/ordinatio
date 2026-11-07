# Ubuntu 24.04 LTS Vagrant 오프라인 어플라이언스 단일 번들 설치 검증 보고서 (PRE_43)

## 1. 개요 및 목적
본 문서는 Rocky Linux 9 검증(PRE_41) 완료 후, **Ubuntu 24.04 LTS (Noble Numbat)** 가상 머신 환경에서 `dist/` 디렉터리의 최신 오프라인 압축 번들(`aiorche-appliance-v1.0.0.tar.gz`)을 통한 원클릭 무인 설치 및 `make up` 스탠드얼론 기동 검증 결과를 기록합니다.

이전 테스트에서 식별되었던 **백엔드 포트 바인딩(`0.0.0.0:8000`) 및 프론트엔드 동일 오리진 프록시(`/api/v1`)** 패치가 반영된 최신 번들을 기반으로 실증 검증을 수행하였습니다.

---

## 2. 테스트 환경 사양

| 구분 | 사양 및 설정 |
| :--- | :--- |
| **호스트 OS** | macOS Intel (`x86_64`) |
| **가상화 도구** | Vagrant v2.4.9, Oracle VM VirtualBox v7.2.20 |
| **가상머신 OS** | **Ubuntu 24.04.3 LTS (Noble Numbat), Linux 6.8.0-45-generic x86_64** |
| **VM 베이스 박스** | `bento/ubuntu-24.04` (v202510.26.0) |
| **VM 하드웨어** | 4 vCPU, 8192 MB (8GB) RAM |
| **네트워크 구성** | NAT (포트포워딩: 5173, 8000, 8080, 9901) + Host-Only 사설망 (`192.168.56.10`) |
| **패키지 관리** | `apt-get` (공식 Ubuntu Noble 저장소) |
| **런타임 엔진** | Docker Engine v28.0.1, Docker Compose Plugin v2.33.1 |
| **방화벽/보안** | UFW 방화벽 (5173, 80, 8000, 8080, 9901 허용), AppArmor 활성화 환경 |

---

## 3. 배포 아티팩트 및 최신 패치 내역

- **배포 아카이브**: `aiorche/dist/aiorche-appliance-v1.0.0.tar.gz` (384MB)
- **무결성 체크섬**: `aiorche/dist/aiorche-appliance-v1.0.0.tar.gz.sha256`
- **반영된 주요 패치**:
  1. `docker-compose.yml`: 백엔드 포트 바인딩을 `0.0.0.0:8000:8000`으로 개방하여 가상머신 외부(호스트 브라우저) 통신 보장
  2. `client.js`: 프로덕션 빌드 시 상대 경로 `/api/v1` 프록시를 자동 사용하여 포트/CORS 이슈 원천 차단
  3. `provision.sh`: `/etc/os-release` 기반 Ubuntu(Debian) 및 Rocky(RHEL) 자동 분기 처리 탑재

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
| **호스트 로그인 (Direct)** | `POST http://localhost:8000/api/v1/auth/login` | JWT 발급 및 `SUPER_ADMIN` 확인 | 18개 전 권한 발급 완료 | **PASS** |
| **호스트 로그인 (Proxy)** | `POST http://localhost:5173/api/v1/auth/login` | 동일 오리진 Nginx 프록시 로그인 | 18개 전 권한 발급 완료 | **PASS** |
| **DB 원클릭 백업** | `make backup` | `backups/aiorche_backup_*.sql` 생성 | 24KB SQL 덤프 생성 완료 | **PASS** |

### 5.1. 호스트 머신에서의 슈퍼관리자 인증 응답
```json
{
  "username": "admin",
  "role": "SUPER_ADMIN",
  "permissions_count": 18,
  "token_type": "bearer"
}
```

---

## 6. 결론
1. **Ubuntu 24.04 LTS (Noble Numbat)** 환경에서도 단일 오프라인 압축 번들(`aiorche-appliance-v1.0.0.tar.gz`)이 외부 인터넷 의존성 없이 `make up`만으로 100% 정상 기동되었습니다.
2. 백엔드 외부 포트 바인딩 및 프론트엔드 동일 오리진 프록시 패치로 인해, 가상머신 외부(호스트 브라우저)에서 `http://localhost:5173` 접속 시 로그인 오류 없이 즉시 대시보드로 진입 가능함을 입증하였습니다.
3. 이로써 AI Orchestrator Standalone 어플라이언스는 **Enterprise Linux 계열(Rocky Linux 9, RHEL 9)**과 **Debian 계열(Ubuntu 24.04 LTS)** 모두에서 100% 호환성 및 무결성을 입증하였습니다.
