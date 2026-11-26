/**
 * 시스템 프롬프트 본문의 토큰 추정치 산출기.
 *
 * 백엔드 `_estimate_tokens()` (backend/app/api/v1/endpoints/system_prompts.py) 와
 * 반드시 동일한 결과를 내야 한다. 어긋나면 에디터에 표시되는 "예상 토큰"과
 * 서버에 저장되는 estimated_tokens 가 달라진다.
 *
 * 가중치: CJK 1글자 ≈ 1.5토큰, 그 외는 단어당 ≈ 1.3토큰 + 공백/구두점 보정.
 * CJK 문자는 제거하지 않고 공백으로 치환한다(제거하면 CJK로 분리된 영단어가
 * 하나로 붙어 단어 수가 줄어든다).
 *
 * 양측 동일성은 backend/tests/fixtures/token_vectors.json 벡터로
 * scripts/verify-phase-system-prompt.sh [5/5] 단계에서 검증된다.
 * 이 파일은 그 검증 스크립트가 직접 import 하므로 React 의존성을 가져서는 안 된다.
 */

const CJK_PATTERN = /[가-힣一-鿿぀-ヿ]/g;

export function calculateEstimatedTokens(text) {
  if (!text) return 0;

  let cjkCount = 0;
  let otherCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code >= 0xac00 && code <= 0xd7a3) || (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3040 && code <= 0x30ff)) {
      cjkCount++;
    } else {
      otherCount++;
    }
  }

  const words = text.replace(CJK_PATTERN, ' ').trim().split(/\s+/).filter(Boolean);
  const otherTokens = Math.floor(words.length * 1.3) + Math.floor((otherCount - words.join('').length) / 4);
  const cjkTokens = Math.floor(cjkCount * 1.5);
  return Math.max(1, cjkTokens + otherTokens);
}

export default calculateEstimatedTokens;
