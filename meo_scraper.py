import time
import datetime
import os
import re
import urllib.parse
import requests
from bs4 import BeautifulSoup
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from PIL import Image
from flask import current_app

import config
from utils import sse_format, get_lat_lng_from_address

def check_meo_ranking(driver, keyword, location_name, target_salon_name=None, save_screenshot=True):
    """Googleマップでの掲載順位をスクレイピングし、見つかった店舗をすべてリストアップするジェネレータ関数"""
    try:
        if not config.GOOGLE_API_KEY:
            yield sse_format({"error": "Google APIキーが設定されていません。"})
            return
        
        # エラー発生時に備え、デバッグ用変数を初期化
        last_url_checked = ""
        screenshot_path = None
        
        # 1. 検索地点の座標を取得
        yield sse_format({"status": f"「{location_name}」の座標を取得しています..."})
        latitude, longitude = get_lat_lng_from_address(location_name)
        yield sse_format({"status": f"座標 ({latitude:.4f}, {longitude:.4f}) を取得しました。"})
        time.sleep(0.5)

        # ブラウザの位置情報をエミュレート
        yield sse_format({"status": "ブラウザの位置情報を設定しています..."})
        driver.execute_cdp_cmd(
            "Emulation.setGeolocationOverride",
            {
                "latitude": latitude,
                "longitude": longitude,
                "accuracy": 100,
            },
        )

        # 検索URLの生成
        search_params = f"{urllib.parse.quote(keyword)}/@{latitude},{longitude},15z"
        search_url = f"https://www.google.com/maps/search/{search_params}?hl=ja&gl=JP"
        yield sse_format({"status": f"Googleマップで「{keyword}」を検索しています..."})
        driver.get(search_url)

        scrollable_element_selector = 'div[role="feed"]' 
        
        try:
            # 検索結果のフィードが表示されるまで最大10秒待機
            wait = WebDriverWait(driver, 10)
            scrollable_element = wait.until(
                EC.presence_of_element_located((By.CSS_SELECTOR, scrollable_element_selector))
            )
        except TimeoutException:
            # マップ枠が表示されなかった場合
            current_app.logger.info(f"MEO計測でマップ枠が表示されませんでした。キーワード: {keyword}")
            final_result = {"rank": "枠無", "results": [], "total_count": 0, "screenshot_path": None, "url": driver.current_url, "html": driver.page_source}
            yield sse_format({"final_result": final_result, "status": "完了"})
            return

        last_url_checked = driver.current_url

        if save_screenshot:
            yield sse_format({"status": "スクリーンショットを撮影しています..."})
            try:
                # 一旦下にスクロールして高さを確定させ、窓サイズを調整して撮影
                driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", scrollable_element)
                time.sleep(1)
                panel_height = driver.execute_script("return arguments[0].scrollHeight", scrollable_element)
                window_height = max(800, min(panel_height, 8000))
                driver.set_window_size(1200, window_height)
                time.sleep(0.5)
                driver.execute_script("arguments[0].scrollTop = 0", scrollable_element)
                time.sleep(0.5)
            except Exception as e:
                current_app.logger.warning(f"スクリーンショットのためのリサイズ中にエラーが発生: {e}")

            timestamp = datetime.datetime.now().strftime("%y%m%d_%H%M%S")
            safe_keyword = re.sub(r'[\\/:*?"<>|]', '_', keyword)
            safe_location = re.sub(r'[\\/:*?"<>|]', '_', location_name)
            base_filename = f"{timestamp}_{safe_location}_{safe_keyword}"

            temp_png_path = os.path.join(config.SCREENSHOT_DIR, f"temp_meo_{timestamp}.png")
            driver.save_screenshot(temp_png_path)

            jpeg_filename = f"{base_filename}.jpg"
            jpeg_filepath = os.path.join(config.SCREENSHOT_DIR, jpeg_filename)
            
            try:
                with Image.open(temp_png_path) as img:
                    if img.mode == 'RGBA':
                        img = img.convert('RGB')
                    img.save(jpeg_filepath, 'jpeg', quality=config.SCREENSHOT_JPEG_QUALITY)
                screenshot_path = jpeg_filepath
            finally:
                if os.path.exists(temp_png_path):
                    os.remove(temp_png_path)

        yield sse_format({"status": "検索結果を解析しています..."})
        found_salons = []
        processed_aria_labels = set()
        
        # 最大5回（約100位）までスクロールを試みる
        max_scrolls = 5
        for i in range(max_scrolls):
            yield sse_format({"status": f"検索結果を解析中... ({i+1}/{config.MEO_SCROLL_COUNT})"})
            html = driver.page_source
            soup = BeautifulSoup(html, 'lxml')
            
            # 店舗ブロックを抽出
            result_blocks = soup.select('div[role="feed"] > div > div[jsaction]')
            for item_block in result_blocks:
                found_target_this_cycle = False
                if item_block.find('span', string=re.compile(r'広告')):
                    continue
                
                name_element = item_block.find('a', {'aria-label': True})
                if name_element and name_element['aria-label'] not in processed_aria_labels:
                    salon_name = name_element['aria-label'].strip()
                    found_salons.append({"rank": len(found_salons) + 1, "foundSalonName": salon_name})
                    processed_aria_labels.add(salon_name)
                    
                    # 自店が見つかった場合はフラグを立てる
                    if target_salon_name and target_salon_name.lower() in salon_name.lower():
                        found_target_this_cycle = True
            
            if target_salon_name and any(target_salon_name.lower() in s['foundSalonName'].lower() for s in found_salons):
                yield sse_format({"status": f"自店「{target_salon_name}」が見つかったため、解析を終了します。"})
                break
                
            # 次の読み込みのためにスクロール
            try:
                scroll_target = driver.find_element(By.CSS_SELECTOR, scrollable_element_selector)
                driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", scroll_target)
                time.sleep(2.5) # ロード待ち
            except Exception:
                break

        final_result = {
            "total_count": len(found_salons),
            "screenshot_path": screenshot_path,
            "url": last_url_checked,
            "html": driver.page_source,
            "results": found_salons
        }
        yield sse_format({"final_result": final_result, "status": "完了"})

    except Exception as e:
        current_app.logger.error(f"MEO計測処理中にエラーが発生しました: {e}")
        yield sse_format({
            "error": f"ブラウザの操作中にエラーが発生しました: {e}",
            "url": driver.current_url if 'driver' in locals() and driver else "",
            "html": driver.page_source if 'driver' in locals() and driver else "HTML取得失敗",
            "screenshot_path": None
        })