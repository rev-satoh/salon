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

def check_meo_ranking(driver, keyword, location_name, save_screenshot=True):
    """Googleマップでの掲載順位をスクレイピングし、見つかった店舗をすべてリストアップするジェネレータ関数"""
    if not config.GOOGLE_API_KEY:
        yield sse_format({"error": "Google APIキーが設定されていません。"})
        return
    
    # エラー発生時に備え、デバッグ用変数を初期化
    last_url_checked = ""
    screenshot_path = None

    try:
        # 1. 検索地点の座標を取得
        yield sse_format({"status": f"「{location_name}」の座標を取得しています..."})
        latitude, longitude = get_lat_lng_from_address(location_name)
        yield sse_format({"status": f"座標 ({latitude:.4f}, {longitude:.4f}) を取得しました。"})
        time.sleep(0.5)

    except ValueError as e:
        yield sse_format({"error": str(e)})
        return
    except requests.RequestException as e:
        yield sse_format({"error": f"Google Geocoding APIへの接続に失敗しました: {e}"})
        return

    try:
        yield sse_format({"status": "ブラウザの位置情報を設定しています..."})
        driver.execute_cdp_cmd(
            "Emulation.setGeolocationOverride",
            {
                "latitude": latitude,
                "longitude": longitude,
                "accuracy": 100,
            },
        )

        # --- 検索URLをより正確に指定するように改善 ---
        # 緯度経度と言語・国コードをURLに含めることで、検索の精度と安定性を向上させる
        search_params = f"{urllib.parse.quote(keyword)}/@{latitude},{longitude},15z"
        search_url = f"https://www.google.com/maps/search/{search_params}?hl=ja&gl=JP"
        yield sse_format({"status": f"Googleマップで「{keyword}」を検索しています..."})
        driver.get(search_url)

        # --- スクレイピング処理 ---
        # Googleマップの検索結果は動的に読み込まれるため、スクロールして要素を読み込ませる
        # 検索結果のリストが含まれる可能性のある親要素を探す
        scrollable_element_selector = 'div[role="feed"]' 
        
        try:
            # 検索結果のフィードが表示されるまで最大10秒待機
            wait = WebDriverWait(driver, 10)
            scrollable_element = wait.until(
                EC.presence_of_element_located((By.CSS_SELECTOR, scrollable_element_selector))
            )
            time.sleep(1) # 描画の安定化のため少し待つ
        except TimeoutException:
            # マップ枠が表示されなかった場合
            current_app.logger.info(f"MEO計測でマップ枠が表示されませんでした。キーワード: {keyword}")
            # --- 修正: 結果を「枠無」に戻す ---
            final_result = {"rank": "枠無", "results": [], "total_count": 0, "screenshot_path": None, "url": driver.current_url, "html": driver.page_source}
            yield sse_format({"final_result": final_result, "status": "完了"})
            return

        current_app.logger.info("MEO計測のエリア一致チェックは現在無効化されています。")

        last_url_checked = driver.current_url

        if save_screenshot:
            yield sse_format({"status": "スクリーンショットを撮影しています..."})
            try:
                driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", scrollable_element)
                time.sleep(1)
                panel_height = driver.execute_script("return arguments[0].scrollHeight", scrollable_element)
                window_height = max(800, min(panel_height, 8000))
                driver.set_window_size(1200, window_height)
                time.sleep(0.5)
                driver.execute_script("arguments[0].scrollTop = 0", scrollable_element)
                current_app.logger.info("スクリーンショット撮影のため、スクロール位置をトップに戻しました。")
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
        for i in range(config.MEO_SCROLL_COUNT):
            yield sse_format({"status": f"検索結果を解析中... ({i+1}/{config.MEO_SCROLL_COUNT})"})
            html = driver.page_source
            soup = BeautifulSoup(html, 'lxml')
            
            result_blocks = soup.select('div[role="feed"] > div > div[jsaction]')
            for item_block in result_blocks:
                if item_block.find('span', string=re.compile(r'広告')):
                    continue
                
                name_element = item_block.find('a', {'aria-label': True})
                if name_element and name_element['aria-label'] not in processed_aria_labels:
                    salon_name = name_element['aria-label'].strip()
                    found_salons.append({"rank": len(found_salons) + 1, "foundSalonName": salon_name})
                    processed_aria_labels.add(salon_name)

            try:
                scroll_target = driver.find_element(By.CSS_SELECTOR, scrollable_element_selector)
                driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", scroll_target)
                time.sleep(2.5)
            except Exception as scroll_error:
                current_app.logger.warning(f"スクロール中にエラーが発生しました: {scroll_error}。ループを中断します。")
                break

        yield sse_format({"status": "結果を解析しています..."})
        time.sleep(0.5)

        final_result = {
            "total_count": len(found_salons),
            "screenshot_path": screenshot_path,
            "url": last_url_checked,
            "html": driver.page_source,
            "results": found_salons
        }

        yield sse_format({"final_result": final_result, "status": "完了"})

    except (ValueError, requests.RequestException) as e:
        current_app.logger.error(f"MEO計測の準備中にエラーが発生しました: {e}")
        yield sse_format({"error": str(e)})
    except Exception as e:
        current_app.logger.error(f"MEO計測処理中にエラーが発生しました: {e}")
        yield sse_format({
            "error": f"ブラウザの操作中にエラーが発生しました: {e}",
            "url": last_url_checked,
            "html": driver.page_source if 'driver' in locals() and driver else "HTMLの取得に失敗しました。",
            "screenshot_path": screenshot_path
        })