# PRE-19: 시스템 프롬프트 거버넌스 및 동적 주입 구현 계획서 (System Prompt Governance & Dynamic Injection Plan)

> **문서 상태**: 구현 및 검증 완료 (Implementation Completed & 100% DoD PASS)  
> **구현 완료일**: 2026-09-25  
> **검증 결과서**: [`PRE_20_phase_system_prompt_implementation_and_test_results.md`](./PRE_20_phase_system_prompt_implementation_and_test_results.md)  
> **전체 테스트**: 78 / 78 Passed (Targeted 12 / 12 Passed)  

## 1. 개요 및 배경 (Executive Summary & Background)

본 문서는 폐쇄망(Air-Gapped) 온프레미스 AI 오케스트레이터 환경에서 사내 표준 페르소나, 금융 보안 가드레일, 컴플라이언스 규칙을 LLM 추론 시 자동으로 강제 주입(Auto-Injection)하기 위한 **시스템 프롬프트 거버넌스(System Prompt Governance) 시스템의 소프트웨어 공학적 구현 계획서**입니다.

사내 챗봇, 업무 에이전트, 개발팀 등 다양한 클라이언트가 자체적인 System 프롬프트 없이 요청을 보내거나 표준 가이드라인을 누락하더라도, **L7 AI Gateway(Envoy ext_proc) 및 오케스트레이터 제어 평면**에서 클라이언트의 속성(가상 API Key, 호출 라우트, 소속 테넌트)을 식별하여 적합한 시스템 프롬프트를 자동으로 탐색·합성하여 LLM에 주입합니다.

---

## 2. 핵심 요구사항 및 설계 원칙 (Core Requirements & Principles)

1. **독립적 프롬프트 거버넌스 카탈로그**:
   - 시스템 프롬프트를 개별 속성이 아닌 독립된 관리 엔티티(Catalog)로 관리하여 버전 관리, 활성화/비활성화, 재사용성을 확보합니다.
2. **1:1 유연한 타겟 바인딩 (Scope Binding)**:
   - 등록된 시스템 프롬프트를 **[라우팅 정책 (ROUTE) | 가상 API Key (VIRTUAL_KEY) | 부서/테넌트 (TENANT) | 전사 공통 (GLOBAL)]** 중 하나에 1:1로 유연하게 바인딩할 수 있어야 합니다.
3. **명확한 우선순위 계층 (Precedence Hierarchy)**:
   - 동일 요청에 가상키, 라우트, 테넌트가 동시에 관여할 때 발생하는 충돌을 방지하기 위해 명확한 우선순위(`VIRTUAL_KEY` > `ROUTE` > `TENANT` > `GLOBAL`)를 적용합니다.
4. **다양한 주입 전략 (Injection Mode)**:
   - `PREPEND`: 클라이언트 프롬프트 상단에 배치 (사내 규정 우선 강제, 기본 권장)
   - `OVERRIDE`: 클라이언트의 기존 system 프롬프트를 무시하고 강제 대체 (보안 엄격 모드)
   - `FALLBACK_ONLY`: 클라이언트가 system 프롬프트를 전달하지 않았을 때만 보충 삽입
5. **100% 에어갭 및 오프라인 자립성**:
   - 외부 의존성 없이 로컬 PostgreSQL 및 Envoy ext_proc 스트림 인터셉터를 통해 1ms 미만의 최소 지연(Microsecond overhead)으로 인라인 주입을 수행합니다.

---

## 3. 엔드투엔드 아키텍처 및 데이터 흐름 (End-to-End Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│               AI Orchestrator Admin Console (관리 포털)               │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ 📝 시스템 프롬프트 거버넌스 (SystemPromptsTab.jsx)               │   │
│   │  - 사내 표준 페르소나 및 보안 가드레일 프롬프트 등록 / 관리      │   │
│   │  - 타겟 선택 바인딩: [ ○ 라우팅 정책 | ○ 가상 API Key | ○ 테넌트 ]│   │
│   │  - 주입 모드 선택: PREPEND / OVERRIDE / FALLBACK_ONLY          │   │
│   └────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ REST API CRUD (/api/v1/system-prompts)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       PostgreSQL Database                              │
│             Table: system_prompts (인덱스: target_type, target_id)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 실시간 인메모리 캐시 / 쿼리
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   L7 AI Gateway (Envoy + ext_proc)                     │
│                                                                        │
│  [1. 클라이언트 요청 인입]                                             │
│     POST /v1/chat/completions                                          │
│     Authorization: Bearer sk-orch-dept-wm-...                          │
│     x-orche-route: default-dynamic-route                               │
│     Body: {"messages": [{"role": "user", "content": "대출 한도 조회"}]}│
│                                   │                                    │
│                                   ▼                                    │
│  [2. ExtProcessor / Gateway 미들웨어 해석]                             │
│     - Auth Header ➔ Key Prefix ➔ Virtual Key ID 매핑                   │
│     - Route Header ➔ Route Name 매핑                                   │
│     - Virtual Key ➔ 소속 Tenant ID 매핑                                │
│                                   │                                    │
│     [우선순위 해석기 (Priority Resolver)]                              │
│       1순위: TargetType=VIRTUAL_KEY & TargetId=key_id                 │
│       2순위: TargetType=ROUTE & TargetId=route_name                    │
│       3순위: TargetType=TENANT & TargetId=tenant_id                    │
│       4순위: TargetType=GLOBAL                                         │
│                                   │                                    │
│                                   ▼                                    │
│  [3. 메시지 페이로드 변조 (Payload Mutation)]                          │
│     선택된 프롬프트: "당신은 자산관리부 금융 상담 AI 어시스턴트입니다..."  │
│     최종 Body 합성 (PREPEND 기준):                                     │
│     messages = [                                                       │
│       {"role": "system", "content": "[사내 표준 지침] ..."},            │
│       {"role": "user", "content": "대출 한도 조회"}                    │
│     ]                                                                  │
│                                   │                                    │
│                                   ▼                                    │
│  [4. 업스트림 LLM 서빙 엔진으로 포워딩] (vLLM / Ollama / TGI)           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 데이터베이스 모델 상세 명세 (Database & Schema)

### 4-1. `system_prompts` 테이블 DDL

```sql
CREATE TABLE IF NOT EXISTS system_prompts (
    prompt_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(255),
    content TEXT NOT NULL,
    target_type VARCHAR(32) NOT NULL,       -- 'ROUTE', 'VIRTUAL_KEY', 'TENANT', 'GLOBAL'
    target_id VARCHAR(128),                 -- route_name, key_id, tenant_id (GLOBAL일 경우 NULL)
    target_name VARCHAR(128),               -- UI 표시용 캐시 이름
    injection_mode VARCHAR(32) NOT NULL DEFAULT 'PREPEND', -- 'PREPEND', 'OVERRIDE', 'FALLBACK_ONLY'
    estimated_tokens INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_system_prompts_target ON system_prompts (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_system_prompts_active ON system_prompts (is_active);
```

### 4-2. SQLAlchemy ORM 모델 (`app/models/system_prompt.py`)

```python
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Boolean, Integer, DateTime
from app.db.session import Base

class SystemPrompt(Base):
    __tablename__ = "system_prompts"

    prompt_id = Column(String(64), primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    description = Column(String(255), nullable=True)
    content = Column(Text, nullable=False)
    target_type = Column(String(32), nullable=False, index=True) # ROUTE, VIRTUAL_KEY, TENANT, GLOBAL
    target_id = Column(String(128), nullable=True, index=True)
    target_name = Column(String(128), nullable=True)
    injection_mode = Column(String(32), nullable=False, default="PREPEND")
    estimated_tokens = Column(Integer, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

---

## 5. 백엔드 REST API 명세 (FastAPI Implementation)

엔드포인트 접두사: `/api/v1/system-prompts`

### 5-1. API 목록

| HTTP Method | Endpoint | 설명 | Request Body / Query |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/system-prompts` | 시스템 프롬프트 목록 조회 | `?target_type=ROUTE&is_active=true` |
| `POST` | `/api/v1/system-prompts` | 신규 시스템 프롬프트 등록 | `SystemPromptCreate` JSON |
| `GET` | `/api/v1/system-prompts/{prompt_id}` | 특정 프롬프트 상세 조회 | - |
| `PUT` | `/api/v1/system-prompts/{prompt_id}` | 프롬프트 내용 및 바인딩 수정 | `SystemPromptUpdate` JSON |
| `DELETE` | `/api/v1/system-prompts/{prompt_id}` | 시스템 프롬프트 영구 삭제 | - |
| `POST` | `/api/v1/system-prompts/resolve` | 대상별 적용 프롬프트 시뮬레이션 | `{"key_id": "...", "route_name": "...", "tenant_id": "..."}` |

### 5-2. Pydantic 스키마 (`app/schemas/system_prompt.py`)

```python
from typing import Optional, List, Literal
from datetime import datetime
from pydantic import BaseModel, Field

TargetType = Literal["ROUTE", "VIRTUAL_KEY", "TENANT", "GLOBAL"]
InjectionMode = Literal["PREPEND", "OVERRIDE", "FALLBACK_ONLY"]

class SystemPromptBase(BaseModel):
    name: str = Field(..., max_length=128, example="자산관리 상담 표준 페르소나")
    description: Optional[str] = Field(None, max_length=255)
    content: str = Field(..., example="당신은 금융 AI 상담원입니다. 정확한 금리 정보를 제공하세요.")
    target_type: TargetType = Field(..., example="TENANT")
    target_id: Optional[str] = Field(None, example="dept-wm")
    target_name: Optional[str] = Field(None, example="자산관리(WM)혁신부")
    injection_mode: InjectionMode = Field("PREPEND", example="PREPEND")
    is_active: bool = True

class SystemPromptCreate(SystemPromptBase):
    pass

class SystemPromptUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    target_type: Optional[TargetType] = None
    target_id: Optional[str] = None
    target_name: Optional[str] = None
    injection_mode: Optional[InjectionMode] = None
    is_active: Optional[bool] = None

class SystemPromptResponse(SystemPromptBase):
    prompt_id: str
    estimated_tokens: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class PromptResolveRequest(BaseModel):
    key_id: Optional[str] = None
    route_name: Optional[str] = None
    tenant_id: Optional[str] = None
    input_messages: Optional[List[dict]] = None

class PromptResolveResponse(BaseModel):
    matched: bool
    matched_prompt: Optional[SystemPromptResponse] = None
    resolved_by: Optional[str] = None # 'VIRTUAL_KEY', 'ROUTE', 'TENANT', 'GLOBAL', None
    final_messages: List[dict]
```

---

## 6. L7 인라인 주입 알고리즘 (`app/core/prompt_injector.py`)

```python
def resolve_and_inject_system_prompt(
    db: Session,
    messages: List[Dict[str, Any]],
    key_id: Optional[str] = None,
    route_name: Optional[str] = None,
    tenant_id: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], Optional[SystemPrompt]]:
    """
    우선순위 계층(Virtual Key > Route > Tenant > Global)에 따라
    매핑된 시스템 프롬프트를 탐색하고 메시지 리스트에 주입합니다.
    """
    # 1. Active prompts 조회
    active_prompts = db.query(SystemPrompt).filter(SystemPrompt.is_active == True).all()
    if not active_prompts:
        return messages, None

    selected_prompt: Optional[SystemPrompt] = None

    # Priority 1: Virtual Key Binding
    if key_id:
        for p in active_prompts:
            if p.target_type == "VIRTUAL_KEY" and p.target_id == key_id:
                selected_prompt = p
                break

    # Priority 2: Route Binding
    if not selected_prompt and route_name:
        for p in active_prompts:
            if p.target_type == "ROUTE" and p.target_id == route_name:
                selected_prompt = p
                break

    # Priority 3: Tenant Binding
    if not selected_prompt and tenant_id:
        for p in active_prompts:
            if p.target_type == "TENANT" and p.target_id == tenant_id:
                selected_prompt = p
                break

    # Priority 4: Global Binding
    if not selected_prompt:
        for p in active_prompts:
            if p.target_type == "GLOBAL":
                selected_prompt = p
                break

    if not selected_prompt:
        return messages, None

    # 주입 전략(Injection Mode) 처리
    sys_content = selected_prompt.content
    mode = selected_prompt.injection_mode
    existing_sys_indices = [i for i, m in enumerate(messages) if m.get("role") == "system"]

    new_messages = [dict(m) for m in messages]

    if mode == "OVERRIDE":
        # 기존 system 메시지 제거 후 신규 주입
        new_messages = [m for m in new_messages if m.get("role") != "system"]
        new_messages.insert(0, {"role": "system", "content": sys_content})
    elif mode == "FALLBACK_ONLY":
        # system 메시지가 없을 때만 추가
        if not existing_sys_indices:
            new_messages.insert(0, {"role": "system", "content": sys_content})
    else:  # PREPEND (기본값)
        if existing_sys_indices:
            # 기존 system 메시지 앞에 사내 표준 프롬프트 결합
            first_idx = existing_sys_indices[0]
            orig_content = new_messages[first_idx].get("content", "")
            new_messages[first_idx]["content"] = f"{sys_content}\n\n{orig_content}"
        else:
            new_messages.insert(0, {"role": "system", "content": sys_content})

    return new_messages, selected_prompt
```

---

## 7. 프론트엔드 UI/UX 설계 (`SystemPromptsTab.jsx`)

### 7-1. 사이드바 및 네비게이션
- `Sidebar.jsx`에 메뉴 항목 추가:
  - Label: **"시스템 프롬프트 거버넌스"**
  - Icon: `ScrollText` (Lucide React)
  - ID: `'system-prompts'`

### 7-2. 화면 뷰 구성
1. **헤더 & KPI 영역**:
   - `총 프롬프트 수`, `활성 프롬프트 수`, `바인딩 분포 (라우트 / 가상키 / 테넌트)`
   - 우측 상단 `[+ 신규 시스템 프롬프트 등록]` 액션 버튼
2. **필터 및 검색 바**:
   - 바인딩 대상 필터 탭: `[전체]`, `[라우팅 정책]`, `[가상 API Key]`, `[테넌트/부서]`, `[전역]`
   - 프롬프트 명칭 검색창
3. **프롬프트 카드 리스트 (Glassmorphism 패널)**:
   - 각 카드:
     - 상단: 프롬프트 명칭, 활성 상태 토글 스위치, 주입 모드 뱃지 (`PREPEND` / `OVERRIDE`)
     - 중단: **타겟 바인딩 배지** (예: `🔗 [테넌트] 자산관리(WM)혁신부`)
     - 본문 미리보기: 모노스페이스 다크 뷰포트 (말줄임 + 더보기 지원)
     - 하단 메트릭: 예상 토큰 수 (`~142 tokens`), 등록 일시, `[테스트 시뮬레이션]`, `[수정]`, `[삭제]` 버튼
4. **신규 등록 / 수정 마법사 모달**:
   - **Step 1. 기본 정보**: 프롬프트 명칭, 설명
   - **Step 2. 바인딩 대상 선택**:
     - 라디오 버튼:
       - `(●) 라우팅 정책 (Route)` ➜ 실제 등록된 라우트 목록 드롭다운 연동
       - `( ) 가상 API Key (Virtual Key)` ➜ 등록된 가상키 목록 드롭다운 연동
       - `( ) 테넌트 / 부서 (Tenant)` ➜ 등록된 부서 목록 드롭다운 연동
       - `( ) 전사 공통 (Global)` ➜ 전역 적용
   - **Step 3. 주입 모드**: `PREPEND(추천)`, `OVERRIDE`, `FALLBACK_ONLY` 선택
   - **Step 4. 프롬프트 본문 작성**:
     - 텍스트에리어 에디터 + 실시간 글자수 및 토큰 카운터
     - 빠른 템플릿 삽입 버튼 (금융 컴플라이언스 가이드, 사내 정보보안 가이드, 코딩 어시스턴트)

---

## 8. 단계별 상세 구현 계획 (5-Phase Engineering Roadmap)

본 프로젝트는 에어갭 환경의 무중단 안정성과 추적 가능성을 보장하기 위해 전체 구현을 **5단계(Phase 1 ~ Phase 5)**로 엄격히 분할하여 순차적으로 진행합니다.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                      5단계 시스템 프롬프트 거버넌스 구현 로드맵                       │
├─────────────────┬─────────────────┬─────────────────┬─────────────────┬───────────┤
│    Phase 1      │    Phase 2      │    Phase 3      │    Phase 4      │  Phase 5  │
│ DB 모델 & 스키마 │ REST API & 엔진  │ L7 게이트웨이 연동│ 프론트엔드 UI/UX │ E2E 검증  │
│  ORM & DDL 정의  │ CRUD & 시뮬레이터│ ext_proc & 테스트│ 신규 거버넌스 탭  │ 브라우저&문서│
└─────────────────┴─────────────────┴─────────────────┴─────────────────┴───────────┘
```

---

### 🔹 Phase 1: 데이터베이스 모델링 및 코어 스키마 구축 (Database & Schema Modeling) - [✅ 완료]
- **목표**: 시스템 프롬프트 카탈로그 및 1:1 타겟 바인딩을 위한 영속화 계층 구축
- **세부 작업 내역**:
  1. `app/models/system_prompt.py` SQLAlchemy ORM 모델 정의 (`SystemPrompt`)
  2. `system_prompts` 테이블 DDL 및 인덱스(`target_type`, `target_id`, `is_active`) 정의
  3. `app/schemas/system_prompt.py` Pydantic V2 스키마 작성 (`SystemPromptCreate`, `SystemPromptUpdate`, `SystemPromptResponse`, `PromptResolveRequest`, `PromptResolveResponse`)
  4. 초기 기본 시스템 프롬프트 시딩 (전사 공통 보안 가드레일, 자산관리 상담 표준 지침, 안전 코딩 가이드라인)
- **완료 기준 (DoD)**:
  - PostgreSQL에 `system_prompts` 테이블이 정상 생성되고 관계 무결성이 확보됨.
  - ORM 모델 단위 테스트 통과.

---

### 🔹 Phase 2: 백엔드 RESTful CRUD API & 시뮬레이션 엔진 개발 (REST API & Resolver Engine) - [✅ 완료]
- **목표**: 프롬프트 등록, 수정, 삭제, 조회 및 대상별 주입 시뮬레이션 API 제공
- **세부 작업 내역**:
  1. `app/api/v1/endpoints/system_prompts.py` 라우터 구현:
     - `GET /api/v1/system-prompts`: 타겟 타입/활성 여부 필터링 지원 목록 조회
     - `POST /api/v1/system-prompts`: 신규 프롬프트 등록 및 타겟 정합성 검증
     - `GET /api/v1/system-prompts/{prompt_id}`: 단건 상세 조회
     - `PUT /api/v1/system-prompts/{prompt_id}`: 내용 및 바인딩 타겟 수정
     - `DELETE /api/v1/system-prompts/{prompt_id}`: 안전 영구 삭제
     - `POST /api/v1/system-prompts/resolve`: 가상키/라우트/테넌트 전달 시 최종 적용될 프롬프트 시뮬레이션
  2. `app/main.py`에 라우터 등록
  3. `tests/test_system_prompts.py` 전용 테스트 슈트 작성
- **완료 기준 (DoD)**:
  - `uv run pytest tests/test_system_prompts.py` 100% PASS (최소 6개 이상 테스트 케이스).

---

### 🔹 Phase 3: L7 AI Gateway (Envoy ext_proc) 및 게이트웨이 테스트벤치 주입 연동 (L7 Injection Middleware) - [✅ 완료]
- **목표**: LLM 호출 시 런타임에서 L7 레벨 인라인 페이로드 변조 및 테스트벤치 연동
- **세부 작업 내역**:
  1. `app/core/prompt_injector.py` 핵심 주입 엔진 구현:
     - 위계적 우선순위 해석 (`VIRTUAL_KEY` > `ROUTE` > `TENANT` > `GLOBAL`)
     - 3대 주입 모드(`PREPEND`, `OVERRIDE`, `FALLBACK_ONLY`) 메시지 합성 알고리즘
  2. `app/core/ext_proc_server.py`의 L7 stream body mutation 로직 연동
  3. 관리자 "모델 & 라우팅" 화면의 게이트웨이 테스트 호출(`app/api/v1/endpoints/routing.py`의 `_execute_single_test_call`)에 주입 엔진 연동
- **완료 기준 (DoD)**:
  - Envoy Gateway 및 테스트벤치를 통해 LLM 호출 시 매핑된 시스템 프롬프트가 실제 페이로드에 자동 주입되어 모델이 해당 지침대로 응답함.
  - 지연시간 오버헤드가 1ms 미만으로 측정됨.

---

### 🔹 Phase 4: 프론트엔드 관리 UI 및 대화형 에디터 개발 (Frontend UI & Interactive Editor) - [✅ 완료]
- **목표**: 관리자가 시각적으로 프롬프트를 등록하고 1:1 타겟 바인딩을 손쉽게 설정하는 전용 탭 개발
- **세부 작업 내역**:
  1. `Sidebar.jsx`에 **"시스템 프롬프트 거버넌스"** 신규 메뉴 추가 (`ScrollText` 아이콘)
  2. `src/api/client.js`에 시스템 프롬프트 API 호출 함수군 추가 (`getSystemPrompts`, `createSystemPrompt`, `updateSystemPrompt`, `deleteSystemPrompt`, `resolveSystemPrompt`)
  3. `src/components/SystemPromptsTab.jsx` 신규 컴포넌트 개발:
     - 상단 요약 KPI 카드 (총 프롬프트 수, 활성 상태, 타겟별 바인딩 분포 배지)
     - 타겟 필터 탭 (`전체`, `라우팅 정책`, `가상 API Key`, `테넌트`, `전역`)
     - 프롬프트 카탈로그 카드 뷰 (Glassmorphism 다크 슬레이트 디자인)
     - 신규 등록 / 수정 모달:
       - 1:1 바인딩 타겟 선택기 (라우트/가상키/테넌트 실제 DB 데이터 실시간 연동 드롭다운)
       - 프롬프트 에디터, 실시간 글자수 및 토큰 카운터, 빠른 템플릿 버튼
     - 안전 커스텀 영구 삭제 모달 연동
- **완료 기준 (DoD)**:
  - `npm run build` 성공 (Vite 번들링 에러 0건) 및 프론트엔드 컨테이너 실배포 완료.
  - 직관적인 Glassmorphism UI 렌더링 확인.

---

### 🔹 Phase 5: 브라우저 E2E 검증, 성능 측정 및 종합 문서화 (Browser E2E Verification & Documentation Sync) - [✅ 완료]
- **목표**: 실제 브라우저 환경에서 전 기능 검증 및 프로젝트 마스터 문서 전면 동기화
- **세부 작업 내역**:
  1. 브라우저 서브에이전트 기반 E2E 시나리오 테스트:
     - 신규 프롬프트 생성 ➔ 라우팅 정책 또는 가상키 1:1 바인딩 ➔ 테스트벤치 즉시 호출 ➔ LLM 응답에 지침 반영 확인 ➔ 프롬프트 수정/삭제
  2. 브라우저 실화면 캡처 증적 확보
  3. 아키텍처 문서 및 보고서 원스톱 동기화:
     - `architecture/PRE_12_PHASE_0_TO_6_COMPREHENSIVE_REPORT.md` 갱신
     - `architecture/PRE_13_GAP_ANALYSIS_PHASE_0_TO_6.md` 갱신
     - `architecture/README.md` 및 `aiorche/README.md` 최신 상태 반영
- **완료 기준 (DoD)**:
  - E2E 전 시나리오 결함 0건 통과.
  - 마스터 종합 보고서 및 갭 분석서 완벽 동기화 완료.

---

## 9. 결론 및 기대 효과

1. **사내 AI 거버넌스 완성**: 클라이언트 애플리케이션에 의존하지 않고, L7 게이트웨이 레벨에서 사내 보안 지침과 부서별 전문 지식을 강제할 수 있습니다.
2. **운영 유연성 극대화**: 프롬프트 내용이 변경되어도 클라이언트 코드 수정이나 재배포 없이 오케스트레이터 관리자 화면에서 원클릭으로 즉시 반영됩니다.
3. **철저한 우선순위 통제**: 전사 공통 규칙, 부서별 지침, 특정 API Key별 지침을 위계적으로 결합하여 충돌 없는 안정적인 AI 서빙을 보장합니다.

