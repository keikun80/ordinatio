# PRE-17: LLM 서빙 모델 Provider 규격화 및 동적 엔드포인트 URL 조합기 구현 보고서

## 1. 개요 및 목적 (Overview & Goals)
고객사 에어갭 및 하이브리드 환경에서 다양한 LLM 서빙 런타임(OpenAI 표준 호환, DeepSeek 전용, Anthropic Claude, Google Gemini, Cohere 등)을 유연하고 안전하게 통합할 수 있도록 서빙 모델 풀 등록/수정 모달 UX 및 백엔드 프록시 라우팅 엔진을 고도화하였습니다.

사용자가 기본 도메인(Base Domain/Host)을 입력하고 지원 모델 규격(Provider)을 선택하면 규격에 부합하는 엔드포인트 URL 경로(`target_endpoint`)를 실시간으로 자동 조립하고, 백엔드의 임의 경로 정규화/스트리핑 조치를 완전 롤백하여 관리자가 지정한 정확한 타깃 엔드포인트로 무결하게 프록시 호출을 전달하도록 개선하였습니다.

---

## 2. 핵심 변경 및 엔지니어링 내역 (Key Engineering Updates)

### 2.1 백엔드 임의 URL 정규화/스트리핑 롤백 및 타깃 엔드포인트 직접 호출 보장
- **배경**: 이전 조치에서 `/v1/chat/completions` 접미사를 임의로 분리/유추하여 헬스체크 및 호출 시 타깃 경로가 변형되는 문제가 발생함.
- **조치**:
  - `models.py` 및 `gateway.py`에서 엔드포인트 경로를 임의로 슬라이싱하거나 변환하던 로직 완전 롤백.
  - 관리자가 입력/저장한 완성된 `target_endpoint`를 최우선으로 정확하게 직접 호출하도록 확정.
  - Anthropic 등 비호환 Provider 호출 시 필요한 필수 전송 헤더(`anthropic-version: 2023-06-01`, `x-api-key`) 동적 주입 로직 연동.

### 2.2 6종 LLM Provider 규격 지원
| Provider | 표시 이름 | 지원 API 규격 접미사 (Path Suffix) | 호환성 여부 | 설명 |
| :--- | :--- | :--- | :---: | :--- |
| `openai` | OpenAI 호환 표준 | `/v1/chat/completions` | **호환** | OpenAI 표준 규격 (vLLM, Ollama, NIM 등 호환) |
| `deepseek` | DeepSeek API | `/chat/completions` | **공식** | DeepSeek 공식 API 규격 엔드포인트 |
| `anthropic` | Anthropic Claude | `/v1/messages` | **비호환** | Claude Messages API 규격 |
| `gemini` | Google Gemini | `/v1beta/models/{model_id}:generateContent` | **비호환** | Google Gemini REST API 규격 |
| `cohere` | Cohere Command | `/v2/chat` | **비호환** | Cohere v2 Chat API 규격 |
| `custom` | 직접 지정 (Custom) | *(사용자 정의)* | **사용자 지정** | 사내 레거시 및 커스텀 게이트웨이 전용 |

### 2.3 프론트엔드 동적 엔드포인트 URL 조합기 (Dynamic URL Builder)
- **UI/UX 개선**:
  - 서빙 런타임 엔진, 실행 환경, 배포 인프라 등 서비스와 무관한 3개 불필요 필드 제거 (선택지 간소화).
  - 6종 Provider 선택 세그먼트 버튼 그리드(색상 및 비호환 배지 적용).
  - 베이스 도메인 입력 필드(`base_domain`)와 실시간 조합된 완성 URL(`target_endpoint`) 확인 및 미세 조정 필드 구성.
- **실시간 반응형 연동**:
  - 베이스 도메인을 입력하거나 Provider 버튼을 클릭하면 `buildEndpointUrl(domain, provider, model_id)` 유틸리티가 실시간으로 최종 엔드포인트 URL을 합성하여 프리뷰 및 입력 필드에 반영.
  - 모델 수정 시에도 기존 URL에서 도메인과 Provider를 역추출(`extractDomainAndProvider`)하여 모달에 자동 로드.

### 2.4 DB 스키마 및 백엔드 확장
- **DB 테이블**: `model_catalogs` 테이블에 `provider VARCHAR(32) DEFAULT 'openai'` 컬럼 추가.
- **Pydantic 스키마 & ORM**: `ModelCatalogBase`, `ModelCatalogUpdate`, `ModelCatalogResponse`, `ModelHealthCheckResult`에 `provider` 필드 추가.
- **헬스체크 연동**: Provider 유형에 따라 적절한 헬스체크 프로브 경로 자동 분기 (`openai` ➔ `/v1/models`, `deepseek` ➔ `/models`, `gemini` ➔ `/v1beta/models`, `cohere` ➔ `/v2/models` 등).

---

## 3. 검증 결과 (Verification Results)

### 3.1 백엔드 단위 및 통합 테스트
- `cd aiorche/backend && uv run pytest`
- **결과**: **66 passed** (100% 통과, 무결성 검증 완료)

### 3.2 브라우저 E2E 검증
- **검증 환경**: Playwright Headless Chromium (`http://localhost:5173/`)
- **검증 시나리오**:
  1. 서빙 모델 풀 테이블에서 각 모델별 Provider 배지(OpenAI 등) 표시 확인.
  2. 신규 등록 모달에서 Provider 6종 버튼 클릭 시 URL 접미사(`/v1/chat/completions`, `/chat/completions`, `/v1/messages`, `/v1beta/models/...`, `/v2/chat`) 동적 결합 확인.
  3. 도메인 입력(`https://my-internal-llm.corp.local`)에 따른 실시간 최종 URL 완성 검증.
  4. 수정 모달에서도 Provider 규격 선택 및 도메인 동기화 정상 작동 확인.
- **증적 스크린샷**:
  - `model_provider_modal_1790259608160.png`

---

## 4. 결론 및 향후 계획
- 사용자가 도메인만 입력하면 원하는 LLM 규격의 엔드포인트를 직관적으로 자동 완성할 수 있는 UX가 완비되었습니다.
- OpenAI 비호환 모델(Claude, Gemini, Cohere)의 경우 게이트웨이 파이프라인에서 요청/응답 페이로드 변환 어댑터(ext_proc 또는 Gateway Middleware)와 연계할 수 있는 기반이 확립되었습니다.
