#!/usr/bin/env python3
"""
RBAC 역할별 API 시나리오 테스트 (실 기동 스택 대상)

실행:  cd ordinatio && uv run --project backend python scripts/rbac/rbac_api_scenario.py [--keep] [--report PATH]

시나리오
  S0. 비인증 요청 차단 (전 엔드포인트 401)
  S1. 역할별 프로필(/auth/me) 역할·권한 일치
  S2. 역할 × 엔드포인트 권한 매트릭스 (허용=401/403 아님, 거부=403)
  S3. 테넌트(부서) 격리 - TENANT_ADMIN / VIEWER
  S4. 권한 상승(Privilege Escalation) 차단
  S5. 동적 권한 변경 즉시 반영 / 비활성화 / 로그아웃 토큰 무효화
"""
import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rbac_common import (  # noqa: E402
    BASE_URL, CUSTOM_ROLE, auth, bootstrap_admin_credentials, login, provision, teardown, test_password,
)
from rbac_matrix import API_MATRIX, ROLE_SPEC, effective_perms, is_allowed  # noqa: E402

RESULTS: List[dict] = []


def record(scenario: str, case_id: str, persona: str, desc: str, expected: str, actual: str, ok: bool):
    RESULTS.append({"scenario": scenario, "id": case_id, "persona": persona, "desc": desc,
                    "expected": expected, "actual": actual, "ok": ok})
    mark = "✅" if ok else "❌"
    print(f"  {mark} [{case_id}] {persona:<14} {desc} | 기대={expected} 실제={actual}")


def call(client: httpx.Client, entry: dict, token: Optional[str]) -> int:
    headers = dict(entry.get("headers", {}))
    if token:
        headers["Authorization"] = f"Bearer {token}"
    res = client.request(entry["method"], f"{BASE_URL}{entry['path']}", json=entry.get("json"), headers=headers)
    return res.status_code


def s0_unauthenticated(client):
    print("\n▶ S0. 비인증 요청 차단")
    for e in API_MATRIX:
        code = call(client, e, None)
        record("S0", f"S0-{e['id']}", "anonymous", f"{e['method']} {e['path']}", "401", str(code), code == 401)


def s1_profile(client, tokens, state):
    print("\n▶ S1. 역할별 프로필/권한 일치 (/auth/me)")
    for pkey, info in state["users"].items():
        me = client.get(f"{BASE_URL}/api/v1/auth/me", headers=auth(tokens[pkey])).json()
        role_ok = me.get("role") == info["role"]
        record("S1", f"S1-{pkey}-role", info["username"], "역할 일치", info["role"], str(me.get("role")), role_ok)
        spec = set(ROLE_SPEC[info["role"]]["perms"])
        got = set(p for p in me.get("permissions", []) if p != "*")
        record("S1", f"S1-{pkey}-perms", info["username"], "권한 목록 = 명세",
               ",".join(sorted(spec)) if len(spec) < 6 else f"{len(spec)}개", 
               "일치" if got == spec else f"차이 +{sorted(got - spec)} -{sorted(spec - got)}", got == spec)
        tenant_ok = me.get("tenant_id") == info["tenant_id"]
        record("S1", f"S1-{pkey}-tenant", info["username"], "소속 테넌트", str(info["tenant_id"]), str(me.get("tenant_id")), tenant_ok)


def s2_matrix(client, tokens, state):
    print("\n▶ S2. 역할 × 엔드포인트 권한 매트릭스")
    for pkey, info in state["users"].items():
        role = info["role"]
        for e in API_MATRIX:
            allowed = is_allowed(role, e["perm"])
            code = call(client, e, tokens[pkey])
            ok = (code not in (401, 403)) if allowed else (code == 403)
            record("S2", f"S2-{e['id']}", info["username"], f"{e['perm']:<22} {e['method']} {e['path']}",
                   "허용" if allowed else "403", str(code), ok)


def s3_tenant_isolation(client, tokens, state, admin_token):
    print("\n▶ S3. 테넌트(부서) 격리")
    ta, tb = state["tenants"]["A"], state["tenants"]["B"]
    kb = state["keys"]["B"]

    for pkey in ("tadmin", "viewer"):
        u = state["users"][pkey]["username"]
        h = auth(tokens[pkey])
        keys = client.get(f"{BASE_URL}/api/v1/virtual-keys", headers=h).json()
        tenants_seen = sorted({k["tenant_id"] for k in keys}) if isinstance(keys, list) else []
        record("S3", "S3-01", u, "가상키 목록은 소속 부서만", f"[{ta}]", str(tenants_seen), tenants_seen in ([ta], []))
        keys_b = client.get(f"{BASE_URL}/api/v1/virtual-keys", params={"tenant_id": tb}, headers=h).json()
        leaked = [k for k in keys_b if k["tenant_id"] == tb] if isinstance(keys_b, list) else []
        record("S3", "S3-02", u, "tenant_id=B 필터 우회 시도", "B 키 0건", f"B 키 {len(leaked)}건", len(leaked) == 0)

    h = auth(tokens["tadmin"])
    u = state["users"]["tadmin"]["username"]
    body = {"name": "rbac-cross-tenant", "tenant_id": tb, "allowed_models": [], "allowed_ip_cidrs": [], "rpm_limit": 10, "tpm_limit": 1000}
    code = client.post(f"{BASE_URL}/api/v1/virtual-keys", json=body, headers=h).status_code
    record("S3", "S3-03", u, "타 부서(B) 가상키 발급", "403", str(code), code == 403)

    body["tenant_id"] = ta
    body["name"] = "rbac-own-tenant"
    res = client.post(f"{BASE_URL}/api/v1/virtual-keys", json=body, headers=h)
    record("S3", "S3-04", u, "소속 부서(A) 가상키 발급", "201", str(res.status_code), res.status_code == 201)

    for cid, method, path, js in (
        ("S3-05", "PATCH", f"/api/v1/virtual-keys/{kb}", {"name": "hijack"}),
        ("S3-06", "PATCH", f"/api/v1/virtual-keys/{kb}/revoke", {"revoked_reason": "hijack"}),
        ("S3-07", "DELETE", f"/api/v1/virtual-keys/{kb}?force=true", None),
    ):
        code = client.request(method, f"{BASE_URL}{path}", json=js, headers=h).status_code
        record("S3", cid, u, f"타 부서 키 조작 {method} {path.split('?')[0]}", "403", str(code), code == 403)

    # 부서 관리자는 "소속 부서 한정" 이므로 전사 부서(테넌트) 생성/수정/삭제 불가가 설계 의도
    code = client.post(f"{BASE_URL}/api/v1/tenants", headers=h,
                       json={"name": "RBAC 무단 부서", "department_code": "RBAC_X"}).status_code
    record("S3", "S3-08", u, "신규 부서(테넌트) 생성", "403", str(code), code == 403)
    code = client.patch(f"{BASE_URL}/api/v1/tenants/{tb}", headers=h, json={"monthly_budget_krw": 1}).status_code
    record("S3", "S3-09", u, "타 부서(B) 예산/정보 수정", "403", str(code), code == 403)
    code = client.delete(f"{BASE_URL}/api/v1/tenants/{tb}", headers=h).status_code
    record("S3", "S3-10", u, "타 부서(B) 삭제", "403", str(code), code == 403)

    tenants = client.get(f"{BASE_URL}/api/v1/tenants", headers=h).json()
    seen = sorted(t["tenant_id"] for t in tenants) if isinstance(tenants, list) else []
    record("S3", "S3-11", u, "부서 목록은 소속 부서만 노출", f"[{ta}]", f"{len(seen)}개 부서", seen == [ta])


def s4_privilege_escalation(client, tokens, state):
    print("\n▶ S4. 권한 상승 차단")
    for pkey in ("tadmin", "viewer", "auditor"):
        info = state["users"][pkey]
        h = auth(tokens[pkey])
        code = client.patch(f"{BASE_URL}/api/v1/users/{info['id']}", json={"role": "SUPER_ADMIN"}, headers=h).status_code
        record("S4", "S4-01", info["username"], "본인 역할을 SUPER_ADMIN 으로 변경", "403", str(code), code == 403)
        code = client.patch(f"{BASE_URL}/api/v1/roles/{info['role']}", json={"permissions": ["*"]}, headers=h).status_code
        record("S4", "S4-02", info["username"], "본인 역할 권한을 '*' 로 확장", "403", str(code), code == 403)
        code = client.post(f"{BASE_URL}/api/v1/users", headers=h, json={
            "username": f"rbac-esc-{pkey}", "password": "Escalate!2345", "full_name": "esc",
            "email": f"rbac-esc-{pkey}@rbac.ordinatio.local", "role": "SUPER_ADMIN"}).status_code
        record("S4", "S4-03", info["username"], "SUPER_ADMIN 계정 신규 생성", "403", str(code), code == 403)

    # 게이트웨이: 권한 없는 콘솔 JWT 로 추론 호출 시 차단
    for pkey in ("viewer", "auditor"):
        info = state["users"][pkey]
        code = client.post(f"{BASE_URL}/v1/chat/completions",
                           headers=auth(tokens[pkey], {"X-Console-Prompt-Studio": "true"}),
                           json={"model": "agent-auto", "messages": [{"role": "user", "content": "x"}]}).status_code
        record("S4", "S4-04", info["username"], "prompt_studio 권한 없이 게이트웨이 추론", "401/403", str(code), code in (401, 403))


def s5_dynamic(client, tokens, state, admin_token, password):
    print("\n▶ S5. 동적 권한 변경 / 비활성화 / 로그아웃")
    ha = auth(admin_token)
    aud = state["users"]["auditor"]

    # 5-1 커스텀 역할 권한 회수 즉시 반영 (재로그인 없이)
    client.patch(f"{BASE_URL}/api/v1/roles/{CUSTOM_ROLE['name']}", json={"permissions": ["users:read"]}, headers=ha)
    code = client.get(f"{BASE_URL}/api/v1/compliance/rules", headers=auth(tokens["auditor"])).status_code
    record("S5", "S5-01", aud["username"], "compliance:read 회수 직후 감사규칙 조회", "403", str(code), code == 403)
    client.patch(f"{BASE_URL}/api/v1/roles/{CUSTOM_ROLE['name']}", json={"permissions": CUSTOM_ROLE["permissions"]}, headers=ha)
    code = client.get(f"{BASE_URL}/api/v1/compliance/rules", headers=auth(tokens["auditor"])).status_code
    record("S5", "S5-02", aud["username"], "compliance:read 재부여 후 조회", "200", str(code), code == 200)

    # 5-2 사용자 역할 변경 즉시 반영 (VIEWER -> TENANT_ADMIN -> VIEWER)
    v = state["users"]["viewer"]
    client.patch(f"{BASE_URL}/api/v1/users/{v['id']}", json={"role": "TENANT_ADMIN"}, headers=ha)
    code = client.post(f"{BASE_URL}/api/v1/system-prompts", json={}, headers=auth(tokens["viewer"])).status_code
    record("S5", "S5-03", v["username"], "VIEWER→TENANT_ADMIN 승격 직후 prompts:write", "422(인가 통과)", str(code), code not in (401, 403))
    client.patch(f"{BASE_URL}/api/v1/users/{v['id']}", json={"role": "VIEWER"}, headers=ha)
    code = client.post(f"{BASE_URL}/api/v1/system-prompts", json={}, headers=auth(tokens["viewer"])).status_code
    record("S5", "S5-04", v["username"], "VIEWER 강등 직후 prompts:write", "403", str(code), code == 403)

    # 5-3 계정 비활성화
    client.patch(f"{BASE_URL}/api/v1/users/{aud['id']}", json={"is_active": False}, headers=ha)
    code = client.get(f"{BASE_URL}/api/v1/users", headers=auth(tokens["auditor"])).status_code
    record("S5", "S5-05", aud["username"], "비활성화된 계정의 기존 토큰", "401/403", str(code), code in (401, 403))
    code = client.post(f"{BASE_URL}/api/v1/auth/login", json={"username": aud["username"], "password": password}).status_code
    record("S5", "S5-06", aud["username"], "비활성화된 계정 로그인", "401/403", str(code), code in (401, 403))
    client.patch(f"{BASE_URL}/api/v1/users/{aud['id']}", json={"is_active": True}, headers=ha)

    # 5-4 로그아웃 후 토큰 재사용
    t = state["users"]["tadmin"]
    tok = login(client, t["username"], password)
    client.post(f"{BASE_URL}/api/v1/auth/logout", headers=auth(tok))
    code = client.get(f"{BASE_URL}/api/v1/auth/me", headers=auth(tok)).status_code
    record("S5", "S5-07", t["username"], "로그아웃된 토큰 재사용", "401", str(code), code == 401)


def write_report(path: Path, started: str):
    total = len(RESULTS)
    passed = sum(1 for r in RESULTS if r["ok"])
    lines = [
        "# RBAC 역할별 API 시나리오 테스트 결과", "",
        f"- 실행 시각: {started}", f"- 대상: `{BASE_URL}`",
        f"- 결과: **{passed}/{total} PASS**, FAIL {total - passed}", "",
    ]
    fails = [r for r in RESULTS if not r["ok"]]
    if fails:
        lines += ["## ❌ 실패 항목", "", "| ID | 페르소나 | 검증 내용 | 기대 | 실제 |", "|---|---|---|---|---|"]
        lines += [f"| {r['id']} | {r['persona']} | {r['desc']} | {r['expected']} | {r['actual']} |" for r in fails]
        lines.append("")
    for sc in ("S0", "S1", "S2", "S3", "S4", "S5"):
        rows = [r for r in RESULTS if r["scenario"] == sc]
        if not rows:
            continue
        p = sum(1 for r in rows if r["ok"])
        lines += [f"## {sc} ({p}/{len(rows)})", "", "| | ID | 페르소나 | 검증 내용 | 기대 | 실제 |", "|---|---|---|---|---|---|"]
        lines += [f"| {'✅' if r['ok'] else '❌'} | {r['id']} | {r['persona']} | `{r['desc']}` | {r['expected']} | {r['actual']} |" for r in rows]
        lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n📄 리포트: {path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="종료 후 테스트 계정/부서를 삭제하지 않음")
    ap.add_argument("--report", default=None)
    args = ap.parse_args()
    started = datetime.now().isoformat(timespec="seconds")

    with httpx.Client(timeout=30.0) as client:
        admin = bootstrap_admin_credentials()
        admin_token = login(client, admin["username"], admin["password"])
        teardown(client, admin_token)
        password = test_password()
        state = provision(client, admin_token, password)
        print(f"✔ 프로비저닝 완료: 부서 {state['tenants']} / 사용자 {[u['username'] for u in state['users'].values()]}")

        tokens = {k: login(client, u["username"], password) for k, u in state["users"].items()}
        try:
            s0_unauthenticated(client)
            s1_profile(client, tokens, state)
            s2_matrix(client, tokens, state)
            s3_tenant_isolation(client, tokens, state, admin_token)
            s4_privilege_escalation(client, tokens, state)
            s5_dynamic(client, tokens, state, admin_token, password)
        finally:
            if not args.keep:
                teardown(client, admin_token)

    total, passed = len(RESULTS), sum(1 for r in RESULTS if r["ok"])
    print(f"\n==== RBAC API 시나리오: {passed}/{total} PASS ====")
    if args.report:
        write_report(Path(args.report), started)
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()

