import time
import datetime
import os
import re
import urllib.parse
from bs4 import BeautifulSoup
from selenium.common.exceptions import TimeoutException
from PIL import Image
from flask import current_app

import config
from utils import sse_format

def check_hotpepper_ranking(driver, keyword, salon_name, area_codes):
    """
    ホットペッパービューティーの掲載順位をスクレイピングで取得するジェネレータ関数。
    処理の進捗を yield で返す。
    :param driver: SeleniumのWebDriverインスタンス
    """
    # ユーザー提供のURL形式をベースに変更
    base_url = 'https://beauty.hotpepper.jp/CSP/kr/salonSearch/search/'
    
    # 動的にReferer（アクセス元ページ）を生成
    service_area_cd = area_codes.get('serviceAreaCd')
    middle_area_cd = area_codes.get('middleAreaCd')
    
    # デフォルトのRefererはトップページ
    referer_url = 'https://beauty.hotpepper.jp/kr/'
    if service_area_cd and middle_area_cd:
        # 中エリアまで指定されている場合、そのエリアページをRefererにする
        referer_url = f'https://beauty.hotpepper.jp/kr/svc{service_area_cd}/mac{middle_area_cd}/'
    elif service_area_cd:
        # 大エリアのみの場合
        referer_url = f'https://beauty.hotpepper.jp/kr/svc{service_area_cd}/'

    params = {
        'freeword': keyword,
        'searchT': '検索',
        'genreAlias': 'nail', # ネイル・まつげのジャンルコード
        **area_codes # serviceAreaCd, middleAreaCd, smallAreaCd を展開して追加
    }

    found_salons = [] # 発見したすべてのサロンを格納するリスト
    total_count = 0 # 検索結果の総件数
    screenshot_path = None # スクリーンショットのパス

    last_url_checked = ""
    last_html_content = "リクエストが実行されませんでした。"
    
    # スクリーンショット保存用ディレクトリを作成
    if not os.path.exists(config.SCREENSHOT_DIR):
        os.makedirs(config.SCREENSHOT_DIR)

    try:
        # 最初にRefererとなるページにアクセスして、正規のセッションCookieを取得する
        yield sse_format({"status": "セッションを初期化しています..."})
        try:
            current_app.logger.info(f"セッション初期化のためRefererページ ({referer_url}) にアクセスします。")
            driver.get(referer_url)
            time.sleep(1) # 少し待機
        except Exception as e:
            current_app.logger.warning(f"Refererページへのアクセスに失敗しました: {e}")

        # ページを1から順番にチェック（最大5ページ=100位まで）
        for page in range(1, config.HPB_MAX_PAGES + 1):
            # ページ番号をパラメータに追加
            params['pn'] = page
            # --- URL生成ロジックの修正 ---
            query_string = urllib.parse.urlencode(params)
            url = f"{base_url}?{query_string}"

            yield sse_format({"status": f"{page}ページ目を検索しています..."})
            try:
                driver.get(url)
                time.sleep(1) # ページ描画のための待機
            except TimeoutException:
                current_app.logger.warning(f"ページ {page} ({url}) の読み込みがタイムアウトしました。処理を中断します。")
                break # ループを抜けて、それまでに見つかった結果を返す

            last_url_checked = driver.current_url
            last_html_content = driver.page_source

            soup = BeautifulSoup(last_html_content, 'lxml')

            # ページネーションがスタックしていないか確認
            if page > 1:
                current_page_span = soup.select_one('ul.paging span.current')
                if current_page_span:
                    try:
                        current_page_num = int(current_page_span.get_text(strip=True))
                        if current_page_num < page:
                            current_app.logger.info(f"ページネーションがスタックしました。要求ページ: {page}, 現在のページ: {current_page_num}。検索を終了します。")
                            break
                    except (ValueError, TypeError):
                        current_app.logger.warning("現在のページ番号の解析に失敗しました。")
                else:
                    current_app.logger.info(f"ページ {page} でページネーションが見つかりませんでした。検索の終端と判断します。")
                    break

            # 1ページ目でのみスクリーンショットと総件数を取得
            if page == 1:
                yield sse_format({"status": "スクリーンショットを撮影しています..."})
                # ページ全体の高さを取得してウィンドウサイズを変更し、フルページのスクリーンショットを撮影
                total_height = driver.execute_script("return document.body.parentNode.scrollHeight")
                driver.set_window_size(1200, total_height)
                time.sleep(0.5) # リサイズを待機

                # --- ファイル名生成ロジックの改善 (yyMMdd形式, 接頭辞なし) ---
                timestamp = datetime.datetime.now().strftime("%y%m%d_%H%M%S")
                # ファイル名に使えない文字を置換
                safe_keyword = re.sub(r'[\\/:*?"<>|]', '_', keyword)
                safe_area = re.sub(r'[\\/:*?"<>|]', '_', area_codes.get('areaName', ''))
                base_filename = f"{timestamp}_{safe_area}_{safe_keyword}"
                
                temp_png_path = os.path.join(config.SCREENSHOT_DIR, f"temp_{timestamp}.png") # 一時ファイル名はタイムスタンプのみでOK
                driver.save_screenshot(temp_png_path)

                # 最終的なファイル名を指定
                jpeg_filename = f"{base_filename}.jpg"
                jpeg_filepath = os.path.join(config.SCREENSHOT_DIR, jpeg_filename)
                
                try:
                    with Image.open(temp_png_path) as img:
                        if img.mode == 'RGBA': # JPEGは透明度をサポートしないためRGBに変換
                            img = img.convert('RGB')
                        img.save(jpeg_filepath, 'jpeg', quality=config.SCREENSHOT_JPEG_QUALITY) # qualityは0-95の範囲で調整可能
                    screenshot_path = jpeg_filepath
                    current_app.logger.info(f"画質を調整したスクリーンショットを {jpeg_filepath} に保存しました。")
                finally:
                    if os.path.exists(temp_png_path): # 一時ファイルを削除
                        os.remove(temp_png_path)

                soup_for_count = BeautifulSoup(last_html_content, 'lxml')
                count_span = soup_for_count.select_one('span.numberOfResult')
                if count_span:
                    try:
                        total_count = int(count_span.get_text(strip=True))
                    except (ValueError, TypeError):
                        current_app.logger.warning("総件数の取得または解析に失敗しました。")
                        total_count = 0

            all_salons_on_page = soup.select('h3.slcHead a')
            
            if not all_salons_on_page:
                if page == 1:
                    current_app.logger.info(f"キーワード '{keyword}' の検索結果が0件でした。")
                break # ページにサロンリストがなければループを終了

            for i in range(len(all_salons_on_page)):
                salon_tag = all_salons_on_page[i]
                current_salon_name = salon_tag.get_text(strip=True)
                
                if salon_name in current_salon_name:
                    rank = (page - 1) * 20 + (i + 1)
                    found_salons.append({"rank": rank, "foundSalonName": current_salon_name})

    except Exception as e:
        current_app.logger.error(f"Selenium処理中にエラーが発生しました: {e}")
        yield sse_format({"error": f"ブラウザの操作中にエラーが発生しました。", "url": last_url_checked, "html": last_html_content})
        return

    # --- 最終結果をyield ---
    yield sse_format({"status": "結果を解析しています..."})
    time.sleep(0.5)

    final_result = {
        "total_count": total_count,
        "screenshot_path": screenshot_path,
        "url": last_url_checked,
        "html": last_html_content
    }
    if found_salons:
        final_result["results"] = found_salons
    else:
        final_result["rank"] = "圏外"
    
    yield sse_format({"final_result": final_result, "status": "完了"})