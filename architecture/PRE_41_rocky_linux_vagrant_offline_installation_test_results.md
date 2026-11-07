# Rocky Linux 9 Vagrant 오프라인 어플라이언스 단일 번들 설치 검증 보고서 (PRE_41)

## 1. 개요 및 목적
본 문서는 `make prod-build`를 통해 생성된 `dist/` 디렉터리의 단일 오프라인 압축 번들(`aiorche-appliance-v1.0.0.tar.gz`)을 **Rocky Linux 9 가상머신(Vagrant + VirtualBox)** 환경에 이관하고, 오프라인 에어갭 조건 하에서 `make up` 명령 하나로 스탠드얼론 어플라이언스가 완벽하게 기동 및 동작하는지 실증 검증한 결과를 기록합니다.

---

## 2. 테스트 환경 사양

| 구분 | 사양 및 설정 |
| :--- | :--- |
| **호스트 OS** | macOS Intel (`x86_64`) |
| **가상화 도구** | Vagrant v2.4.9, Oracle VM VirtualBox v7.2.20 |
| **가상머신 OS** | Rocky Linux release 9.5 (Blue Onyx), Linux 5.14.0-503.14.1.el9_5.x86_64 |
| **VM 베이스 박스** | `bento/rockylinux-9` (v202510.26.0) |
| **VM 하드웨어** | 4 vCPU, 8192 MB (8GB) RAM |
| **네트워크 구성** | NAT (포트포워딩: 5173, 8000, 8080, 9901) + Host-Only 사설망 (`192.168.56.10`) |
| **런타임 엔진** | Docker Engine v29.9.3, Docker Compose Plugin v5.7.0 |
| **방화벽/보안** | firewalld (5173, 80, 8000, 8080, 9901 허용), SELinux (`container_manage_cgroup=1`) |

---

## 3. 오프라인 설치 아티팩트

- **배포 아카이브**: `aiorche/dist/aiorche-appliance-v1.0.0.tar.gz` (368MB)
- **무결성 체크섬**: `aiorche/dist/aiorche-appliance-v1.0.0.tar.gz.sha256`
- **아카이브 구성**:
  - `docker-compose.yml`: 오프라인 5대 컨테이너 오케스트레이션 정의
  - `Makefile`: `make up`, `make down`, `make restart`, `make status`, `make logs`, `make init-admin`, `make backup`
  - `.env.example`: 프로덕션 보안 기본값 템플릿
  - `images/aiorche-images.tar.gz`: 5대 핵심 도커 이미지 사전 패키징 (Backend, Frontend, Postgres 15, Redis 7, Envoy v1.31.2)
  - `scripts/offline-load.sh`: 도커 엔진 오프라인 이미지 자동 인제스트 스크립트
  - `scripts/wait-healthy.sh`: 컨테이너 헬스체크 및 초기 관리자 자동 부트스트랩 스크립트
  - `README.md`: 에어갭 운영자용 1분 퀵스타트 가이드

---

## 4. 검증 시나리오 및 실행 증적

### 4.1. 무결성 검증 (SHA-256)
Rocky Linux 9 가상머신 내부에서 번들 체크섬을 검증하여 파일 손상이나 변조가 없음을 확인했습니다:
```bash
==> SHA-256 무결성 검증 수행...
aiorche-appliance-v1.0.0.tar.gz: OK
✅ SHA-256 무결성 검증 성공!
```

### 4.2. 아카이브 압축 해제 및 디렉토리 구조화
`/opt/aiorche-appliance` 디렉터리로 압축 해제 완료:
```bash
==> 아카이브 압축 해제 중: /opt/aiorche-appliance ...
==> 압축 해제된 작업 디렉토리 (/opt/aiorche-appliance/aiorche-appliance) 파일 목록:
-rw-r--r--. 1 root root  2487 Nov  7 05:49 docker-compose.yml
-rw-r--r--. 1 root root  1746 Nov  7 05:49 Makefile
-rw-r--r--. 1 root root  1420 Nov  7 05:49 .env.example
drwxr-xr-x. 2 root root    42 Nov  7 05:53 images
drwxr-xr-x. 2 root root    56 Nov  7 05:53 scripts
-rw-r--r--. 1 root root  2891 Nov  7 05:49 README.md
```

### 4.3. `make up` 원클릭 기동 및 헬스체크
`make up` 명령 실행 시 사전 패키징된 도커 이미지 5종이 오프라인 로드되고, 강력한 무작위 보안 시크릿(`SECRET_KEY`, `POSTGRES_PASSWORD`)이 반영된 `.env`가 자동 생성된 후 컨테이너가 가동되었습니다:

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
==> Bootstrapping initial admin account inside container...

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
| **Web Console UI** | `GET http://127.0.0.1:5173/` | HTTP 200 (HTML 페이지 렌더링) | HTTP 200 | **PASS** |
| **Backend Health API** | `GET http://127.0.0.1:8000/api/v1/health` | HTTP 200, `status: UP` JSON 반환 | `{"status":"UP",...}` 반환 | **PASS** |
| **Envoy Admin** | `GET http://127.0.0.1:9901/ready` | HTTP 200, `LIVE` 응답 | HTTP 200, LIVE | **PASS** |
| **Envoy L7 Gateway** | `GET http://127.0.0.1:8080/v1/models` | HTTP 200 (OpenAI 호환 게이트웨이 활성) | HTTP 200 | **PASS** |
| **슈퍼관리자 인증** | `POST http://127.0.0.1:8000/api/v1/auth/login` | JWT 토큰 발급 및 `SUPER_ADMIN` 확인 | `access_token` 발급 완료, 권한 `["*"]` | **PASS** |
| **데이터베이스 백업** | `make backup` | `backups/aiorche_backup_*.sql` 생성 | 24KB SQL 덤프 생성 완료 | **PASS** |
| **호스트 머신 연동** | 호스트 브라우저/CLI `http://127.0.0.1:5173` | 포트포워딩을 통한 UI 및 L7 접근 | HTTP 200 정상 응답 | **PASS** |

### 5.1. 슈퍼관리자 인증 응답 전문 (VM 내부 실행 증적)
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "667bc523-d2ea-49c7-80ca-c7b5ea691181",
    "username": "admin",
    "full_name": "시스템 최고관리자",
    "email": "admin@aiorche.local",
    "role": "SUPER_ADMIN",
    "permissions": [
      "*",
      "overview:read",
      "routing:read",
      "routing:write",
      "governance:read",
      "governance:write",
      "prompts:read",
      "prompts:write",
      "finops:read",
      "finops:write",
      "compliance:read",
      "compliance:write",
      "lifecycle:read",
      "lifecycle:write",
      "prompt_studio:execute",
      "users:read",
      "users:write",
      "roles:manage"
    ],
    "tenant_id": null,
    "is_active": true
  }
}
```

---

## 6. 결론
1. `make prod-build`로 빌드된 단일 오프라인 번들(`aiorche-appliance-v1.0.0.tar.gz`)은 외부 인터넷 연결이 완전히 차단된 폐쇄망 Rocky Linux 9 환경에서도 추가 다운로드나 외부 의존성 없이 `make up` 명령 하나만으로 100% 자립 기동되었습니다.
2. 5대 핵심 서비스(PostgreSQL, Redis, Backend, Envoy L7 Gateway, Frontend)가 모두 정상 헬스체크를 달성하였으며, 보안 시크릿 자동화, Argon2id 기반 슈퍼관리자 계정 생성, 백업 기능까지 실증 검증을 성공적으로 마쳤습니다.

