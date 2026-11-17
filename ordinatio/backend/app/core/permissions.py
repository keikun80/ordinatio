from typing import List, Dict

AVAILABLE_PERMISSIONS: List[Dict[str, str]] = [
    # 1. 관제 홈
    {
        "code": "overview:read",
        "name": "관제 대시보드 조회",
        "category": "관제 홈",
        "description": "1초 실시간 WebSocket 텔레메트리 스트림 및 시스템 종합 지표 열람"
    },
    # 2. 모델 & 라우팅
    {
        "code": "routing:read",
        "name": "모델 및 라우팅 조회",
        "category": "모델 & 라우팅",
        "description": "서빙 모델 카탈로그 및 동적 L7 라우팅 정책 열람"
    },
    {
        "code": "routing:write",
        "name": "모델 및 라우팅 관리",
        "category": "모델 & 라우팅",
        "description": "서빙 모델 등록/수정/삭제 및 카나리 가중치 배포, AgentRouter 정책 제어"
    },
    # 3. 거버넌스 (테넌트 & 가상키)
    {
        "code": "governance:read",
        "name": "테넌트 및 가상키 조회",
        "category": "거버넌스",
        "description": "부서(테넌트) 목록 및 가상 API Key 현황 열람"
    },
    {
        "code": "governance:write",
        "name": "테넌트 및 가상키 관리",
        "category": "거버넌스",
        "description": "신규 부서 등록 및 가상 API Key 발급/수정/파기 수명주기 제어"
    },
    # 4. 시스템 프롬프트
    {
        "code": "prompts:read",
        "name": "시스템 프롬프트 조회",
        "category": "시스템 프롬프트",
        "description": "시스템 프롬프트 카탈로그 및 1:1 바인딩 현황 열람"
    },
    {
        "code": "prompts:write",
        "name": "시스템 프롬프트 관리",
        "category": "시스템 프롬프트",
        "description": "시스템 프롬프트 등록/수정/삭제 및 L7 ext_proc 주입 바인딩 제어"
    },
    # 5. FinOps & 과금
    {
        "code": "finops:read",
        "name": "FinOps 비용 조회",
        "category": "FinOps",
        "description": "부서별 예산 소진율, 표준 토큰 과금 매트릭스 및 인보이스 열람"
    },
    {
        "code": "finops:write",
        "name": "FinOps 예산/정산 관리",
        "category": "FinOps",
        "description": "테넌트 월 예산 Hard Cap 설정 및 청구서 UTF-8 BOM CSV 내보내기"
    },
    # 6. PII 보안 & WORM 감사
    {
        "code": "compliance:read",
        "name": "PII 규칙 및 감사로그 조회",
        "category": "보안 & 컴플라이언스",
        "description": "개인정보 탐지 규칙 및 WORM 불변 감사 로그 열람"
    },
    {
        "code": "compliance:write",
        "name": "PII 규칙 관리",
        "category": "보안 & 컴플라이언스",
        "description": "정규식 PII 규칙 등록/수정/삭제 및 포렌식 JSON 내보내기"
    },
    # 7. 수명주기 & 패치
    {
        "code": "lifecycle:read",
        "name": "시스템 진단 및 패치 조회",
        "category": "수명주기",
        "description": "어플라이언스 컴포넌트 버전, 5대 인프라 Preflight 진단 결과 조회"
    },
    {
        "code": "lifecycle:write",
        "name": "긴급 패치 및 제어",
        "category": "수명주기",
        "description": "RSA-4096 서명 패치 적용, 원클릭 롤백 및 Zero-PII 서포트 번들 생성"
    },
    # 8. 프롬프트 스튜디오
    {
        "code": "prompt_studio:execute",
        "name": "프롬프트 추론 테스트",
        "category": "프롬프트 스튜디오",
        "description": "프롬프트 스튜디오를 통한 온프레미스 LLM 모델 실시간 추론 실행"
    },
    # 9. 사용자 및 계정 관리
    {
        "code": "users:read",
        "name": "사용자 목록 조회",
        "category": "계정 관리",
        "description": "사용자 계정 목록 및 접속 세션 상태 열람"
    },
    {
        "code": "users:write",
        "name": "사용자 계정 관리",
        "category": "계정 관리",
        "description": "신규 사용자 등록, 인적사항/역할 변경, 비밀번호 재설정, 계정 잠금 해제 및 삭제"
    },
    # 10. 역할 및 권한 관리 (Role Manager)
    {
        "code": "roles:manage",
        "name": "역할 및 권한 관리",
        "category": "계정 관리",
        "description": "신규 역할 추가, 역할 표시명/설명 수정, 세부 권한 매트릭스 편집 및 삭제"
    }
]

ALL_PERMISSION_CODES = [p["code"] for p in AVAILABLE_PERMISSIONS]

