#!/usr/bin/env python3
"""
Chrome DevTools Protocol (CDP) 기반 실환경 고해상도 스크린샷 일괄 캡처기
- 대상: http://localhost:5173 (Ordinatio Admin Console)
- 출력: ordinatio/docs/images/ 및 docs/images/ (26종 고해상도 스크린샷)
"""

import os
import sys
import json
import time
import base64
import asyncio
import shutil
import subprocess
import httpx
import websockets

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DEBUG_PORT = 9222
USER_DATA_DIR = "/tmp/chrome_docs_capture_profile"
TARGET_URL = "http://localhost:5173"

PROJECT_ROOT = "/Users/jason/project/오케스트레이터"
ORDINATIO_IMAGES_DIR = os.path.join(PROJECT_ROOT, "ordinatio/docs/images")
ROOT_IMAGES_DIR = os.path.join(PROJECT_ROOT, "docs/images")

async def send_cmd(ws, msg_id, method, params=None):
    payload = {"id": msg_id, "method": method, "params": params or {}}
    await ws.send(json.dumps(payload))
    while True:
        resp_raw = await ws.recv()
        resp = json.loads(resp_raw)
        if resp.get("id") == msg_id:
            return resp

async def eval_js(ws, msg_id, expr):
    res = await send_cmd(ws, msg_id, "Runtime.evaluate", {
        "expression": expr,
        "awaitPromise": True,
        "returnByValue": True
    })
    return res.get("result", {}).get("result", {}).get("value")

async def capture_screen(ws, msg_id, filename):
    res = await send_cmd(ws, msg_id, "Page.captureScreenshot", {"format": "png"})
    b64_data = res.get("result", {}).get("data")
    if not b64_data:
        print(f"[-] Failed to capture {filename}: {res}")
        return False
    
    img_bytes = base64.b64decode(b64_data)
    
    # Save to ordinatio/docs/images
    p1 = os.path.join(ORDINATIO_IMAGES_DIR, filename)
    with open(p1, "wb") as f:
        f.write(img_bytes)
        
    # Save to docs/images
    p2 = os.path.join(ROOT_IMAGES_DIR, filename)
    with open(p2, "wb") as f:
        f.write(img_bytes)
        
    print(f"[+] Captured & Saved: {filename} ({len(img_bytes):,} bytes)")
    return True

async def main():
    os.makedirs(ORDINATIO_IMAGES_DIR, exist_ok=True)
    os.makedirs(ROOT_IMAGES_DIR, exist_ok=True)
    
    if os.path.exists(USER_DATA_DIR):
        shutil.rmtree(USER_DATA_DIR, ignore_errors=True)

    print("[*] Launching Headless Chrome with CDP...")
    chrome_proc = subprocess.Popen([
        CHROME_BIN,
        f"--remote-debugging-port={DEBUG_PORT}",
        "--headless=new",
        "--window-size=1600,1050",
        f"--user-data-dir={USER_DATA_DIR}",
        "--disable-gpu",
        "--no-first-run",
        "--hide-scrollbars"
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        # Wait for CDP ready and find page target
        ws_url = None
        for _ in range(30):
            try:
                # Open a new tab or list existing tabs
                r = httpx.get(f"http://127.0.0.1:{DEBUG_PORT}/json/list", timeout=1.0)
                if r.status_code == 200:
                    pages = [p for p in r.json() if p.get("type") == "page"]
                    if pages:
                        ws_url = pages[0].get("webSocketDebuggerUrl")
                        break
                    else:
                        # create new page
                        r_new = httpx.put(f"http://127.0.0.1:{DEBUG_PORT}/json/new?{TARGET_URL}", timeout=1.0)
                        if r_new.status_code == 200:
                            ws_url = r_new.json().get("webSocketDebuggerUrl")
                            break
            except Exception:
                await asyncio.sleep(0.3)

        if not ws_url:
            print("[-] Error: Chrome CDP WebSocket not available")
            return

        print(f"[*] Connected to CDP: {ws_url}")
        async with websockets.connect(ws_url, max_size=20*1024*1024) as ws:
            mid = 1
            await send_cmd(ws, mid, "Page.enable"); mid += 1
            await send_cmd(ws, mid, "Runtime.enable"); mid += 1
            await send_cmd(ws, mid, "DOM.enable"); mid += 1
            await send_cmd(ws, mid, "Emulation.setDeviceMetricsOverride", {
                "width": 1600,
                "height": 1050,
                "deviceScaleFactor": 2,
                "mobile": False
            }); mid += 1

            # 1. Navigate to target URL
            print(f"[*] Navigating to {TARGET_URL}...")
            await send_cmd(ws, mid, "Page.navigate", {"url": TARGET_URL}); mid += 1
            await asyncio.sleep(2.5)

            # Helper JS function to click by text
            await eval_js(ws, mid, """
                window.clickByText = (selector, text) => {
                    const els = Array.from(document.querySelectorAll(selector));
                    const target = els.find(el => el.textContent.trim().includes(text));
                    if (target) {
                        target.click();
                        return true;
                    }
                    return false;
                };
            """); mid += 1

            # --- 1. Overview Tab ---
            print("[*] 1. Overview Tab...")
            await eval_js(ws, mid, "window.clickByText('.nav-item', '글로벌 관제 홈');"); mid += 1
            await asyncio.sleep(1.0)
            await capture_screen(ws, mid, "01_overview_main.png"); mid += 1
            await capture_screen(ws, mid, "cleaned_overview.png"); mid += 1
            await capture_screen(ws, mid, "theme_dark_mode.png"); mid += 1

            # Theme Toggle -> Light Mode
            print("[*] Capturing Light Theme...")
            await eval_js(ws, mid, """
                const btn = Array.from(document.querySelectorAll('header button')).find(b => b.title?.includes('테마') || b.innerHTML.includes('Sun') || b.innerHTML.includes('Moon'));
                if (btn) btn.click();
            """); mid += 1
            await asyncio.sleep(0.6)
            await capture_screen(ws, mid, "theme_light_mode.png"); mid += 1

            # Toggle back to Dark Mode
            await eval_js(ws, mid, """
                const btn = Array.from(document.querySelectorAll('header button')).find(b => b.title?.includes('테마') || b.innerHTML.includes('Sun') || b.innerHTML.includes('Moon'));
                if (btn) btn.click();
            """); mid += 1
            await asyncio.sleep(0.6)

            # --- 2. Routing Tab ---
            print("[*] 2. Routing Tab & Modals...")
            # Click Routing header
            await eval_js(ws, mid, "window.clickByText('.nav-accordion-header', '모델 & 라우팅');"); mid += 1
            await asyncio.sleep(0.5)
            # Click '서빙 모델 풀' sub item
            await eval_js(ws, mid, "window.clickByText('.nav-sub-item', '서빙 모델 풀');"); mid += 1
            await asyncio.sleep(1.0)
            await capture_screen(ws, mid, "02_routing_main.png"); mid += 1

            # Open New Model Modal
            await eval_js(ws, mid, "window.clickByText('button', '신규 모델 등록');"); mid += 1
            await asyncio.sleep(0.8)
            await capture_screen(ws, mid, "02_routing_modal_add_model.png"); mid += 1

            # Compute Target Dropdown focus
            await eval_js(ws, mid, """
                const sel = document.querySelector('.modal-overlay select');
                if (sel) sel.focus();
            """); mid += 1
            await asyncio.sleep(0.3)
            await capture_screen(ws, mid, "02_routing_compute_target_select.png"); mid += 1

            # Close Model Modal
            await eval_js(ws, mid, "window.clickByText('.modal-overlay button', '취소');"); mid += 1
            await asyncio.sleep(0.5)

            # Switch to '라우팅 스튜디오' sub item
            await eval_js(ws, mid, "window.clickByText('button', '라우팅 스튜디오');"); mid += 1
            await asyncio.sleep(0.8)

            # Open Add Route Modal (showing tenant selector)
            await eval_js(ws, mid, "window.clickByText('button', '신규 라우트');"); mid += 1
            await asyncio.sleep(0.8)
            await capture_screen(ws, mid, "02_routing_modal_add_rule.png"); mid += 1

            # Close Add Route Modal
            await eval_js(ws, mid, "window.clickByText('.modal-overlay button', '취소');"); mid += 1
            await asyncio.sleep(0.5)

            # Switch to 'AgentRouter & 테스트' sub item
            await eval_js(ws, mid, "window.clickByText('button', 'AgentRouter');"); mid += 1
            await asyncio.sleep(0.8)

            # Open Edit Policy Modal
            await eval_js(ws, mid, "window.clickByText('button', '지능형 정책 상세 편집') || window.clickByText('button', '정책');"); mid += 1
            await asyncio.sleep(0.8)
            await capture_screen(ws, mid, "02_routing_modal_edit_policy.png"); mid += 1

            # Close Policy Modal
            await eval_js(ws, mid, """
                const closeBtn = document.querySelector('.modal-overlay button.btn-secondary') ||
                                 Array.from(document.querySelectorAll('.modal-overlay button')).find(b => b.textContent.includes('닫기') || b.textContent.includes('취소') || b.textContent.includes('✕'));
                if (closeBtn) closeBtn.click();
            """); mid += 1
            await asyncio.sleep(0.5)

            # --- 3. Governance / Virtual Keys Tab ---
            print("[*] 3. Governance & Virtual Keys Tab...")
            await eval_js(ws, mid, "window.clickByText('.nav-item', '거버넌스');"); mid += 1
            await asyncio.sleep(1.0)
            await capture_screen(ws, mid, "03_virtual_keys_main.png"); mid += 1

            # Open New Department Modal
            print("[*] Opening New Department Modal...")
            await eval_js(ws, mid, "window.clickByText('button', '신규 부서 등록');"); mid += 1
            await asyncio.sleep(0.8)
            await capture_screen(ws, mid, "03_governance_modal_add_department.png"); mid += 1

            # Close New Department Modal
            await eval_js(ws, mid, "window.clickByText('.modal-overlay button', '취소');"); mid += 1
            await asyncio.sleep(0.5)

            # Open Issue Key Modal
            print("[*] Opening Issue API Key Modal...")
            await eval_js(ws, mid, "window.clickByText('button', '신규 API Key 발급');"); mid += 1
            await asyncio.sleep(0.8)
            await capture_screen(ws, mid, "03_virtual_keys_modal_issue_key.png"); mid += 1

            # Close Issue Key Modal
            await eval_js(ws, mid, "window.clickByText('.modal-overlay button', '취소');"); mid += 1
            await asyncio.sleep(0.5)

            # --- 3.1 System Prompts Governance Tab ---
            print("[*] 3.1 System Prompts Governance Tab...")
            await eval_js(ws, mid, "window.clickByText('.nav-item', '시스템 프롬프트');"); mid += 1
            await asyncio.sleep(1.0)
            await capture_screen(ws, mid, "08_system_prompts_main.png"); mid += 1

            # Open Add System Prompt Modal
            print("[*] Opening Add System Prompt Modal...")
            await eval_js(ws, mid, "window.clickByText('button', '신규 시스템 프롬프트 등록');"); mid += 1
            await asyncio.sleep(0.8)
            await capture_screen(ws, mid, "08_system_prompts_modal_add.png"); mid += 1

            # Close Add System Prompt Modal
            await eval_js(ws, mid, "window.clickByText('.modal-overlay button', '취소');"); mid += 1
            await asyncio.sleep(0.5)

            # Open System Prompt Simulator Modal
            print("[*] Opening System Prompt Simulator Modal...")
            await eval_js(ws, mid, "window.clickByText('button', '주입 시뮬레이터');"); mid += 1
            await asyncio.sleep(0.8)
            await capture_screen(ws, mid, "08_system_prompts_simulator.png"); mid += 1

            # Close System Prompt Simulator Modal
            await eval_js(ws, mid, "window.clickByText('.modal-overlay button', '시뮬레이터 닫기') || window.clickByText('.modal-overlay button', '닫기');"); mid += 1
            await asyncio.sleep(0.5)

            # --- 4. FinOps Tab ---
            print("[*] 4. FinOps Tab...")
            await eval_js(ws, mid, "window.clickByText('.nav-item', 'FinOps');"); mid += 1
            await asyncio.sleep(1.0)
            await capture_screen(ws, mid, "04_finops_main.png"); mid += 1

            # --- 5. Compliance Tab ---
            print("[*] 5. Compliance Tab & Modals...")
            await eval_js(ws, mid, "window.clickByText('.nav-item', 'PII 보안');"); mid += 1
            await asyncio.sleep(1.0)
            await capture_screen(ws, mid, "05_compliance_main.png"); mid += 1
            await capture_screen(ws, mid, "cleaned_compliance.png"); mid += 1

            # Open Add Rule Modal
            await eval_js(ws, mid, "window.clickByText('button', '신규 룰 등록');"); mid += 1
            await asyncio.sleep(0.8)
            await capture_screen(ws, mid, "05_compliance_modal_add_rule.png"); mid += 1

            # Close Add Rule Modal
            await eval_js(ws, mid, "window.clickByText('.modal-overlay button', '취소');"); mid += 1
            await asyncio.sleep(0.5)

            # Open Preset Modal
            await eval_js(ws, mid, "window.clickByText('button', '프리셋');"); mid += 1
            await asyncio.sleep(0.8)
            await capture_screen(ws, mid, "05_compliance_presidio_presets.png"); mid += 1

            # Close Preset Modal
            await eval_js(ws, mid, "window.clickByText('.modal-overlay button', '취소');"); mid += 1
            await asyncio.sleep(0.5)

            # Focus Simulator
            await eval_js(ws, mid, """
                const simEl = Array.from(document.querySelectorAll('h3, h4, div')).find(el => el.textContent.includes('실시간 마스킹 시뮬레이터') || el.textContent.includes('시뮬레이터'));
                if (simEl) simEl.scrollIntoView({ behavior: 'instant', block: 'center' });
            """); mid += 1
            await asyncio.sleep(0.5)
            await capture_screen(ws, mid, "05_compliance_presidio_simulator.png"); mid += 1

            # Focus Audit Search Filter
            await eval_js(ws, mid, """
                const searchInput = document.querySelector('input[placeholder*="검색"], input[type="search"], input[type="text"]');
                if (searchInput) {
                    searchInput.value = "MASK";
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    searchInput.scrollIntoView({ behavior: 'instant', block: 'center' });
                }
            """); mid += 1
            await asyncio.sleep(0.5)
            await capture_screen(ws, mid, "05_compliance_audit_search_filter.png"); mid += 1

            # Reset Scroll
            await eval_js(ws, mid, "window.scrollTo(0, 0);"); mid += 1
            await asyncio.sleep(0.3)

            # --- 6. Lifecycle Tab ---
            print("[*] 6. Lifecycle Tab & Actions...")
            await eval_js(ws, mid, "window.clickByText('.nav-item', '긴급 패치');"); mid += 1
            await asyncio.sleep(1.0)
            await capture_screen(ws, mid, "06_lifecycle_main.png"); mid += 1

            # Run Preflight Diagnostics
            print("[*] Running Diagnostics...")
            await eval_js(ws, mid, "window.clickByText('button', '자가진단 실행');"); mid += 1
            await asyncio.sleep(2.5)
            await capture_screen(ws, mid, "06_lifecycle_diagnostics.png"); mid += 1

            # Load Sample Hotfix Bundle
            print("[*] Loading Patch Bundle...")
            await eval_js(ws, mid, "window.clickByText('button', '공식 핫픽스 번들 로드');"); mid += 1
            await asyncio.sleep(1.5)
            await capture_screen(ws, mid, "06_lifecycle_patch_loaded.png"); mid += 1

            # Deploy Hotfix
            print("[*] Deploying Hotfix...")
            await eval_js(ws, mid, "window.clickByText('button', '무중단 롤링 핫픽스 배포');"); mid += 1
            await asyncio.sleep(3.0)
            await capture_screen(ws, mid, "06_lifecycle_patch_deployed.png"); mid += 1

            # --- 7. Prompt Studio Tab ---
            print("[*] 7. Prompt Studio Tab & Inference...")
            await eval_js(ws, mid, "window.clickByText('.nav-item', '프롬프트 스튜디오');"); mid += 1
            await asyncio.sleep(1.0)
            await capture_screen(ws, mid, "07_prompt_studio_main.png"); mid += 1

            # Execute Prompt Inference
            print("[*] Executing Prompt Inference...")
            await eval_js(ws, mid, "window.clickByText('button', '추론 실행');"); mid += 1
            await asyncio.sleep(2.5)
            await capture_screen(ws, mid, "07_prompt_studio_response.png"); mid += 1

        print("\n[+] All 24+ manual screenshots successfully captured and updated!")

    finally:
        print("[*] Terminating Chrome...")
        chrome_proc.terminate()
        try:
            chrome_proc.wait(timeout=3)
        except Exception:
            chrome_proc.kill()
        if os.path.exists(USER_DATA_DIR):
            shutil.rmtree(USER_DATA_DIR, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
