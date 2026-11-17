# Ubuntu 24.04 LTS Vagrant 오프라인 어플라이언스 단일 번들 설치 및 검증 계획서 (PRE_42)

## 1. 개요 및 목적
본 계획서는 기존 Rocky Linux 9(RHEL 계열) 가상 머신 테스트 완료에 이어, **Debian/Ubuntu 계열의 최신 표준인 Ubuntu 24.04 LTS (Noble Numbat)** 가상 머신 환경에서 `dist/` 디렉터리의 오프라인 단일 번들(`ordinatio-appliance-v1.0.0.tar.gz`)을 설치하고 `make up` 원클릭 구동 및 전체 서비스 정상성을 검증하기 위한 상세 실행 절차입니다.

---

## 2. 테스트 환경 및 대상 사양

| 구분 | 사양 및 설정 |
| :--- | :--- |
| **호스트 환경** | macOS Intel (`x86_64`), Vagrant v2.4.9, VirtualBox v7.2.20 |
| **가상머신 OS** | **Ubuntu 24.04 LTS (`bento/ubuntu-24.04`, 이미 로컬 캐싱 완료)** |
| **VM 하드웨어** | 4 vCPU, 8192 MB (8GB) RAM |
| **네트워크 구성** | NAT (호스트 포트포워딩: 5173, 8000, 8080, 9901) + 사설 IP (`192.168.56.10`) |
| **패키지 관리** | `apt-get` (Ubuntu 24.04 noble 리포지토리) |
| **컨테이너 런타임**| Docker CE v28+ & Docker Compose Plugin (공식 Ubuntu deb 설치) |
| **보안/방화벽** | UFW 방화벽 (5173, 8000, 8080, 9901) 및 AppArmor 환경 호환성 검증 |

---

## 3. Ubuntu 24.04 LTS 환경에 따른 주요 차이점 및 대응 전략

| 기술 영역 | Rocky Linux 9 (기존) | Ubuntu 24.04 LTS (계획) | 대응 및 구현 방안 |
| :--- | :--- | :--- | :--- |
| **패키지 매니저** | `dnf` / `rpm` | `apt-get` / `dpkg` | `provision.sh`에서 `/etc/os-release`를 자동 감지하여 OS 맞춤형 패키지(`make`, `curl`, `jq` 등) 설치 |
| **도커 설치 저장소** | CentOS/RHEL RPM repo | Ubuntu APT repo (`download.docker.com/linux/ubuntu noble`) | 공식 GPG 키링 등록 및 `noble stable` 아키텍처별 저장소 추가 |
| **보안 모듈** | SELinux | AppArmor | 컨테이너 바인드 마운트 및 cgroup 권한 점검 |
| **방화벽** | `firewalld` (`firewall-cmd`) | `ufw` | `ufw allow 5173,8000,8080,9901/tcp` 또는 iptables 허용 |
| **포트 바인딩 개선** | `127.0.0.1:8000` 이슈 해결 | `0.0.0.0:8000` 기본 적용 | 이전 로그인 결함 수정사항(`0.0.0.0:8000` 및 `/api/v1` 프록시)을 포함한 최신 번들로 테스트 |

---

## 4. 단계별 실행 계획 (5-Step Pipeline)

```
[Step 1: 아티팩트 최신화] ➔ make prod-build 실행 (포트 바인딩/상대경로 패치 반영 최신 tar.gz 생성)
       ▼
[Step 2: 인프라 코드 다변화] ➔ Vagrantfile 기본 박스를 bento/ubuntu-24.04로 설정
       ▼
[Step 3: 프로비저너 OS 분기] ➔ provision.sh에 Ubuntu 24.04 (apt/Docker/ufw) 지원 로직 탑재
       ▼
[Step 4: VM 프로비저닝 & 설치] ➔ vagrant up 실행 (VM 기동 -> 아카이브 추출 -> make up 구동)
       ▼
[Step 5: E2E 서비스 & UI 검증] ➔ 6대 프로브(UI, API, L7, Admin, 로그인, 백업) 및 호스트 브라우저 검증
```

### Step 1: 오프라인 배포 아카이브 재생성 (`make prod-build`)
- 이전 턴에서 수정한 [docker-compose.yml](file:///Users/jason/project/오케스트레이터/ordinatio/deploy/standalone/template/docker-compose.yml)(백엔드 0.0.0.0 포트 개방) 및 [client.js](file:///Users/jason/project/오케스트레이터/ordinatio/frontend/src/api/client.js)(프로덕션 `/api/v1` 프록시)을 반영하여 `dist/ordinatio-appliance-v1.0.0.tar.gz` 재빌드.
- SHA-256 체크섬 재계산.

### Step 2: `Vagrantfile` 설정 업데이트
- `config.vm.box = ENV['OS_DISTRO'] || "bento/ubuntu-24.04"`
- 포트포워딩(5173, 8000, 8080, 9901), 사설망 IP(`192.168.56.10`), 공유 폴더 설정 확인.

### Step 3: `provision.sh` OS 자동 분기 스크립팅
- OS 판별:
  ```bash
  if grep -qi "ubuntu" /etc/os-release; then
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get install -y curl tar gzip jq procps net-tools git openssl make ca-certificates gnupg
      # Docker CE 공식 Ubuntu 저장소 설정 및 설치
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list
      apt-get update -y
      apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
      systemctl enable --now docker
      # 방화벽 허용
      ufw allow 5173/tcp || true
      ufw allow 8000/tcp || true
      ufw allow 8080/tcp || true
      ufw allow 9901/tcp || true
  else
      # 기존 RHEL/Rocky Linux 로직 유지
      ...
  fi
  ```

### Step 4: Ubuntu 24.04 VM 구동 및 `make up` 배포
- `vagrant up --provider=virtualbox` 실행
- 무결성 검증 ➔ `/opt/ordinatio-appliance` 압축 해제 ➔ `make up` 원클릭 스택 가동.

### Step 5: 종합 서비스 프로브 및 브라우저 로그인 검증
- **프로브 1**: `make status` (5개 컨테이너 healthy 확인)
- **프로브 2**: Web Console (`http://localhost:5173`) HTTP 200 응답
- **프로브 3**: Backend Health (`http://localhost:8000/api/v1/health`) HTTP 200 응답
- **프로브 4**: Envoy L7 Gateway (`http://localhost:8080/v1/models`) HTTP 200 응답
- **프로브 5**: 슈퍼관리자 로그인 API (`POST /api/v1/auth/login`) 및 호스트 웹 브라우저 로그인 확인
- **프로브 6**: PostgreSQL 메타데이터 백업 (`make backup`) 생성 확인

---

## 5. 완료 기준 (Definition of Done)
1. 기존 Rocky Linux VM이 완전히 삭제된 상태에서 Ubuntu 24.04 VM이 무결하게 생성되어야 함.
2. `make prod-build`로 생성된 단일 tar.gz 번들이 Ubuntu 24.04 가상머신 내에서 추가 인터넷 연결 없이 `make up`으로 100% 자립 구동되어야 함.
3. 호스트 머신 브라우저(`http://localhost:5173`)에서 UI 접근 및 `admin / admin1234!` 로그인이 지연/오류 없이 즉시 성공해야 함.
4. 모든 테스트 결과 및 증적이 `architecture/PRE_43_ubuntu_24_vagrant_offline_installation_test_results.md`에 문서화되어야 함.

