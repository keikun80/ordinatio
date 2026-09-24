# AI Orchestrator Appliance — 공식 사용자 매뉴얼 & 문서 저장소 (`docs/`)

> **문서 버전**: v2.3 (Phase 0 ~ Phase 5 상용 배포 및 백엔드 66/66개 테스트 100% PASS 현행화)  
> **최종 갱신일**: 2026-09-25  
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
├── index.html              # 고객사 전달용 독립형 인터랙티브 사용자 매뉴얼 & 설치 가이드 (HTML)
└── images/                 # 웹 콘솔 7대 핵심 메뉴 및 주요 조작 모달 고해상도 스크린샷 (26종)
    ├── 01_overview_main.png                      # 글로벌 관제 홈 & 실시간 WebSocket 메트릭
    ├── 02_routing_main.png                       # 라우팅 스튜디오 & 4대 자율 라우팅 정책
    ├── 02_routing_modal_add_model.png            # 신규 모델 등록 & 6종 Provider 규격화 모달
    ├── 02_routing_compute_target_select.png       # 온프레미스 표준 인프라 규격 드롭다운
    ├── 02_routing_modal_edit_policy.png          # AgentRouter 정책 실시간 튜닝 모달
    ├── 02_routing_modal_add_rule.png             # 신규 동적 라우트 생성 모달
    ├── 03_virtual_keys_main.png                  # 가상 API Key 거버넌스 & 테넌트 쿼터
    ├── 03_virtual_keys_modal_issue_key.png       # sk-orch- 가상키 발급 마법사
    ├── 04_finops_main.png                        # FinOps 비용 계량 & 80%/100% 한도 관제
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

## 4. 매뉴얼 주요 수록 내용 (`index.html`)

1. **아키텍처 및 100% 에어갭 운영 원칙**:
   - 외부 종속성 제로 로컬 번들링 아키텍처 및 폐쇄망 라이선스 자립성
2. **온프레미스 설치 가이드 (Installation Guide)**:
   - 시스템 사양 요건 (최소 4 Core, 16GB RAM, 100GB NVMe)
   - Docker / Docker-Compose 및 Kubernetes (k8s) 배포 절차
   - `.env` 설정 가이드 및 시크릿 키 관리
3. **7대 핵심 거버넌스 메뉴 상세 매뉴얼**:
   - **글로벌 관제 홈**: 1초 주기 WebSocket 메트릭, GPU 클러스터 히트맵, Grafana 대시보드
   - **모델 & 라우팅 스튜디오**: 6종 Provider 규격화(OpenAI, DeepSeek, Claude, Gemini, Cohere, 직접지정), Dynamic URL 자동 조합기, 헬스체크 타임아웃(1.0s~30.0s) 수동 조절 & localStorage 영속화, 3단 아코디언 메뉴, 실시간 테스트 호출
   - **가상 API Key 거버넌스**: `sk-orch-` 접두사, Argon2id 해싱, 1회성 시크릿 노출, 테넌트 쿼터
   - **FinOps 비용 & 예산**: 원화(₩) 계량, 80% 조기경보, 100% Hard Cap 차단, UTF-8 BOM CSV 청구서
   - **PII 보안 & 감사 포렌식**: MASK/HASH/BLOCK 정규식 엔진, WORM 불변 감사로그 적재
   - **긴급 패치 & 자가진단**: RSA-4096 서명 검증, 무중단 롤링 패치, 5대 인프라 Preflight, Zero-PII ZIP
   - **프롬프트 스튜디오**: 인앱 엔드포인트 직접 추론 및 레이턴시/토큰 계량
4. **문제 해결 및 FAQ (Troubleshooting)**:
   - 헬스체크 타임아웃 발생 시 대처 방안, Envoy xDS 라우팅 동기화 확인, 감사로그 무결성 검증

---

## 5. 관련 상위 엔지니어링 문서 연계

| 문서명 | 파일 경로 | 주요 내용 |
| :--- | :--- | :--- |
| **대시보드 상세 설계서** | [`admin_dashboard_design.md`](../admin_dashboard_design.md) | 어드민 콘솔 UI/UX 와이어프레임, API 스펙 및 데이터 모델 (v2.3) |
| **차세대 개발 마일스톤** | [`Develop_milestone.md`](../Develop_milestone.md) | M6~M8 차세대 기능 로드맵 및 우선순위 매트릭스 (v2.2) |
| **종합 총괄 보고서** | [`architecture/PRE_12_PHASE_0_TO_5_COMPREHENSIVE_REPORT.md`](../architecture/PRE_12_PHASE_0_TO_5_COMPREHENSIVE_REPORT.md) | Phase 0~5 전체 구현 성과, 66개 테스트 증적, ADR 의사결정 기록 |
| **엔지니어링 갭 분석서** | [`architecture/PRE_13_GAP_ANALYSIS_PHASE_0_TO_5.md`](../architecture/PRE_13_GAP_ANALYSIS_PHASE_0_TO_5.md) | 마스터 계획서 대비 구현율(100%) 및 미구현 요소 정밀 분석 |
| **헬스체크 타임아웃 보고서** | [`architecture/PRE_18_model_health_check_timeout_report.md`](../architecture/PRE_18_model_health_check_timeout_report.md) | 헬스체크 타임아웃 수동 조절 기능 구현 및 66개 테스트 통과 증적 |
