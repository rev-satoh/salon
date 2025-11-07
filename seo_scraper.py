import time
import datetime
import os
import json
import re
import urllib.parse
import random
import traceback
from bs4 import BeautifulSoup
from selenium.webdriver.common.by import By
from PIL import Image

# 共通関数をutils.pyからインポート
from utils import sse_format, get_lat_lng_from_address

def check_seo_ranking(driver, url_to_find, keyword, location_name=None):
    """Google検索での掲載順位をスクレイピングするジェネレータ関数"""
    last_url_checked = ""

    # --- CAPTCHA検知とリトライのためのラッパー関数 ---
    def attempt_search(attempt_num):
        screenshot_path_local = None
        last_url_checked_local = ""

        try:
            # --- 1. 検索実行 ---
            # num=100で100件表示をリクエスト
            search_url = f"https://www.google.com/search?q={urllib.parse.quote(keyword)}&hl=ja&num=100"
            driver.get(search_url)
            last_url_checked_local = driver.current_url
            time.sleep(random.uniform(1.5, 2.5))

            # --- ページネーション対応の検索ロジック ---
            found_results_local = []
            # 1ページ（100位）までチェック
            
            # Cookie同意画面が表示された場合の対応
            if "consent.google.com" in driver.current_url:
                return "consent_required", None

            # 1ページ目でのみスクリーンショット撮影
            timestamp = datetime.datetime.now().strftime("%y%m%d_%H%M%S")
            safe_keyword = re.sub(r'[\\/:*?"<>|]', '_', keyword)
            base_filename = f"seo_{timestamp}_{safe_keyword}"
            temp_png_path = os.path.join('screenshots', f"temp_{base_filename}.png")
            driver.save_screenshot(temp_png_path)

            jpeg_filename = f"{base_filename}.jpg"
            jpeg_filepath = os.path.join('screenshots', jpeg_filename)
            try:
                with Image.open(temp_png_path) as img:
                    if img.mode == 'RGBA': img = img.convert('RGB')
                    img.save(jpeg_filepath, 'jpeg', quality=15)
                screenshot_path_local = jpeg_filepath
            finally:
                if os.path.exists(temp_png_path): os.remove(temp_png_path)
            
            # CAPTCHA画面が表示されていないかチェック
            if "g-recaptcha" in driver.page_source or "お使いのコンピュータ ネットワークから通常と異なるトラフィックが検出されました" in driver.page_source:
                print(f"CAPTCHAが検出されました。キーワード: {keyword}")
                return "captcha", screenshot_path_local

            # --- 検索結果の解析 ---
            soup = BeautifulSoup(driver.page_source, 'lxml')
            search_results = soup.select('div.g') # 通常の検索結果ブロック
            
            rank = 0
            for result_block in search_results:
                link_tag = result_block.find('a', href=True)
                h3_tag = result_block.find('h3')
                if not link_tag or not h3_tag:
                    continue
                
                rank += 1
                found_url = link_tag['href']
                
                # URLを正規化して比較
                normalized_found_url = found_url.replace('https://', '').replace('http://', '').replace('www.', '').rstrip('/')
                normalized_target_url = url_to_find.replace('https://', '').replace('http://', '').replace('www.', '').rstrip('/')

                if normalized_target_url in normalized_found_url:
                    found_results_local.append({
                        "rank": rank,
                        "title": h3_tag.get_text(strip=True),
                        "url": found_url
                    })
                    break # 見つかったらループを抜ける

            # --- 最終結果の整形 ---
            final_result = {
                "screenshot_path": screenshot_path_local,
                "url": last_url_checked_local,
            }
            if found_results_local:
                final_result["results"] = found_results_local
            else:
                final_result["rank"] = "圏外"

            return "success", final_result

        except Exception as e:
            print(f"attempt_search内でエラー: {e}\n{traceback.format_exc()}")
            return "error", {"error": f"検索試行中にエラーが発生しました: {e}", "url": last_url_checked_local}

    # --- メインの実行ロジック ---
    try:
        if location_name:
            try:
                yield sse_format({"status": f"「{location_name}」の座標を取得しています..."})
                latitude, longitude = get_lat_lng_from_address(location_name)
                yield sse_format({"status": f"座標 ({latitude:.4f}, {longitude:.4f}) を取得しました。"})
                time.sleep(0.5)
                yield sse_format({"status": "ブラウザの位置情報を設定しています..."})
                driver.execute_cdp_cmd(
                    "Emulation.setGeolocationOverride",
                    {"latitude": latitude, "longitude": longitude, "accuracy": 100},
                )
            except Exception as e:
                yield sse_format({"error": f"位置情報の設定中にエラーが発生しました: {e}"})
                return

        yield sse_format({"status": "Cookieポリシーに同意しています..."})
        driver.get("https://www.google.com")
        # Cookie同意画面を回避するためのCookieを設定
        driver.add_cookie({"name": "SOCS", "value": "CONSENT+PENDING+999"})
        time.sleep(0.5)

        yield sse_format({"status": f"Googleで「{keyword}」を検索しています..."})
        status, result = attempt_search(1)

        if status == "success":
            yield sse_format({"final_result": result, "status": "完了"})
        elif status == "captcha":
            final_result = { "rank": "CAPTCHA", "screenshot_path": result, "url": driver.current_url }
            yield sse_format({"final_result": final_result, "status": "完了"})
        else: # error or other
            yield sse_format({"error": result.get("error", "不明なエラー")})

    except Exception as e:
        print(f"check_seo_rankingのメインロジックでエラー: {e}\n{traceback.format_exc()}")
        yield sse_format({"error": f"ブラウザの操作中にエラーが発生しました: {e}", "url": last_url_checked})