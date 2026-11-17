# Ordinatio 오프라인 폐쇄망(Air-Gapped) 설치 및 운영 가이드

본 가이드는 외부 인터넷 연결이 100% 차단된 고객사 인프라에 Ordinatio 단일 어플라이언스를 안전하게 설치하고 기동하기 위한 퀵스타트 매뉴얼입니다.

---

## 1. 전제 조건 (System Requirements)
- **운영체제**: Rocky Linux 9, RHEL 9, AlmaLinux 9, Ubuntu 22.04/24.04 LTS, Amazon Linux 2023
- **시스템 사양**: 최소 4 vCPU, 8GB RAM, 50GB 여유 디스크 공간
- **필수 런타임**:
  - `docker` (v24.0 이상)
  - `docker compose` (v2.20 이상)
  - `make` 및 `tar`

---

## 2. 3단계 초고속 설치 (3-Step Quick Start)

### Step 1: 무결성 및 위변조 검증 (선택/권고)
```bash
bash verify-release.sh
```
*출력 결과에 `Verified OK` 및 `Checksum: MATCHED`가 표시되는지 확인합니다.*

### Step 2: 아카이브 압축 해제
```bash
tar -xzf ordinatio-appliance-v1.0.0.tar.gz
cd ordinatio-appliance
```

### Step 3: 원클릭 서비스 기동
```bash
make up
```
*내부적으로 오프라인 Docker 이미지를 로드(`docker load`)하고 컨테이너 5종을 백그라운드로 실행하며 헬스체크를 완료합니다.*

---

## 3. 접속 정보 및 서비스 포트

| 구성 요소 | 접속 URL / 엔드포인트 | 비고 |
| :--- | :--- | :--- |
| **관리 콘솔 (Web UI)** | `http://<서버IP>:5173` | 초기 계정: `admin` / `admin1234!` |
| **L7 AI Gateway** | `http://<서버IP>:8080/v1/chat/completions` | Envoy 기반 고속 지능형 라우팅 |
| **제어 평면 API (FastAPI)** | `http://<서버IP>:8000/api/v1` | Swagger API Docs: `/docs` |
| **PostgreSQL DB** | `localhost:5432` | 내부 메타데이터 저장소 |
| **Redis Cache** | `localhost:6379` | 토큰 버킷 레이트 리미팅 및 캐시 |

---

## 4. 일상 운영 및 관리 명령어

모든 운영은 `ordinatio-appliance` 디렉터리 내 `Makefile`을 통해 단일 명령어로 수행됩니다:

```bash
make status       # 전체 5대 컨테이너 상태 및 헬스체크 조회
make logs         # 실시간 통합 로그 스트리밍
make down         # 서비스 안전 정지
make backup-db    # PostgreSQL 메타데이터 백업 (SQL 덤프 생성)
make init-admin   # 관리자 패스워드 재설정 (make init-admin ARGS="--username admin --password 새비밀번호")
```
