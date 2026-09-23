# PRE-16: 웹브라우저 LLM 테스트 연동 및 게이트웨이 즉시 호출 장애 해결 보고서

**문서 번호**: PRE-16  
**작성 일자**: 2026-09-23  
**대상 시스템**: AI Orchestrator Appliance (L7 AI Gateway & Control Plane Dashboard)  
**상태**: 검증 완료 (VERIFIED & RESOLVED)  

---

## 1. 개요 및 배경
폐쇄망(Air-Gapped) 대시보드 환경에서 웹브라우저(`http://localhost:5173`)를 통해 **프롬프트 스튜디오(Prompt Studio)** 및 **라우팅 스튜디오(Routing Tab)**의 **'⚡ 게이트웨이 즉시 테스트 호출'** 기능을 검증하던 중, LLM 모델 접근 불가 및 게이트웨이 연결 실패 장애가 연속적으로 발생하였습니다.

본 보고서는 해당 장애의 3단계 근본 원인(Root Causes)과 이를 해결한 엔지니어링 조치 내역, 그리고 실제 브라우저 자동화 E2E 테스트를 통한 복구 검증 결과를 기록합니다.

---

## 2. 장애 현상 및 근본 원인 (Root Cause Analysis)

### 장애 1: 프롬프트 스튜디오에서 LLM 호출 시 502 Bad Gateway 발생
- **현상**: 프롬프트 스튜디오에서 모델 추론 실행 시 즉각적인 호출 실패 발생.
- **백엔드 로그 분석**:
  ```log
  Upstream returned HTTP 404 for URL http://ollama-qwen:11434/v1/chat/completions: 
  {"error":{"message":"model 'meta-llama/Llama-3-8B-Instruct' not found","type":"not_found_error"}}
  Upstream model server unreachable: model=meta-llama/Llama-3-8B-Instruct, endpoint=http://ollama-qwen:11434
  POST /v1/chat/completions HTTP/1.1 502 Bad Gateway
  ```
- **근본 원인**:
  - `AgentRouter`의 기본 폴백/초기 모델이 `meta-llama/Llama-3.1-8B-Instruct`로 설정되어 있었으나, 실제 로컬 Ollama 컨테이너에는 `qwen2.5:0.5b`, `deepseek-r1:8b`, `gemma2:2b`만 다운로드되어 있어 Ollama가 404를 반환하고 게이트웨이가 502 Bad Gateway를 응답함.

### 장애 2: 신규 모델(gemma2:2b) 추가 후 호스트 포트 지정으로 인한 연결 거부
- **현상**: 모델 카탈로그에 `gemma2:2b` 모델을 `target_endpoint: http://localhost:11435`로 등록했으나 통신 실패.
- **근본 원인**:
  - 백엔드는 Docker 컨테이너(`aiorche-backend`) 내부에서 실행되므로, `localhost:11435` 호출 시 컨테이너 자신의 루프백(127.0.0.1)으로 요청하여 포트가 닫혀 있어 `Connection Refused` 발생.

### 장애 3: 도커 네트워크 격리(Bridge vs aiorche_default)
- **현상**: 엔드포인트를 `http://ollama-gemma:11434`로 수정했음에도 `Name or service not known` DNS 조회 실패.
- **근본 원인**:
  - `aiorche-backend`, `envoy`, `postgres` 등은 `aiorche_default` 브릿지 네트워크에 속해 있었으나, `ollama-gemma` 컨테이너는 기본 `bridge` 네트워크에 별도 기동되어 도커 컨테이너 간 DNS 통신이 단절됨.

### 장애 4: 라우팅 스튜디오 '게이트웨이 즉시 테스트 호출' 실패 및 에러 마스킹
- **현상**: 헬스체크는 200 OK로 정상 통과하였으나, 라우팅 스튜디오에서 `⚡ 게이트웨이 즉시 테스트 호출` 버튼 클릭 시 빨간색 에러 박스와 함께 `Envoy L7 게이트웨이(Port 8080) 연결 불가 (Connection Refused)` 표시.
- **근본 원인**:
  1. **초단기 하드코딩 타임아웃**: `routing.py`의 `test_route_call` 내부 `httpx.AsyncClient(timeout=4.0)`으로 4초 타임아웃이 설정되어 있었음. Gemma2 모델의 로컬 CPU 추론 시간이 약 4.0초를 초과하여 `httpx.TimeoutException` 발생.
  2. **에러 마스킹 루프 버그**: 백엔드의 candidate_hosts 순회 루프에서 첫 번째 `http://envoy:8080`이 타임아웃난 후, 두 번째 `http://localhost:8080`으로 넘어가면서 컨테이너 내부 8080 포트 부재로 `ConnectError`가 발생해 실제 타임아웃 원인이 `Connection Refused`로 덮어써짐.

---

## 3. 해결 조치 내역 (Engineering Fixes)

### 3.1 도커 네트워크 연결
```bash
docker network connect aiorche_default ollama-gemma
```
`ollama-gemma` 컨테이너를 `aiorche_default` 네트워크에 바인딩하여 컨테이너 간 직접 도메인 통신 경로 확보.

### 3.2 모델 카탈로그 엔드포인트 및 엔진 정정
- `target_endpoint`: `http://ollama-gemma:11434` (컨테이너 내부 수신 포트 지정)
- `serving_engine`: `Ollama`
- `status`: `is_healthy: true` (Latency: 4.69ms)

### 3.3 백엔드 테스트 클라이언트 타임아웃 및 예외 처리 패치
`aiorche/backend/app/api/v1/endpoints/routing.py`:
```python
# 수정 전: timeout=4.0
# 수정 후: 45초 타임아웃 및 TimeoutException 시 덮어쓰기 방지
client_timeout = httpx.Timeout(45.0, connect=3.0)
async with httpx.AsyncClient(timeout=client_timeout) as client:
    for host in candidate_hosts:
        test_url = f"{host}{target_path}"
        try:
            res = await client.post(test_url, json=payload, headers=request_headers)
            ...
            return RouteTestCallResponse(...)
        except httpx.ConnectError:
            if not err_msg:
                err_msg = "Envoy L7 게이트웨이(Port 8080) 연결 불가 (Connection Refused)"
        except httpx.TimeoutException:
            err_msg = "게이트웨이 LLM 모델 추론 타임아웃 (45초 초과)"
            break
        except Exception as e:
            err_msg = str(e)
            break
```

---

## 4. 최종 E2E 검증 증적 (Definition of Done)

### 4.1 모델 헬스체크 API (`POST /api/v1/models/gemma2:2b/health`)
- **결과**: `HTTP 200 OK`
- **응답 본문**:
  ```json
  {
    "model_id": "gemma2:2b",
    "alias": "gemma2:2b",
    "serving_engine": "Ollama",
    "target_endpoint": "http://ollama-gemma:11434",
    "is_healthy": true,
    "status_code": 200,
    "latency_ms": 4.69,
    "error_message": null
  }
  ```

### 4.2 게이트웨이 직접 추론 API (`POST /v1/chat/completions`)
- **결과**: `HTTP 200 OK`
- **응답 내용**:
  ```json
  {
    "choices": [{
      "message": {
        "role": "assistant",
        "content": "안녕하세요! 저는 Google DeepMind에서 개발한 대규모 언어 모델, Gemma입니다. 😊 ..."
      }
    }],
    "orche_metadata": {
      "selected_model": "gemma2:2b",
      "serving_engine": "Ollama",
      "status": "LIVE_UPSTREAM"
    }
  }
  ```

### 4.3 브라우저 라우팅 탭 즉시 테스트 호출 E2E 검증
- **검증 환경**: Headless Chrome Browser Subagent
- **대상 URL**: `http://localhost:5173/` -> [라우팅] 탭 -> `financial-advisor-v1`
- **동작**: `⚡ 게이트웨이 즉시 테스트 호출` 클릭
- **결과**:
  - **상태 배지**: `HTTP 200 OK` (녹색 테두리 정상 출력)
  - **소요 시간**: `2083ms`
  - **출력 텍스트**:
    > *"안녕하세요! Envoy 게이트웨이 라우팅 테스트 요청을 처리해드릴게요. 😊 어떤 테스트를 원하시는지에 따라 상세한 답변을 드릴 수 있어요! ..."*
