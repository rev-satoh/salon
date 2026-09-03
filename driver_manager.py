from contextlib import contextmanager
import json
import os
import socket
import subprocess
import time
import urllib.request

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from flask import current_app

import config

@contextmanager
def get_webdriver(is_seo=False, headless=True, user_data_dir=None):
    """WebDriverインスタンスを生成し、終了時にクリーンアップするコンテキストマネージャ"""
    chrome_options = Options()
    if headless:
        chrome_options.add_argument("--headless")
    chrome_options.add_argument(f"--window-size=1200,800")
    chrome_options.add_argument(f'user-agent={config.DEFAULT_USER_AGENT}')
    if user_data_dir:
        os.makedirs(user_data_dir, exist_ok=True)
        chrome_options.add_argument(f"--user-data-dir={user_data_dir}")

    if is_seo:
        current_app.logger.info("SEO用のWebDriverオプションを適用します。")
        chrome_options.add_argument('--disable-blink-features=AutomationControlled')
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)

    driver = None
    try:
        service = Service(config.CHROMEDRIVER_PATH) if getattr(config, "CHROMEDRIVER_PATH", None) else None
        driver = webdriver.Chrome(service=service, options=chrome_options)
        driver.set_page_load_timeout(config.WEBDRIVER_TIMEOUT)
        
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        })
        yield driver
    finally:
        if driver:
            driver.quit()


def _port_alive(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _ensure_debugger_has_page(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2) as response:
            pages = json.loads(response.read().decode("utf-8"))
        if any(page.get("type") == "page" for page in pages):
            return

        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/json/new?about:blank",
            method="PUT",
        )
        with urllib.request.urlopen(request, timeout=2):
            pass
    except Exception:
        current_app.logger.exception("Chrome debugger page check failed.")


def ensure_chrome_debugger(port, user_data_dir):
    """通常Chromeをリモートデバッグ付きで起動する。既に起動中なら再利用する。"""
    if _port_alive(port):
        _ensure_debugger_has_page(port)
        return

    os.makedirs(user_data_dir, exist_ok=True)
    chrome_binary = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    subprocess.Popen(
        [
            chrome_binary,
            f"--remote-debugging-port={port}",
            f"--user-data-dir={user_data_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    deadline = time.time() + 10
    while time.time() < deadline:
        if _port_alive(port):
            time.sleep(1.0)
            if _port_alive(port):
                _ensure_debugger_has_page(port)
                return
        time.sleep(0.2)
    raise RuntimeError(f"Chrome remote debugging port {port} did not become ready")


@contextmanager
def get_attached_chrome(port, user_data_dir):
    """通常起動したChromeへChromeDriverで接続する。ブラウザ自体は閉じない。"""
    ensure_chrome_debugger(port, user_data_dir)
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", f"127.0.0.1:{port}")

    driver = None
    try:
        service = Service(config.CHROMEDRIVER_PATH) if getattr(config, "CHROMEDRIVER_PATH", None) else None
        deadline = time.time() + 15
        last_error = None
        while time.time() < deadline:
            try:
                driver = webdriver.Chrome(service=service, options=chrome_options)
                break
            except Exception as e:
                last_error = e
                time.sleep(1.0)
        if driver is None:
            raise last_error
        driver.set_page_load_timeout(config.WEBDRIVER_TIMEOUT)
        yield driver
    finally:
        if driver:
            driver.quit()
