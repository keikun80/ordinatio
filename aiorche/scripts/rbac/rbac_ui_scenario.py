#!/usr/bin/env python3
"""
RBAC 역할별 UI (Headless Chrome CDP) E2E 시나리오 테스트

실행:  cd aiorche && uv run --project backend python scripts/rbac/rbac_ui_scenario.py [--keep] [--report PATH]

시나리오
  U0. 비인증 상태 접속 시 로그인 화면(scr-login-view) 강제 노출 및 사이드바 미노출
  U1. 역할별(SUPER_ADMIN, TENANT_ADMIN, VIEWER, RBAC_AUDITOR) 실제 UI 로그인 및 자동 탭 폴백
  U2. 역할 × 사이드바 9개 메뉴(com-tab-*) 가시성 매트릭스 전수 검증
  U3. 탭별 쓰기 권한 제어 ('🔒 조회 전용 권한' 배지 및 생성/조작 버튼 disabled 상태 검증)
  U4. 가상 API Key 화면 멀티테넌트 UI 데이터 격리 (타 부서 키·부서 옵션 미노출)
  U5. 로그아웃 버튼(header-btn-logout) 클릭 시 토큰 파기 및 로그인 화면 복귀
"""
import argparse
import asyncio
import json
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import websockets

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rbac_common import (  # noqa: E402
    UI_URL, bootstrap_admin_credentials, login, provision, teardown, test_password,
)
from rbac_matrix import (  # noqa: E402
    READ_ONLY_BADGE_TEXT, UI_TABS, expected_visible_tabs, expected_write_enabled,
)

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DEBUG_PORT = 9233
USER_DATA_DIR = "/tmp/chrome_rbac_ui_scenario_profile"

RESULTS: List[dict] = []


def record(scenario: str, case_id: str, persona: str, desc: str, expected: str, actual: str, ok: bool):
    RESULTS.append({
        "scenario": scenario,
        "id": case_id,
        "persona": persona,
        "desc": desc,
        "expected": expected,
        "actual": actual,
        "ok": ok,
    })
    mark = "✅" if ok else "❌"
    print(f"  {mark} [{case_id}] {persona:<14} {desc} | 기대={expected} 실제={actual}")


class CdpDriver:
    def __init__(self, ws):
        self.ws = ws
        self.msg_id = 0

    async def cmd(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self.msg_id += 1
        mid = self.msg_id
        await self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            raw = await self.ws.recv()
            data = json.loads(raw)
            if data.get("id") == mid:
                return data

    async def eval(self, expr: str) -> Any:
        res = await self.cmd("Runtime.evaluate", {
            "expression": expr,
            "awaitPromise": True,
            "returnByValue": True,
        })
        return res.get("result", {}).get("result", {}).get("value")

    async def wait_for(self, js_predicate: str, timeout: float = 8.0) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            val = await self.eval(f"Boolean({js_predicate})")
            if val:
                return True
            await asyncio.sleep(0.15)
        return False


async def ui_login(cdp: CdpDriver, username: str, password: str) -> bool:
    await cdp.eval(f"""
    (() => {{
      const setVal = (el, val) => {{
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', {{ bubbles: true }}));
        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
      }};
      const u = document.querySelector('[data-testid="login-input-username"]');
      const p = document.querySelector('[data-testid="login-input-password"]');
      if (u && p) {{
        setVal(u, {json.dumps(username)});
        setVal(p, {json.dumps(password)});
      }}
      const btn = document.querySelector('[data-testid="login-btn-submit"]');
      if (btn) btn.click();
    }})()
    """)
    return await cdp.wait_for("document.querySelector('[data-testid=\"com-sidebar-nav\"]') !== null", timeout=8.0)


async def ui_logout(cdp: CdpDriver) -> bool:
    await cdp.eval("""
    (() => {
      const btn = document.querySelector('[data-testid="header-btn-logout"]');
      if (btn) btn.click();
    })()
    """)
    return await cdp.wait_for("document.querySelector('[data-testid=\"scr-login-view\"]') !== null", timeout=6.0)


async def click_tab(cdp: CdpDriver, tab_id: str) -> bool:
    clicked = await cdp.eval(f"""
    (() => {{
      const el = document.querySelector('[data-testid="com-tab-{tab_id}"]');
      if (!el) return false;
      el.click();
      return true;
    }})()
    """)
    if not clicked:
        return False
    await asyncio.sleep(0.55)
    return True


async def run_ui_scenarios(cdp: CdpDriver, state: Dict):
    password = state["password"]

    # -------------------------------------------------------------------------
    # U0. 비인증 접속 시 로그인 화면 강제 노출
    # -------------------------------------------------------------------------
    print("\n▶ U0. 비인증 접속 시 로그인 화면 강제 노출")
    await cdp.cmd("Page.navigate", {"url": UI_URL})
    await asyncio.sleep(0.8)
    await cdp.eval("localStorage.clear(); sessionStorage.clear(); location.reload();")
    has_login = await cdp.wait_for("document.querySelector('[data-testid=\"scr-login-view\"]') !== null", timeout=8.0)
    has_sidebar = await cdp.eval("document.querySelector('[data-testid=\"com-sidebar-nav\"]') !== null")
    record("U0", "U0-01", "anonymous", "비인증 접속 시 로그인 화면 표시", "True", str(has_login), bool(has_login))
    record("U0", "U0-02", "anonymous", "비인증 접속 시 사이드바 미노출", "False", str(has_sidebar), has_sidebar is False)

    # -------------------------------------------------------------------------
    # U1 ~ U5. 역할별(4종 페르소나) 순차 로그인 및 UI 규칙 검증
    # -------------------------------------------------------------------------
    for pkey in ("super", "tadmin", "viewer", "auditor"):
        uinfo = state["users"][pkey]
        username = uinfo["username"]
        role = uinfo["role"]
        exp_tabs = expected_visible_tabs(role)

        print(f"\n▶ [{role}] ({username}) UI 시나리오 검증")
        logged_in = await ui_login(cdp, username, password)
        record("U1", f"U1-{pkey}-login", username, f"{role} UI 로그인 성공 및 콘솔 진입", "True", str(logged_in), logged_in)

        # 헤더 프로필에 사용자명/역할 표시 확인
        header_text = await cdp.eval("document.querySelector('[data-testid=\"com-header-user-profile\"]')?.innerText || ''")
        has_profile = (username in header_text) or (uinfo["role"] in header_text) or ("RBAC" in header_text)
        record("U1", f"U1-{pkey}-profile", username, "상단 헤더에 사용자 프로필 표시", "포함", header_text.replace("\n", " "), has_profile)

        # RBAC_AUDITOR 등 overview:read 권한이 없는 역할은 첫 허용 탭(compliance)으로 자동 폴백되어야 함
        if "overview" not in exp_tabs and exp_tabs:
            first_tab = exp_tabs[0]
            await asyncio.sleep(0.4)
            is_first_active = await cdp.eval(
                f"document.querySelector('[data-testid=\"com-tab-{first_tab}\"]')?.classList.contains('active') || false"
            )
            record("U1", f"U1-{pkey}-fallback", username,
                   f"overview 권한 없을 때 첫 허용 탭({first_tab}) 자동 선택", "True", str(is_first_active), bool(is_first_active))

        # U2. 사이드바 9개 메뉴 노출/미노출 매트릭스 검증
        for tab_spec in UI_TABS:
            tid = tab_spec["tab"]
            should_show = tid in exp_tabs
            present = await cdp.eval(f"document.querySelector('[data-testid=\"com-tab-{tid}\"]') !== null")
            record("U2", f"U2-{pkey}-{tid}", username,
                   f"사이드바 메뉴 com-tab-{tid} 노출 여부", str(should_show), str(present), bool(present) == should_show)

        # U3. 접근 가능한 탭별 쓰기 권한 제어 (조회전용 배지 + 생성 버튼 disabled)
        for tab_spec in UI_TABS:
            tid = tab_spec["tab"]
            if tid not in exp_tabs:
                continue
            write_ok = expected_write_enabled(role, tab_spec)
            if write_ok is None:
                continue

            await click_tab(cdp, tid)
            await asyncio.sleep(0.4)

            page_text = await cdp.eval("document.querySelector('main')?.innerText || document.body.innerText || ''")
            badge_shown = READ_ONLY_BADGE_TEXT in page_text
            expected_badge = not write_ok
            record("U3", f"U3-{pkey}-{tid}-badge", username,
                   f"[{tid}] '🔒 조회 전용 권한' 배지 표시", str(expected_badge), str(badge_shown), badge_shown == expected_badge)

            btn_testid = tab_spec.get("write_button")
            if btn_testid:
                btn_state = await cdp.eval(f"""
                (() => {{
                  const b = document.querySelector('[data-testid="{btn_testid}"]');
                  if (!b) return {{ exists: false, disabled: true }};
                  return {{ exists: true, disabled: Boolean(b.disabled) }};
                }})()
                """)
                if write_ok:
                    ok = btn_state["exists"] and (btn_state["disabled"] is False)
                    record("U3", f"U3-{pkey}-{tid}-btn", username,
                           f"[{tid}] 쓰기 버튼({btn_testid}) 활성화", "disabled=False", f"disabled={btn_state['disabled']}", ok)
                else:
                    ok = (not btn_state["exists"]) or (btn_state["disabled"] is True)
                    record("U3", f"U3-{pkey}-{tid}-btn", username,
                           f"[{tid}] 쓰기 버튼({btn_testid}) 비활성화/차단", "disabled=True", f"disabled={btn_state['disabled']}", ok)

        # U4. 멀티테넌트 UI 격리 검증 (virtual-keys 탭 접근 가능 역할)
        if "virtual-keys" in exp_tabs:
            await click_tab(cdp, "virtual-keys")
            await asyncio.sleep(0.6)
            vk_text = await cdp.eval("document.querySelector('[data-testid=\"vk-table-card\"]')?.innerText || ''")
            filter_opts = await cdp.eval("""
            Array.from(document.querySelectorAll('[data-testid="vk-select-tenant-filter"] option')).map(o => o.textContent)
            """) or []
            has_key_a = "rbac-key-A" in vk_text
            has_key_b = "rbac-key-B" in vk_text
            has_opt_b = any("RBAC 시나리오 B부서" in o for o in filter_opts)

            if role == "SUPER_ADMIN":
                record("U4", f"U4-{pkey}-vk-all", username,
                       "전사 관리자는 A/B 부서 가상키 전체 열람", "A=True,B=True", f"A={has_key_a},B={has_key_b}", has_key_a and has_key_b)
            else:
                record("U4", f"U4-{pkey}-vk-own", username,
                       "소속 부서(A) 가상키(rbac-key-A) 표시", "True", str(has_key_a), has_key_a is True)
                record("U4", f"U4-{pkey}-vk-isolated", username,
                       "타 부서(B) 가상키(rbac-key-B) UI 미노출", "False", str(has_key_b), has_key_b is False)
                record("U4", f"U4-{pkey}-filter-isolated", username,
                       "부서 필터 드롭다운에 타 부서(B) 미노출", "False", str(has_opt_b), has_opt_b is False)

        # U5. 로그아웃
        logged_out = await ui_logout(cdp)
        tok_after = await cdp.eval("localStorage.getItem('aiorche_token')")
        record("U5", f"U5-{pkey}-logout", username,
               "로그아웃 클릭 시 토큰 삭제 및 로그인 화면 복귀", "True (token=None)", f"{logged_out} (token={tok_after})",
               bool(logged_out) and tok_after is None)


def write_report(path: Path, started: str):
    total = len(RESULTS)
    passed = sum(1 for r in RESULTS if r["ok"])
    lines = [
        "# RBAC 역할별 UI (Headless Chrome CDP) 시나리오 테스트 결과", "",
        f"- 실행 시각: {started}", f"- 대상 UI: `{UI_URL}`",
        f"- 결과: **{passed}/{total} PASS**, FAIL {total - passed}", "",
    ]
    fails = [r for r in RESULTS if not r["ok"]]
    if fails:
        lines += ["## ❌ 실패 항목", "", "| ID | 페르소나 | 검증 내용 | 기대 | 실제 |", "|---|---|---|---|---|"]
        lines += [f"| {r['id']} | {r['persona']} | {r['desc']} | {r['expected']} | {r['actual']} |" for r in fails]
        lines.append("")
    for sc in ("U0", "U1", "U2", "U3", "U4", "U5"):
        rows = [r for r in RESULTS if r["scenario"] == sc]
        if not rows:
            continue
        p = sum(1 for r in rows if r["ok"])
        lines += [f"## {sc} ({p}/{len(rows)})", "", "| | ID | 페르소나 | 검증 내용 | 기대 | 실제 |", "|---|---|---|---|---|---|"]
        lines += [f"| {'✅' if r['ok'] else '❌'} | {r['id']} | {r['persona']} | `{r['desc']}` | {r['expected']} | {r['actual']} |" for r in rows]
        lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n📄 UI 리포트: {path}")


async def async_main(args):
    started = datetime.now().isoformat(timespec="seconds")
    shutil.rmtree(USER_DATA_DIR, ignore_errors=True)

    with httpx.Client(timeout=30.0) as client:
        admin = bootstrap_admin_credentials()
        admin_token = login(client, admin["username"], admin["password"])
        teardown(client, admin_token)
        password = test_password()
        state = provision(client, admin_token, password)
        print(f"✔ UI 테스트용 프로비저닝 완료: {[u['username'] for u in state['users'].values()]}")

        chrome_proc = subprocess.Popen(
            [
                CHROME_BIN,
                f"--remote-debugging-port={DEBUG_PORT}",
                f"--user-data-dir={USER_DATA_DIR}",
                "--headless=new",
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                "--window-size=1600,1000",
                UI_URL,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            ws_url = None
            for _ in range(30):
                try:
                    r = httpx.get(f"http://127.0.0.1:{DEBUG_PORT}/json", timeout=1.0)
                    pages = [p for p in r.json() if p.get("type") == "page"]
                    if pages:
                        ws_url = pages[0]["webSocketDebuggerUrl"]
                        break
                except Exception:
                    pass
                await asyncio.sleep(0.25)

            if not ws_url:
                raise RuntimeError("Headless Chrome CDP 연결 실패")

            async with websockets.connect(ws_url, max_size=50 * 1024 * 1024) as ws:
                cdp = CdpDriver(ws)
                await cdp.cmd("Page.enable")
                await cdp.cmd("Runtime.enable")
                await run_ui_scenarios(cdp, state)
        finally:
            chrome_proc.terminate()
            try:
                chrome_proc.wait(timeout=3)
            except Exception:
                chrome_proc.kill()
            shutil.rmtree(USER_DATA_DIR, ignore_errors=True)
            if not args.keep:
                teardown(client, admin_token)

    total, passed = len(RESULTS), sum(1 for r in RESULTS if r["ok"])
    print(f"\n==== RBAC UI 시나리오: {passed}/{total} PASS ====")
    if args.report:
        write_report(Path(args.report), started)
    sys.exit(0 if passed == total else 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--report", default=None)
    args = ap.parse_args()
    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()

