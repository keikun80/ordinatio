# Ordinatio Standalone Appliance: 사전 인프라 요구사항 매뉴얼 (Pre-requisites Manual)

본 문서는 **Ordinatio (ordinatio) Standalone 모드**를 설치하기 전, 고객사 인프라 엔지니어가 호스트 서버(물리 서버 또는 가상머신)에 사전 구성해야 하는 공식 엔지니어링 규격 및 시스템 설정 가이드입니다.

---

## 1. 지원 운영체제 및 하드웨어 권장 사양

### 1.1 지원 운영체제 (Enterprise Linux 9 호환 계열)
- **Red Hat Enterprise Linux (RHEL)**: 9.0 이상
- **Rocky Linux**: 9.0 이상
- **AlmaLinux**: 9.0 이상
- **Oracle Linux**: 9.0 이상 (RHCK 및 UEK 지원)
- **CentOS Stream**: 9 이상

### 1.2 하드웨어 리소스 권장 사양
| 리소스 항목 | 최소 사양 (PoC / 테스트용) | 프로덕션 권장 사양 | 설명 |
| :--- | :--- | :--- | :--- |
| **CPU (vCPU)** | 2 Cores | **4 Cores 이상** | FastAPI 비동기 이벤트 루프 및 Envoy ext_proc gRPC 처리 |
| **Memory (RAM)** | 4 GB (가용 3.5GB 이상) | **8 GB ~ 16 GB** | 5대 컨테이너 스택 및 DB 버퍼 캐시 안정 구동 |
| **Storage (Disk)** | 30 GB 여유 공간 | **50 GB ~ 100 GB SSD** | 컨테이너 이미지, WORM 포렌식 로그, DB 영구 볼륨 |
| **Network** | 1 Gbps NIC | **10 Gbps NIC** | L7 AI Ingress 트래픽 대역폭 확보 |

---

## 2. 호스트 인프라 사전 설정 가이드 (Step-by-Step)

모든 명령은 호스트의 `root` 또는 `sudo` 권한이 있는 계정으로 실행합니다.

### 2.1 필수 유틸리티 패키지 설치
호스트 OS 패키지 관리자(`dnf`)를 통해 기본 도구를 설치합니다:
```bash
sudo dnf install -y curl tar gzip jq procps-ng net-tools git openssl
```

### 2.2 방화벽(firewalld) 서비스 포트 개방
외부 클라이언트 및 관리자가 Ordinatio에 접속할 수 있도록 서비스 포트를 개방합니다:
```bash
# firewalld 데몬 기동 및 부팅 시 자동 활성화
sudo systemctl enable --now firewalld

# 인바운드 서비스 포트 영구 등록
sudo firewall-cmd --permanent --add-port=80/tcp    # 어드민 웹 콘솔 (HTTP)
sudo firewall-cmd --permanent --add-port=8000/tcp  # 백엔드 REST API & Swagger UI
sudo firewall-cmd --permanent --add-port=8080/tcp  # Envoy L7 AI Gateway Ingress
sudo firewall-cmd --permanent --add-port=9901/tcp  # Envoy Admin API & Prometheus Stats
sudo firewall-cmd --reload

# 포트 등록 확인
sudo firewall-cmd --list-ports
```

> [!IMPORTANT]
> **데이터베이스(PostgreSQL 5432) 및 캐시(Redis 6379)**는 단일 호스트 내부 루프백(`127.0.0.1`) 전용으로 격리되므로, 보안을 위해 외부 방화벽 포트를 절대 개방하지 마십시오.

### 2.3 SELinux 보안 정책 설정
RHEL 계열의 기본 보안 모듈인 `SELinux (Enforcing)` 상태에서 Docker 컨테이너 볼륨 마운트가 정상 작동하도록 설정합니다:
```bash
# 1. 컨테이너의 cgroup 제어 허용
sudo setsebool -P container_manage_cgroup 1 2>/dev/null || true

# 2. 어플라이언스 전용 데이터 디렉토리 생성 및 SELinux 컨테이너 파일 레이블 적용
sudo mkdir -p /opt/ordinatio/data/{postgres,redis,logs,worm_audit}
sudo chcon -Rt svirt_sandbox_file_t /opt/ordinatio/data 2>/dev/null || true
```

### 2.4 Docker Engine 및 Docker Compose 플러그인 설치

#### Option A: 인터넷 연결이 가능한 환경 (공식 CentOS/RHEL 리포지토리)
```bash
sudo dnf install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Docker 서비스 시작 및 부팅 시 자동 시작 등록
sudo systemctl enable --now docker

# 설치 및 버전 확인
docker info
docker compose version
```

#### Option B: 100% 폐쇄망(Air-Gapped) 환경
사전에 전달된 에어갭 RPM 아카이브 디렉토리에서 로컬 설치를 수행합니다:
```bash
sudo dnf localinstall -y /path/to/offline-rpms/*.rpm
sudo systemctl enable --now docker

docker info
docker compose version
```

---

## 3. 사전 설정 완료 확인 체크리스트

설치 스크립트(`install.sh`)를 실행하기 전 아래 항목이 충족되었는지 확인하십시오:

- [ ] 지원 대상 EL 9 호환 OS 확인 (`cat /etc/os-release`)
- [ ] 최소 RAM 4GB 및 디스크 여유 공간 15GB 이상 확인 (`free -h`, `df -h /opt`)
- [ ] 80, 8000, 8080, 9901 포트의 타 서비스 점유 여부 확인 (`ss -tulpn | grep -E ':(80|8000|8080|9901)\b'`)
- [ ] 방화벽 포트 등록 완료 (`firewall-cmd --list-ports`)
- [ ] Docker 데몬 및 Compose v2 플러그인 정상 구동 확인 (`docker info`, `docker compose version`)

사전 설정이 완료되면, 어플라이언스 설치 디렉토리에서 **`sudo ./install.sh --standalone`**을 실행하십시오.

