# PRE-18: LLM 모델 헬스체크 타임아웃 수동 조절 기능 구현 및 검증 보고서

## 1. 개요 및 목적 (Overview & Goals)
고객사 에어갭 및 하이브리드 인프라 환경에서 운영되는 LLM 서빙 엔드포인트는 내부 고속 네트워크(LAN/온프레미스)부터 원격 분산 클러스터 및 프라이빗 클라우드에 이르기까지 다양한 네트워크 지연(Latency) 환경을 가집니다.

기존 3.0초 고정 타임아웃으로 인해 응답이 다소 지연되는 대형 모델이나 고부하 상태의 서빙 인스턴스가 헬스체크 시 조기 실패(Timeout)로 판정되는 문제를 방지하고, 반대로 고속 사내망에서는 1.0~2.0초 이내에 빠른 실패를 유도할 수 있도록 **관리자가 헬스체크 타임아웃을 수동으로 유연하게 조절(1.0s ~ 30.0s)**할 수 있는 기능을 구현하였습니다.

---

## 2. 주요 엔지니어링 구현 내역 (Key Engineering Implementation)

### 2.1 데이터베이스 스키마 확장 & 무중단 마이그레이션
- **테이블**: `model_catalogs`
- **컬럼 추가**: `health_check_timeout NUMERIC(5, 2) DEFAULT 3.0`
- **ORM & 마이그레이션**:
  - `model_catalog.py`: `health_check_timeout = Column(Numeric(5, 2), default=3.0, nullable=True)` 정의.
  - `init_db.py`: `ALTER TABLE model_catalogs ADD COLUMN IF NOT EXISTS health_check_timeout NUMERIC(5, 2) DEFAULT 3.0;` 무중단 DDL 마이그레이션 로직 추가.
  - `schemas/model_catalog.py`: `ModelCatalogBase`, `ModelCatalogUpdate`, `ModelCatalogResponse`, `ModelHealthCheckResult`에 `health_check_timeout: Optional[float] = 3.0` 필드 추가.

### 2.2 백엔드 API 엔드포인트 동적 타임아웃 매개변수 지원
- **API 엔드포인트**:
  - `GET /api/v1/models/health-check?timeout={float}`: 전체 모델 헬스체크 시 쿼리 파라미터 `timeout` 지원 (범위 0.5초 ~ 60.0초).
  - `POST /api/v1/models/{model_id}/health?timeout={float}`: 단일 모델 헬스체크 시 동적 `timeout` 파라미터 지원.
- **프로빙 로직 (`probe_endpoint`)**:
  - `httpx.AsyncClient(timeout=timeout, ...)`에 동적으로 타임아웃 주입.
  - `httpx.ConnectTimeout`: `"연결 타임아웃 ({timeout}s 초과)"` 에러 명시.
  - `httpx.ReadTimeout`: `"응답 대기시간 초과 ({timeout}s 초과)"` 에러 명시.
  - 파라미터 미전달 시 각 모델별 DB에 저장된 `health_check_timeout` 값을 개별 기본값으로 폴백(Fallback).

### 2.3 프론트엔드 UI/UX 수동 타임아웃 조절 인터페이스
- **전역 타임아웃 선택 툴바 드롭다운**:
  - 서빙 모델 풀 상단 툴바 및 서브탭 헤더에 타임아웃 조절 드롭다운(`1.0s`, `2.0s`, `3.0초 (기본)`, `5.0s`, `10.0s`, `15.0s`, `30.0s`) 배치.
  - 선택값은 브라우저 `localStorage`(`aiorche_health_check_timeout`)에 자동 보관되어 페이지 재방문 시에도 유지.
  - **[전체 헬스체크]** 버튼 클릭 시 선택된 타임아웃이 쿼리 파라미터로 백엔드에 즉시 전달.
- **신규 모델 등록 모달**:
  - 입력 폼 하단 가격/사양 그리드(3열 확장)에 **"타임아웃 (초)"** 입력 필드 추가 (기본 3.0초, 0.5초~60.0초 수동 지정 가능).
- **서빙 모델 수정 모달**:
  - 등록된 모델의 기본 타임아웃 설정을 모달에서 직관적으로 수정하고 DB에 영속화.
- **개별 핑(Ping) 테스트 연동**:
  - 테이블 각 행의 개별 핑 버튼 클릭 시 해당 모델에 저장된 `healthCheckTimeout` 값을 우선하여 프로빙 요청 실행 및 툴팁 표기.

---

## 3. 검증 결과 및 증적 (Verification & Test Evidence)

### 3.1 백엔드 단위 및 통합 테스트
- **실행 명령**: `uv run pytest`
- **테스트 케이스**:
  - `tests/test_routing.py::test_model_serving_health_check`: `?timeout=4.5`, `?timeout=5.0` 쿼리 파라미터 및 모델별 설정 타임아웃 검증 통과.
- **전체 결과**: **66 passed** (100% 통과, 0 failure)

### 3.2 E2E 브라우저 검증
- **검증 환경**: Playwright Headless Chromium (`http://localhost:5173/`)
- **수행 항목**:
  1. 서빙 모델 풀 툴바에서 타임아웃 드롭다운 5.0초 선택 및 [전체 헬스체크] 실행 토스트 확인.
  2. 신규 등록 모달 열기 ➔ 타임아웃 3.0s 필드 렌더링 및 입력 정상 동작 확인.
  3. 기존 모델 수정 모달 열기 ➔ 타임아웃 필드 정상 연동 및 값 수정 확인.
- **증적 스크린샷**:
  - 신규 모델 모달: `new_model_modal_1790263523413.png`
  - 서빙 모델 수정 모달: `edit_model_modal_1790263671096.png`

---

## 4. 결론 및 향후 계획
헬스체크 타임아웃을 관리자가 직접 유연하게 조절할 수 있게 됨으로써 온프레미스 고속 서빙부터 프라이빗 클라우드 원격 서빙까지 다양한 에어갭 네트워크 토폴로지에 안정적으로 적응할 수 있는 오케스트레이션 기반이 완성되었습니다.
