# AI Orchestrator Vendor Security & Cryptographic Key Management

이 디렉터리는 AI Orchestrator 오프라인 어플라이언스 릴리즈 및 핫픽스 번들의 암호학적 서명과 무결성 검증을 위한 키 관리 디렉터리입니다.

## 1. 키 구성 규격 (RSA-4096)
- `aiorche-vendor-public.pem`: **벤더 공식 공개키 (Public Key)**
  - 엔터프라이즈 고객사 및 보안 감사팀이 다운로드하여 패키지의 위·변조 여부를 오프라인 검증할 수 있도록 Git 저장소에 커밋되어 공개 관리됩니다.
  - 고객사 폐쇄망 환경에서 `verify-release.sh`를 통해 번들 전자서명을 검증하는 데 사용됩니다.
- `aiorche-release-private.pem`: **벤더 릴리즈 서명 비밀키 (Private Key)**
  - 벤더 릴리즈 엔지니어링 빌드 시스템에서만 안전하게 보관하며, `.gitignore`를 통해 Git 추적에서 원천 제외됩니다.

## 2. 서명 및 검증 절차
1. **서명 생성 (빌드 시스템)**:
   ```bash
   openssl dgst -sha256 -sign aiorche-release-private.pem \
       -out aiorche-appliance-v1.0.0.tar.gz.sig \
       aiorche-appliance-v1.0.0.tar.gz
   ```
2. **무결성 및 서명 검증 (고객사 검증팀)**:
   ```bash
   openssl dgst -sha256 -verify aiorche-vendor-public.pem \
       -signature aiorche-appliance-v1.0.0.tar.gz.sig \
       aiorche-appliance-v1.0.0.tar.gz
   ```
   - 정상 출력: `Verified OK`
