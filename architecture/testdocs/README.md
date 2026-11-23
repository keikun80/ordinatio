# Ordinatio Test & Verification Documentation Index (testdocs)

본 디렉토리는 Ordinatio의 **통합 기능 테스트 명세, 자동화 검증 계획서, 전 메뉴 E2E 시나리오 및 주요 3대 리눅스 배포판(Rocky Linux 9, Ubuntu 24.04 LTS, Amazon Linux 2023) 가상머신 오프라인 설치 실증 검증 보고서**를 통합 보관합니다.

---

## 🗂️ 테스트 문서 전체 인덱스

| 구분 | 문서 파일명 | 문서 핵심 범위 및 검증 내용 | 검증 결과 |
| :---: | :--- | :--- | :---: |
| **통합 E2E 명세** | [PRE_10_INTEGRATED_FUNCTIONAL_TEST_SPEC.md](./PRE_10_INTEGRATED_FUNCTIONAL_TEST_SPEC.md) | **Phase 0~5 통합 기능 테스트 스펙**<br>- 백엔드 REST API 구현 정합성 전수 판정표<br>- 프론트엔드 대화형 UI 요소 및 컬러 매핑 전수 점검 명세 | **완료** |
| **Make 타겟 검증** | [PRE_21_make_commands_test_plan.md](./PRE_21_make_commands_test_plan.md) | **전체 Make 명령어 테스트 계획서**<br>- 3계층(로컬 CLI, Docker Compose, Kubernetes) 33개 타겟 테스트 계획 | **계획 완료** |
| **Make 타겟 결과** | [PRE_22_make_commands_test_results.md](./PRE_22_make_commands_test_results.md) | **전체 Make 명령어 테스트 결과 보고서**<br>- 33개 Make 타겟 실환경 전수 검증 및 격리 패치 완료 | **100% PASS**<br>(33/33 Targets) |
| **전 메뉴 E2E** | [PRE_25_all_menus_integrated_test_scenario_and_monitoring_plan.md](./PRE_25_all_menus_integrated_test_scenario_and_monitoring_plan.md) | **8대 전 메뉴 통합 테스트 시나리오 & 자동화 검증**<br>- 8대 전 메뉴(관제홈, 라우팅, 가상키/테넌트, 시스템프롬프트, FinOps, PII보안, 패치, 프롬프트스튜디오) 10단계 E2E 검증 | **100% PASS**<br>(10/10 Steps) |
| **EL9 실증** | [PRE_41_rocky_linux_vagrant_offline_installation_test_results.md](./PRE_41_rocky_linux_vagrant_offline_installation_test_results.md) | **Rocky Linux 9 Vagrant 오프라인 번들 설치 검증 보고서**<br>- `dist/ordinatio-appliance-v1.0.0.tar.gz` 이관 및 `make up` 원스톱 기동 실증<br>- 5대 컨테이너 healthy, UI(5173), API(8000), L7(8080), Admin 로그인 및 DB 백업 완료 | **100% PASS**<br>(Rocky Linux 9) |
| **Ubuntu24 계획** | [PRE_42_ubuntu_24_vagrant_offline_installation_test_plan.md](./PRE_42_ubuntu_24_vagrant_offline_installation_test_plan.md) | **Ubuntu 24.04 LTS Vagrant 오프라인 번들 설치 계획서**<br>- Debian/Ubuntu 계열 5단계 무인 배포 파이프라인 및 패키지/방화벽 구성 계획 | **계획 완료** |
| **Ubuntu24 실증** | [PRE_43_ubuntu_24_vagrant_offline_installation_test_results.md](./PRE_43_ubuntu_24_vagrant_offline_installation_test_results.md) | **Ubuntu 24.04 LTS Vagrant 오프라인 번들 설치 검증 보고서**<br>- Ubuntu 24.04.3 LTS 환경 `make up` 무인 기동 실증<br>- 백엔드 포트(0.0.0.0:8000) 및 동일 오리진 프록시(/api/v1) 정상 동작 검증 | **100% PASS**<br>(Ubuntu 24.04) |
| **AL2023 실증** | [PRE_44_amazon_linux_2023_vagrant_offline_installation_test_results.md](./PRE_44_amazon_linux_2023_vagrant_offline_installation_test_results.md) | **Amazon Linux 2023 Vagrant 오프라인 번들 설치 검증 보고서**<br>- Amazon Linux 2023.9 환경 `make up` 무인 기동 실증<br>- curl-minimal 호환, Docker CLI 플러그인, `admin1234!` 일관성 검증 완료 | **100% PASS**<br>(AL2023) |
| **소스코드 실구현 정합화** | [PRE_50_source_code_analysis_and_test_suite_alignment_report.md](./PRE_50_source_code_analysis_and_test_suite_alignment_report.md) | **소스코드 전수 분석 기반 실제 구현 정합화 및 테스트 스위트 전면 현행화 보고서**<br>- 레디니스 DB/Redis 지연시간, Zero-PII 서포트번들, 시맨틱 캐시 hit_rate_pct, TokenRateLimiter 폴백, 실가상키 502 핸들링 검증 완료 | **100% PASS**<br>(114/114 Tests) |

---

## 🚀 자동화 테스트 실행 명령어 퀵 레퍼런스

```bash
# 1. 8대 전 메뉴 통합 시나리오 자동 검증 (10단계)
cd ordinatio && make verify-all-menus

# 2. RBAC/PBAC 권한 통제 시나리오 검증 (API 193건 + UI 80건)
cd ordinatio && make verify-rbac-scenarios

# 3. 오프라인 단일 tar.gz 번들 빌드 및 로컬 무결성 검증
cd ordinatio && make prod-build && make verify-offline-bundle

# 4. Vagrant 기반 타깃 가상머신별 무인 오프라인 설치 테스트
cd ordinatio/deploy/vagrant
OS_DISTRO=bento/rockylinux-9 vagrant up      # Rocky Linux 9 테스트
OS_DISTRO=bento/ubuntu-24.04 vagrant up      # Ubuntu 24.04 LTS 테스트
OS_DISTRO=bento/amazonlinux-2023 vagrant up  # Amazon Linux 2023 테스트
```

