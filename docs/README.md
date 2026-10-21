# AI Orchestrator Appliance — 공식 사용자 매뉴얼 & 문서 저장소 (`docs/`)

> **문서 버전**: v2.4 (Phase 0 ~ Phase 5 상용 배포, 8대 거버넌스 메뉴 및 고해상도 스크린샷 30종 전면 현행화)  
> **최종 갱신일**: 2026-09-26  
> **운영 환경**: 100% 폐쇄망 (Air-Gapped) 온프레미스 자율 운영 어플라이언스  

---

## 1. 개요 (Overview)

본 디렉토리(`docs/`)는 금융·공공·엔터프라이즈 고객사의 IT/보안/FinOps 운영팀에게 배포되는 **AI Orchestrator Appliance 공식 사용자 매뉴얼, 온프레미스 설치 가이드 및 시각적 운영 증적 자산**을 보관하는 독립형 문서 저장소입니다.

외부 인터넷 연결(CDN, 외부 폰트, 원격 텔레메트리 등)이 완전히 차단된 **100% 에어갭 폐쇄망 환경**에서도 브라우저를 통해 즉시 열람할 수 있도록 독립형(Self-Contained) 단일 HTML 매뉴얼과 최신 웹 콘솔 고해상도 스크린샷 자산으로 구성되어 있습니다.

---

## 2. 문서 및 디렉토리 구조 (Directory Structure)

```text
docs/
├── README.md               # [본 문서] docs 디렉토리 안내 및 매뉴얼 활용 가이드
├── proposal.html           # [신규] 고객사 의사결정권자(CIO/CISO/기획팀) 대상 공식 도입 제안서 & 기술 백서 (HTML)
├── index.html              # 고객사 전달용 독립형 인터랙티브 사용자 매뉴얼 & 설치 가이드 (HTML)
└── images/                 # 웹 콘솔 8대 핵심 메뉴 및 주요 조작 모달 고해상도 스크린샷 (30종)
    ├── 01_overview_main.png                      # 글로벌 관제 홈 & 실시간 WebSocket 메트릭
    ├── 02_routing_main.png                       # 서빙 모델 풀 현황 및 전체 헬스체크(Ping All)
    ├── 02_routing_modal_add_model.png            # 신규 모델 등록 & Provider 규격화 모달
    ├── 02_routing_compute_target_select.png       # 온프레미스 표준 인프라 규격 드롭다운
    ├── 02_routing_modal_edit_policy.png          # AgentRouter 지능형 정책 실시간 튜닝 모달
    ├── 02_routing_modal_add_rule.png             # 신규 동적 라우트 생성 & 테넌트 멀티셀렉트 모달
    ├── 03_virtual_keys_main.png                  # 거버넌스 부서 테넌트 & 가상 API Key 목록
    ├── 03_governance_modal_add_department.png    # 신규 부서(테넌트) 등록 모달
    ├── 03_virtual_keys_modal_issue_key.png       # sk-orch- 가상 API Key 발급 마법사
    ├── 08_system_prompts_main.png                # 시스템 프롬프트 거버넌스 카탈로그 & KPI 대시보드
    ├── 08_system_prompts_modal_add.png           # 신규 시스템 프롬프트 등록 & 다계층 바인딩 모달
    ├── 08_system_prompts_simulator.png           # 실시간 L7 프롬프트 주입 시뮬레이터 검증 모달
    ├── 04_finops_main.png                        # FinOps 부서별 토큰 계량 & 비용 예산 관제
    ├── 05_compliance_main.png                    # PII 보안 & 3단계(MASK/HASH/BLOCK) 액션
    ├── 05_compliance_modal_add_rule.png          # 자체 정규식 PII 보안 룰 빌더
    ├── 05_compliance_presidio_presets.png        # 한국 금융/개인정보 표준 프리셋
    ├── 05_compliance_presidio_simulator.png      # 실시간 PII 마스킹 시뮬레이터
    ├── 05_compliance_audit_search_filter.png     # WORM 불변 감사로그 포렌식 검색
    ├── 06_lifecycle_main.png                     # 긴급 보안 패치 & 무중단 롤링 배포
    ├── 06_lifecycle_patch_loaded.png             # RSA-4096 전자서명 무결성 검증 완료
    ├── 06_lifecycle_patch_deployed.png           # 4단계 무중단 롤링 핫픽스 배포 성공
    ├── 06_lifecycle_diagnostics.png              # 5대 핵심 인프라 Preflight 자가진단
    ├── 07_prompt_studio_main.png                 # 개발자 전용 프롬프트 테스트 스튜디오
    ├── 07_prompt_studio_response.png             # 실시간 LLM 추론 응답 및 레이턴시 뷰어
    ├── cleaned_overview.png                      # Mock 데이터 제거 후 순수 DB 연동 관제 홈
    ├── cleaned_compliance.png                    # 순수 DB 연동 WORM 감사로그 화면
    ├── test_call_502_error.png                   # LLM 미응답 시 게이트웨이 HTTP 502 피드백
    ├── test_call_502_scrolled.png                # HTTP 502 상세 스택 추적 증적
    ├── theme_dark_mode.png                       # 기본 다크 슬레이트 테마 콘솔
    └── theme_light_mode.png                      # 엔터프라이즈 라이트 테마 콘솔
```

---

## 3. 매뉴얼 열람 방법 (How to View)

### 3.1 로컬 파일 직접 열람 (Offline Standalone)
외부 인터넷 연결 없이 웹 브라우저(Chrome, Safari, Edge, Firefox 등)로 직접 열람할 수 있습니다:
```bash
# macOS
open docs/index.html

# Linux
xdg-open docs/index.html
```

### 3.2 사내 인트라넷 경량 웹 서버 호스팅 (Optional)
사내망 내부 운영팀 공유를 위해 내장 파이썬 모듈로 간편하게 호스팅할 수 있습니다:
```bash
# docs 디렉토리를 루트로 8080 포트 서비스 실행
python3 -m http.server 8080 --directory docs

# 브라우저 접속: http://<서버_IP>:8080/
```

---

## 4. 공식 도입 제안서 & 기술 백서 (`proposal.html`)

고객사 의사결정권자(CIO, CISO, CDO, IT 인프라/보안/FinOps 총괄 및 기획 부서)를 위한 **엔터프라이즈 AI 통합 거버넌스 어플라이언스 도입 제안서**입니다.

1. **전사 AI 3대 위기 및 도입 필요성**:
   - 데이터 유출 및 망분리 규제(전자금융감독규정, 개인정보보호법) 위반 위협
   - GPU 인프라 및 토큰 비용 폭증 (FinOps 통제 부재)
   - API Key 평문 노출 및 비인가 모델 무단 호출
2. **에어갭 어플라이언스 이중 계층(Tiered) 아키텍처**:
   - Envoy L7 C++ (Zero-Copy SSE) 초저지연 데이터 플레인 + FastAPI REST RDS v3 + AgentRouter 코그너티브 제어 평면
   - Shared Responsibility Model (고객 100% 자율 제어 vs 벤더 오프라인 패치 공급)
3. **8대 핵심 거버넌스 역량 및 고해상도 실제 스크린샷 갤러리**:
   - AgentRouter 4대 자율 라우팅, 멀티 서빙 엔진/6종 Provider 카탈로그, Argon2id 가상 API Key, 동적 시스템 프롬프트 L7 인라인 주입, FinOps 예산 하드캡(Fail-Fast), 인라인 PII 마스킹 & WORM 감사, RSA-4096 오프라인 핫픽스, 1초 WebSocket 관제 홈
4. **글로벌 솔루션 심층 비교 분석**:
   - AI Orchestrator vs LiteLLM Proxy vs Kong AI Gateway vs Envoy AI Gateway 다차원 평가 매트릭스
5. **실시간 인터랙티브 ROI 계산기 (Interactive ROI Calculator Widget)**:
   - 사내 월간 AI 호출량, 고성능 모델 의존율, 월간 지출을 슬라이더로 조절하여 연간 예상 절감액(최대 60%)과 투자 회수 기간 실시간 산출
6. **3단계 도입 및 확장 로드맵 (Roadmap)**:
   - PoC (2주) → 핵심 부서 파일럿 (4주) → 전사 확대 및 정착 가이드
   - 권장 온프레미스 인프라 사양 및 연동 인터페이스

---

## 5. 매뉴얼 주요 수록 내용 (`index.html`)

1. **아키텍처 및 100% 에어갭 운영 원칙**:
   - 외부 종속성 제로 로컬 번들링 아키텍처 및 폐쇄망 라이선스 자립성
2. **온프레미스 설치 가이드 (Installation Guide)**:
   - 시스템 사양 요건 (최소 4 Core, 16GB RAM, 100GB NVMe)
   - Docker / Docker-Compose 및 Kubernetes (k8s) 배포 절차
   - `.env` 설정 가이드 및 시크릿 키 관리
3. **8대 핵심 거버넌스 메뉴 상세 매뉴얼**:
   - **글로벌 관제 홈**: 1초 주기 WebSocket 메트릭, GPU 클러스터 히트맵, 시스템 상태 지표
   - **모델 & 라우팅 스튜디오**: 6종 Provider 규격화, 헬스체크 타임아웃 수동 조절, 라우트 정책 인라인 편집, 테넌트 멀티셀렉트 드롭다운, 커스텀 하위 경로(`/v1/tech/chat/completions`), 전체 LLM 일괄 동시 테스트(Test All Linked LLMs)
   - **거버넌스 (부서 테넌트 & API Key)**: 신규 부서(테넌트) 등록, `sk-orch-` 가상 API Key 발급, Argon2id 해싱, 1회성 시크릿 노출, 테넌트 쿼터, 키 즉시 파기(Revoke) 및 영구 삭제(Purge)
   - **시스템 프롬프트 거버넌스**: 전사/테넌트/라우트/가상키 4단계 바인딩 우선순위, 3대 주입 모드(PREPEND/APPEND/OVERRIDE), 실시간 L7 주입 시뮬레이터
   - **FinOps 비용 & 예산**: 부서별 실시간 토큰(Prompt/Completion/Total) 미터링 및 USD 과금 집계, 80% 조기경보, 100% Hard Cap 차단, UTF-8 BOM CSV 청구서 내보내기
   - **PII 보안 & 감사 포렌식**: MASK/HASH/BLOCK 정규식 엔진, WORM 불변 감사로그 적재 및 검색 필터
   - **긴급 패치 & 자가진단**: RSA-4096 서명 검증, 무중단 4단계 롤링 패치, 5대 인프라 Preflight 자가진단
   - **프롬프트 스튜디오**: 인앱 엔드포인트 직접 추론 및 Side-by-Side 마스킹 대조 분석
4. **문제 해결 및 FAQ (Troubleshooting)**:
   - 포트 충돌, 429 Too Many Requests, 패치 서명 불일치, 게이트웨이 404/no healthy upstream, 로컬 LLM 컨테이너(gemma2:2b 등) 포트 매핑 엔드포인트 연동, 커스텀 라우트 경로 해석 원리, FinOps 부서 토큰/비용 갱신 문제 해결 가이드 수록

---

## 5. 관련 상위 엔지니어링 문서 연계

| 문서명 | 파일 경로 | 주요 내용 |
| :--- | :--- | :--- |
| **대시보드 상세 설계서** | [`admin_dashboard_design.md`](../admin_dashboard_design.md) | 어드민 콘솔 UI/UX 와이어프레임, API 스펙 및 데이터 모델 (v2.3) |
| **차세대 개발 마일스톤** | [`Develop_milestone.md`](../Develop_milestone.md) | M6~M8 차세대 기능 로드맵 및 우선순위 매트릭스 (v2.2) |
| **종합 총괄 보고서** | [`architecture/PRE_12_PHASE_0_TO_5_COMPREHENSIVE_REPORT.md`](../architecture/PRE_12_PHASE_0_TO_5_COMPREHENSIVE_REPORT.md) | Phase 0~5 전체 구현 성과, 66개 테스트 증적, ADR 의사결정 기록 |
| **엔지니어링 갭 분석서** | [`architecture/PRE_13_GAP_ANALYSIS_PHASE_0_TO_5.md`](../architecture/PRE_13_GAP_ANALYSIS_PHASE_0_TO_5.md) | 마스터 계획서 대비 구현율(100%) 및 미구현 요소 정밀 분석 |
| **헬스체크 타임아웃 보고서** | [`architecture/PRE_18_model_health_check_timeout_report.md`](../architecture/PRE_18_model_health_check_timeout_report.md) | 헬스체크 타임아웃 수동 조절 기능 구현 및 66개 테스트 통과 증적 |
