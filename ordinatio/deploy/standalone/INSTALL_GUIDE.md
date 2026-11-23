# Ordinatio Standalone 어플라이언스 설치 및 운영 매뉴얼 (Installation & Operations Guide)

본 문서는 **Red Hat 호환 계열 리눅스(RHEL 9, Rocky Linux 9, AlmaLinux 9, Oracle Linux 9, CentOS Stream 9)** 단일 호스트 환경에서 **Ordinatio (ordinatio)**를 설치하고 운영하기 위한 공식 통합 설치 매뉴얼입니다.

---

## 📌 목차
1. [시스템 사전 요구사항 (Stage 1 ~ Stage 3)](#1-시스템-사전-요구사항-stage-1--stage-3)
2. [어플라이언스 자동 설치 실행 (Stage 4 ~ Stage 7)](#2-어플라이언스-자동-설치-실행-stage-4--stage-7)
3. [설치 완료 후 접속 및 헬스 확인](#3-설치-완료-후-접속-및-헬스-확인)
4. [어플라이언스 수명주기 운영 관리 (ordinatio-ctl)](#4-어플라이언스-수명주기-운영-관리-ordinatio-ctl)
5. [Vagrant 가상머신 테스트 환경 구동](#5-vagrant-가상머신-테스트-환경-구동)
6. [트러블슈팅 및 비상 복구](#6-트러블슈팅-및-비상-복구)

---

## 1. 시스템 사전 요구사항 (Stage 1 ~ Stage 3)

설치 스크립트(`install.sh`)를 실행하기 전, 호스트 서버(`root` 또는 `sudo` 권한)에 다음 설정을 사전에 완료해야 합니다.

### 1.1 하드웨어 및 OS 권장 사양
- **지원 OS**: RHEL 9.x, Rocky Linux 9.x, AlmaLinux 9.x, Oracle Linux 9.x, CentOS Stream 9
- **CPU**: 최소 2 Cores (권장 4 Cores 이상)
- **Memory**: 최소 4 GB (권장 8 GB ~ 16 GB)
- **Disk**: `/opt` 파티션 여유 공간 최소 15 GB 이상 (권장 50 GB SSD)

### 1.2 필수 패키지 설치
```bash
sudo dnf install -y curl tar gzip jq procps-ng net-tools git openssl
```

### 1.3 방화벽(firewalld) 포트 개방
외부 서비스 접점 포트 4개를 방화벽에 등록합니다:
```bash
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-port=80/tcp    # 어드민 웹 대시보드
sudo firewall-cmd --permanent --add-port=8000/tcp  # 백엔드 REST API / Swagger
sudo firewall-cmd --permanent --add-port=8080/tcp  # Envoy L7 AI Gateway Ingress
sudo firewall-cmd --permanent --add-port=9901/tcp  # Envoy Admin / Prometheus 메트릭
sudo firewall-cmd --reload
```
> [!NOTE]
> PostgreSQL(5432) 및 Redis(6379)는 단일 호스트 내부 루프백(`127.0.0.1`) 전용으로 격리되므로 외부 방화벽 포트를 개방할 필요가 없습니다.

### 1.4 SELinux 보안 정책 설정
```bash
# 컨테이너의 cgroup 제어 허용
sudo setsebool -P container_manage_cgroup 1 2>/dev/null || true

# 어플라이언스 데이터 디렉토리 생성 및 컨테이너 레이블 적용
sudo mkdir -p /opt/ordinatio/data
sudo chcon -Rt svirt_sandbox_file_t /opt/ordinatio/data 2>/dev/null || true
```

### 1.5 Docker Engine 및 Docker Compose 플러그인 설치
- **인터넷 연결 환경 (공식 리포지토리)**:
  ```bash
  sudo dnf install -y yum-utils
  sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo systemctl enable --now docker
  ```
- **100% 폐쇄망(Air-Gapped) 환경**:
  ```bash
  sudo dnf localinstall -y /path/to/offline-rpms/*.rpm
  sudo systemctl enable --now docker
  ```

---

## 2. 어플라이언스 자동 설치 실행 (Stage 4 ~ Stage 7)

사전 요구사항이 준비되었으면 프로젝트의 standalone 배포 디렉토리에서 설치를 진행합니다.

### 2.1 환경설정 파일(install.conf)을 통한 선언적 무인 설치 (강력 권장)
보안 정책상 명령행 인자에 비밀번호나 네트워크 IP를 노출하지 않고 파일 기반으로 안전하게 설치합니다:
```bash
cd /path/to/ordinatio

# 1. 템플릿 복사 및 현장 환경에 맞춰 설정 편집 (권한 600 적용)
cp ./deploy/standalone/install.conf.example ./install.conf
chmod 600 ./install.conf
vi ./install.conf

# 2. install.conf 기반 무인 설치 실행
sudo ./deploy/standalone/install.sh --auto-approve
# (또는 별도 경로의 설정 파일 지정 시)
# sudo ./deploy/standalone/install.sh --config /root/prod-ordinatio.conf --auto-approve
```

### 2.2 CLI 옵션 기반 무인 자동 설치
```bash
# 슈퍼관리자 비밀번호를 직접 지정하여 무인 설치
sudo ./deploy/standalone/install.sh --auto-approve --admin-password "MyStrongPass123!"

# (또는) 비밀번호를 자동 무작위 생성하여 무인 설치
sudo ./deploy/standalone/install.sh --auto-approve
```

### 2.3 대화형 설치
```bash
sudo ./deploy/standalone/install.sh
```

#### 스크립트 내부 자동 수행 단계
1. **[Safety Guard]**: Docker 데몬 구동 및 포트 충돌 비침습 검증
2. **[Step 1]**: `/opt/ordinatio/` 레이아웃 생성 및 `openssl` 기반 32바이트 보안 시크릿(.env) 자동 주입
3. **[Step 2]**: 오프라인 이미지 아카이브(`ordinatio-standalone-images.tar.gz`) 로드 또는 로컬 빌드
3. **[Step 2]**: Docker Hub 공식 이미지 다운로드(`keikun808/ordinatio-backend:0.1.4`, `keikun808/ordinatio-frontend:0.1.4`), 오프라인 이미지 로드 또는 로컬 빌드
4. **[Step 3]**: PostgreSQL/Redis 헬스 대기, DDL 마이그레이션, 슈퍼관리자(`admin@ordinatio.local`) 발급
5. **[Step 4]**: `/etc/systemd/system/ordinatio.service` 등록, 자동 시작 활성화 및 엔드포인트 헬스 검증

---

## 3. 설치 완료 후 접속 및 헬스 확인

설치가 완료되면 화면에 접속 안내 카드가 출력됩니다:

- 🌐 **어드민 웹 콘솔**: `http://<호스트-IP>:80` (또는 `http://localhost/`)
- ⚙️ **백엔드 REST API**: `http://<호스트-IP>:8000`
- 🚪 **Envoy AI Gateway**: `http://<호스트-IP>:8080`
- 📊 **Envoy 메트릭**: `http://<호스트-IP>:9901/stats`
- 🔐 **초기 슈퍼관리자 계정**:
  - 아이디: `admin@ordinatio.local`
  - 비밀번호: 설치 완료 화면에 출력된 비밀번호 (또는 지정한 비밀번호)

---

## 4. 어플라이언스 수명주기 운영 관리 (ordinatio-ctl)

호스트 터미널 어디서나 `/usr/local/bin/ordinatio-ctl` 명령어로 전체 스택을 제어할 수 있습니다:

```bash
# 1. 전체 컨테이너 상태, 포트 점유, CPU/메모리 실시간 리소스 확인
ordinatio-ctl status

# 2. 전체 어플라이언스 스택 중지 (데이터 보존)
ordinatio-ctl stop

# 3. 전체 어플라이언스 스택 시작
ordinatio-ctl start

# 4. 전체 스택 재기동
ordinatio-ctl restart

# 5. 실시간 로그 확인 (특정 서비스만 보려면: ordinatio-ctl logs -f backend)
ordinatio-ctl logs -f

# 6. 3대 핵심 헬스체크 프로빙 즉시 검증
ordinatio-ctl verify

# 7. 슈퍼관리자 비밀번호 재설정
ordinatio-ctl reset-admin

# 8. PostgreSQL 데이터베이스 및 WORM 감사 로그 암호화 백업
ordinatio-ctl backup
```

---

## 5. Vagrant 가상머신 테스트 환경 구동

개발 및 테스트 환경에서는 Vagrant를 통해 실제 Rocky Linux 9 가상머신을 생성하여 원클릭으로 설치를 검증할 수 있습니다:

```bash
cd ordinatio/deploy/vagrant

# 기본 Rocky Linux 9 Standalone VM 기동 및 자동 프로비저닝
vagrant up

# (선택) AlmaLinux 9 환경으로 기동 시
EL_DISTRO=almalinux/9 vagrant up

# VM 내부 쉘 접속
vagrant ssh
```
호스트 PC의 웹 브라우저에서 `http://localhost:8080`(어드민 대시보드)으로 즉시 접속 가능합니다.

---

## 6. 트러블슈팅 및 비상 복구

### Q1. 포트가 이미 사용 중이라는 오류가 발생합니다.
- `sudo ss -tulpn | grep -E ':(80|8000|8080|9901)\b'` 명령으로 기존 웹 서버(Nginx/Apache)나 타 프로세스가 포트를 점유 중인지 확인하고 중지하십시오.

### Q2. 슈퍼관리자 비밀번호를 분실했습니다.
- 호스트 터미널에서 `sudo ordinatio-ctl reset-admin`을 실행하면 대화형으로 새 비밀번호를 즉시 재설정할 수 있습니다.

### Q3. 컨테이너 볼륨 권한 오류가 발생합니다.
- SELinux 컨테이너 볼륨 레이블을 재적용하십시오:
  ```bash
  sudo chcon -Rt svirt_sandbox_file_t /opt/ordinatio/data
  ```

---

## 7. 어플라이언스 삭제 및 초기화 (Uninstall)

어플라이언스를 호스트에서 제거하거나 초기화할 때는 아래 3가지 방법 중 하나를 사용할 수 있습니다:

### 7.1 표준 삭제 (데이터 보존 모드)
서비스 및 컨테이너, Systemd 유닛, 호스트 CLI 링크를 정리하되, 데이터베이스 및 감사 로그(`/opt/ordinatio/data`)는 보존합니다:
```bash
# 방법 1: 전용 언인스톨 스크립트 실행
sudo ./deploy/standalone/uninstall.sh

# 방법 2: install.sh 스크립트의 --uninstall 옵션 실행
sudo ./deploy/standalone/install.sh --uninstall

# 방법 3: ordinatio-ctl 제어 명령어 사용
sudo ordinatio-ctl uninstall
```

### 7.2 완전 삭제 (Purge 모드 - 데이터 포함 영구 삭제)
모든 서비스뿐만 아니라 데이터 디렉토리(`/opt/ordinatio/`) 및 도커 볼륨까지 영구적으로 완전 삭제합니다:
```bash
# 대화형 확인 프롬프트와 함께 완전 삭제
sudo ./deploy/standalone/uninstall.sh --purge

# 확인 프롬프트 생략 무인 완전 삭제
sudo ./deploy/standalone/uninstall.sh --purge -y

# 또는 ordinatio-ctl 사용
sudo ordinatio-ctl uninstall --purge -y
```

