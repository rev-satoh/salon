from contextlib import contextmanager
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from flask import current_app

import config

@contextmanager
def get_webdriver(is_seo=False):
    """WebDriverインスタンスを生成し、終了時にクリーンアップするコンテキストマネージャ"""
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument(f"--window-size=1200,800")
    chrome_options.add_argument(f'user-agent={config.DEFAULT_USER_AGENT}')

    if is_seo:
        current_app.logger.info("SEO用のWebDriverオプションを適用します。")
        chrome_options.add_argument('--disable-blink-features=AutomationControlled')
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)

    driver = None
    try:
        driver = webdriver.Chrome(options=chrome_options)
        driver.set_page_load_timeout(config.WEBDRIVER_TIMEOUT)
        
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        })
        yield driver
    finally:
        if driver:
            driver.quit()