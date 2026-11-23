# PRE_47 에어갭 로컬 시맨틱 캐시 구현 및 검증 결과

**작성 일자**: 2026-11-23

## 구현 결과

- `app/core/semantic_cache.py`: 외부 API·모델 다운로드가 없는 결정론적 feature-hash 임베딩 및 코사인 유사도 캐시를 구현했다.
- Redis가 연결되면 TTL 기반 영속 캐시를 사용하며, 장애 시 요청을 실패시키지 않고 제한된 프로세스 메모리 fallback으로 동작한다.
- 캐시 키는 테넌트/콘솔 범위와 모델을 해시해 분리하고, 전체 정규화 대화 컨텍스트를 비교한다.
- 도구 호출 및 스트리밍 요청은 캐시하지 않는다.
- 게이트웨이 적중 응답은 `SEMANTIC_CACHE_HIT` 메타데이터와 절감 비용을 반환하며, `/api/v1/finops/semantic-cache`와 FinOps 화면에서 적중률·절감 토큰·절감액을 확인할 수 있다.

## 제약 및 후속 운영 기준

이 구현은 에어갭 즉시 동작성을 우선해 bge-small 같은 별도 모델이 아니라 내장 결정론적 임베딩을 사용한다. 고객사가 승인한 로컬 임베딩 모델을 오프라인 번들로 제공할 경우 해당 어댑터로 교체할 수 있으며, 외부 다운로드는 허용하지 않는다.

## 검증

1. **단위 및 통합 테스트**:
   - `UV_CACHE_DIR=/tmp/ordinatio-uv-cache uv run pytest tests/test_semantic_cache.py -q` 실행 결과, 동일 컨텍스트 적중·테넌트/모델 격리·FinOps 절감 집계 3개 테스트가 100% 통과했다.
2. **전체 백엔드 회귀 테스트 완주**:
   - 게이트웨이 보안 키(진단 키/글로벌 키) 호출 시 `scope`가 `None`인 경우 발생하던 결함(`AttributeError: 'NoneType' object has no attribute 'encode'`)을 방어 조치(`scope or "global"`, `key:{key_id}`)하여 전수 해결했다.
   - `pytest tests/ -q` 실행 결과, **114 passed in 114.79s (100% PASS)** 를 완주했다.
3. **스탠드얼론 설치 및 무결성 DoD 검증**:
   - `bash scripts/verify-standalone-install.sh` 실행 결과, **7 / 7 PASS (100%)** 를 완수했다.
4. **프론트엔드 프로덕션 빌드**:
   - `cd ordinatio/frontend && npm run build` 실행 결과, FinOps 화면 및 시맨틱 캐시 집계 컴포넌트 포함 정상 빌드(Vite success)를 완료했다.
