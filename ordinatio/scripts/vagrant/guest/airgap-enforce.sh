#!/usr/bin/env bash
# ==============================================================================
# [Guest] 폐쇄망(Air-Gap) 외부 송신 차단 및 차단 상태 검증
#
# VirtualBox NAT 인터페이스(기본 라우트 장치)로 나가는 모든 신규 송신을 차단한다.
#   - 호스트(10.0.2.2) 방향과 ESTABLISHED 응답은 허용 → `vagrant ssh` 유지
#   - 호스트 전용 사설망(192.168.56.0/24), 루프백, Docker 브릿지 내부 통신은 영향 없음
#   - 컨테이너 송신(FORWARD)은 Docker가 재기동해도 유지되는 DOCKER-USER 체인에서 차단
# VirtualBox 공유 폴더(/opt/ordinatio-src)는 네트워크가 아닌 게스트 채널이므로 계속 동작한다.
#
# 사용법: sudo bash airgap-enforce.sh [--check-only]
# ==============================================================================
set -euo pipefail

CHECK_ONLY=false
[ "${1:-}" = "--check-only" ] && CHECK_ONLY=true

if [[ $EUID -ne 0 ]]; then
    echo "❌ root 권한이 필요합니다." >&2
    exit 1
fi

NAT_IF="$(ip route show default 2>/dev/null | awk '/default/ {print $5; exit}')"
if [ -z "$NAT_IF" ]; then
    echo "❌ 기본 라우트(NAT) 인터페이스를 찾지 못했습니다." >&2
    exit 1
fi
NAT_HOST="${NAT_HOST:-10.0.2.2}"

apply_v4() {
    local tag="ordinatio-airgap"
    # 중복 적용 방지: 기존 태그 규칙 제거 후 재삽입
    while iptables -D OUTPUT -o "$NAT_IF" -m comment --comment "$tag" -j DROP 2>/dev/null; do :; done
    while iptables -D OUTPUT -o "$NAT_IF" -m conntrack --ctstate ESTABLISHED,RELATED -m comment --comment "$tag" -j ACCEPT 2>/dev/null; do :; done
    while iptables -D OUTPUT -o "$NAT_IF" -d "$NAT_HOST" -m comment --comment "$tag" -j ACCEPT 2>/dev/null; do :; done

    iptables -I OUTPUT 1 -o "$NAT_IF" -m comment --comment "$tag" -j DROP
    iptables -I OUTPUT 1 -o "$NAT_IF" -m conntrack --ctstate ESTABLISHED,RELATED -m comment --comment "$tag" -j ACCEPT
    iptables -I OUTPUT 1 -o "$NAT_IF" -d "$NAT_HOST" -m comment --comment "$tag" -j ACCEPT

    iptables -N DOCKER-USER 2>/dev/null || true
    while iptables -D DOCKER-USER -o "$NAT_IF" -m comment --comment "$tag" -j DROP 2>/dev/null; do :; done
    iptables -I DOCKER-USER 1 -o "$NAT_IF" -m comment --comment "$tag" -j DROP
    # DOCKER-USER 가 FORWARD 에서 참조되지 않는 환경(Docker 미기동 등) 대비
    if ! iptables -C FORWARD -j DOCKER-USER 2>/dev/null; then
        iptables -I FORWARD 1 -j DOCKER-USER
    fi
}

apply_v6() {
    command -v ip6tables &>/dev/null || return 0
    local tag="ordinatio-airgap"
    while ip6tables -D OUTPUT -o "$NAT_IF" -m comment --comment "$tag" -j DROP 2>/dev/null; do :; done
    ip6tables -I OUTPUT 1 -o "$NAT_IF" -m comment --comment "$tag" -j DROP 2>/dev/null || true
}

if [ "$CHECK_ONLY" = false ]; then
    echo "==> [Air-Gap] 외부 송신 차단 적용 (NAT IF: ${NAT_IF}, 허용: ${NAT_HOST} / ESTABLISHED)"
    apply_v4
    apply_v6
fi

echo "==> [Air-Gap] 차단 상태 검증"
FAIL=0
probe() {
    local desc="$1"; shift
    if "$@" &>/dev/null; then
        echo "  ✖ FAIL: ${desc} — 외부 접근이 가능합니다"
        FAIL=1
    else
        echo "  ✔ PASS: ${desc} — 차단됨"
    fi
}
probe "호스트 → 공인 IP(1.1.1.1:443)"            curl -s -m 5 -o /dev/null https://1.1.1.1
probe "호스트 → Docker Hub 레지스트리"            curl -s -m 5 -o /dev/null https://registry-1.docker.io/v2/
# 실제 DNS 질의(A example.com)를 보내고 응답 수신 여부로 판정 (응답 수신 = 차단 실패)
probe "호스트 → 외부 DNS 질의(8.8.8.8:53)"       python3 -c '
import socket,sys
q=b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00\x07example\x03com\x00\x00\x01\x00\x01"
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.settimeout(4)
try:
    s.sendto(q,("8.8.8.8",53)); s.recvfrom(512)
except OSError:
    sys.exit(1)
'
if command -v docker &>/dev/null && docker image inspect redis:7-alpine &>/dev/null; then
    probe "컨테이너 → 공인 IP(1.1.1.1:80)" \
        docker run --rm --entrypoint sh redis:7-alpine -c 'wget -q -T 5 -O /dev/null http://1.1.1.1'
else
    echo "  • SKIP: 컨테이너 송신 검증 (redis:7-alpine 이미지 미로드 상태 — 설치 후 재검증)"
fi

if [ $FAIL -ne 0 ]; then
    echo "❌ [Air-Gap] 외부 송신 차단 검증 실패"
    exit 1
fi
echo "✅ [Air-Gap] 외부 송신이 완전히 차단되었습니다."
