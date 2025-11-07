from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import random
from bs4 import BeautifulSoup
import urllib.parse
import re
import time
import os
import json
import datetime
import traceback # エラー詳細ログのためにインポート
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from PIL import Image
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from feature_page_scraper import check_feature_page_ranking # 新しいスクレイパーをインポート
import threading # ロック機能のためにインポート
from utils import sse_format, get_lat_lng_from_address # 共通関数をインポート
from seo_scraper import check_seo_ranking # SEOスクレイパーをインポート

# app.pyと同じ階層にある静的ファイル(css, js, html)を読み込めるように設定
app = Flask(__name__, static_folder='.', static_url_path='')
# CORS(Cross-Origin Resource Sharing)を有効化
CORS(app)

# --- 環境変数の読み込み ---
load_dotenv()
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    # 起動時にキーがない場合は警告を出す
    app.logger.warning("GOOGLE_API_KEYが.envファイルに設定されていません。MEO計測機能は利用できません。")

# --- グローバル変数と設定 ---
AUTO_TASKS_FILE = 'auto_tasks.json'
# --- 履歴ファイルをタイプ別に分割 ---
HISTORY_FILE_NORMAL = 'history_normal.json'
HISTORY_FILE_SPECIAL = 'history_special.json'
HISTORY_FILE_MEO = 'history_meo.json'
HISTORY_FILE_SEO = 'history_seo.json' # SEO履歴ファイルを追加
SCHEDULER_CONFIG_FILE = 'scheduler_config.json'

# --- 計測ジョブの同時実行を防ぐためのロック ---
measurement_lock = threading.Lock()

def save_json_file(filename, data):
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def load_scheduler_config():
    """スケジューラ設定を読み込む。なければデフォルト値を返す"""
    if not os.path.exists(SCHEDULER_CONFIG_FILE):
        return {"hour": 9, "minute": 0}
    try:
        with open(SCHEDULER_CONFIG_FILE, 'r', encoding='utf-8') as f:
            config = json.load(f)
            if isinstance(config.get('hour'), int) and isinstance(config.get('minute'), int):
                return config
    except (json.JSONDecodeError, IOError, KeyError):
        pass
    return {"hour": 9, "minute": 0}

def save_scheduler_config(config):
    """スケジューラ設定を保存する"""
    with open(SCHEDULER_CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2)

def get_history_filename(task_type):
    """タスクタイプに応じた履歴ファイル名を返す"""
    if task_type == 'special':
        return HISTORY_FILE_SPECIAL
    elif task_type == 'google':
        return HISTORY_FILE_MEO
    elif task_type == 'seo':
        return HISTORY_FILE_SEO
    else: # 'normal' or default
        return HISTORY_FILE_NORMAL

# --- ヘルパー関数 (ファイルの読み書き) ---
def load_json_file(filename):
    if not os.path.exists(filename):
        return []
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

@app.route('/')
def index():
    return app.send_static_file('index.html')

# --- スクリーンショット配信用エンドポイント ---
@app.route('/screenshots/<path:filename>')
def serve_screenshot(filename):
    """screenshotsディレクトリから画像を配信する"""
    return app.send_static_file(os.path.join('screenshots', filename))

# --- ホットペッパー順位計測 ---
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

    # ブラウザからのアクセスを偽装するため、ヘッダーをより詳細に設定
    headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
        # User-Agentはdriver生成時に設定するため、ここでは不要
        'Referer': referer_url # 動的に設定したReferer
    }
    
    # スクリーンショット保存用ディレクトリを作成
    if not os.path.exists('screenshots'):
        os.makedirs('screenshots')

    try:
        # 最初にRefererとなるページにアクセスして、正規のセッションCookieを取得する
        yield sse_format({"status": "セッションを初期化しています..."})
        try:
            app.logger.info(f"セッション初期化のためRefererページ ({referer_url}) にアクセスします。")
            driver.get(referer_url)
            time.sleep(1) # 少し待機
        except Exception as e:
            app.logger.warning(f"Refererページへのアクセスに失敗しました: {e}")

        # ページを1から順番にチェック（最大5ページ=100位まで）
        for page in range(1, 6):
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
                app.logger.warning(f"ページ {page} ({url}) の読み込みがタイムアウトしました。処理を中断します。")
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
                            app.logger.info(f"ページネーションがスタックしました。要求ページ: {page}, 現在のページ: {current_page_num}。検索を終了します。")
                            break
                    except (ValueError, TypeError):
                        app.logger.warning("現在のページ番号の解析に失敗しました。")
                else:
                    app.logger.info(f"ページ {page} でページネーションが見つかりませんでした。検索の終端と判断します。")
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
                
                temp_png_path = os.path.join('screenshots', f"temp_{timestamp}.png") # 一時ファイル名はタイムスタンプのみでOK
                driver.save_screenshot(temp_png_path)

                # 最終的なファイル名を指定
                jpeg_filename = f"{base_filename}.jpg"
                jpeg_filepath = os.path.join('screenshots', jpeg_filename)
                
                try:
                    with Image.open(temp_png_path) as img:
                        if img.mode == 'RGBA': # JPEGは透明度をサポートしないためRGBに変換
                            img = img.convert('RGB')
                        img.save(jpeg_filepath, 'jpeg', quality=15) # qualityは0-95の範囲で調整可能
                    screenshot_path = jpeg_filepath
                    app.logger.info(f"画質を調整したスクリーンショットを {jpeg_filepath} に保存しました。")
                finally:
                    if os.path.exists(temp_png_path): # 一時ファイルを削除
                        os.remove(temp_png_path)

                soup_for_count = BeautifulSoup(last_html_content, 'lxml')
                count_span = soup_for_count.select_one('span.numberOfResult')
                if count_span:
                    try:
                        total_count = int(count_span.get_text(strip=True))
                    except (ValueError, TypeError):
                        app.logger.warning("総件数の取得または解析に失敗しました。")
                        total_count = 0

            all_salons_on_page = soup.select('h3.slcHead a')
            
            if not all_salons_on_page:
                if page == 1:
                    app.logger.info(f"キーワード '{keyword}' の検索結果が0件でした。")
                break # ページにサロンリストがなければループを終了

            for i in range(len(all_salons_on_page)):
                salon_tag = all_salons_on_page[i]
                current_salon_name = salon_tag.get_text(strip=True)
                
                if salon_name in current_salon_name:
                    rank = (page - 1) * 20 + (i + 1)
                    found_salons.append({"rank": rank, "foundSalonName": current_salon_name})

    except Exception as e:
        app.logger.error(f"Selenium処理中にエラーが発生しました: {e}")
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

@app.route('/check-ranking', methods=['GET', 'POST'])
def check_ranking_api():
    if request.method == 'POST':
        data = request.get_json()
    else: # GETリクエストの場合
        data = {
            'serviceKeyword': request.args.get('serviceKeyword'),
            'salonName': request.args.get('salonName'),
            'areaCodes': json.loads(request.args.get('areaCodes', '{}'))
        }

    if not data or 'serviceKeyword' not in data or 'salonName' not in data or 'areaCodes' not in data:
        return jsonify({"error": "キーワード、サロン名、エリアコードのすべてが必要です"}), 400
    
    serviceKeyword = data['serviceKeyword']
    salonName = data['salonName']
    areaCodes = data['areaCodes']
    
    if not measurement_lock.acquire(blocking=False):
        return jsonify({"error": "現在、他の計測タスクが実行中です。しばらく待ってから再度お試しください。"}), 429 # Too Many Requests

    def generate_stream():
        try:
            # WebDriverのライフサイクルをリクエストごとに管理
            chrome_options = Options()
            chrome_options.add_argument("--headless")
            chrome_options.add_argument("--window-size=1200,800")
            user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            chrome_options.add_argument(f'user-agent={user_agent}')
            
            driver = None
            try:
                yield sse_format({"status": "ブラウザを起動しています..."})
                driver = webdriver.Chrome(options=chrome_options)
                driver.set_page_load_timeout(30)
                # ジェネレータから得られる進捗をそのままクライアントに流す
                yield from check_hotpepper_ranking(driver, serviceKeyword, salonName, areaCodes)
            except Exception as e:
                app.logger.error(f"手動計測でのWebDriver生成中にエラー: {e}")
                yield sse_format({"error": "ブラウザの起動に失敗しました。"})
            finally:
                if driver:
                    driver.quit()
        finally:
            measurement_lock.release() # ストリームが終了したら必ずロックを解放

    # ストリーミングレスポンスを返す
    return app.response_class(generate_stream(), mimetype='text/event-stream')

# --- MEO順位計測 ---
def get_lat_lng_from_address(address):
    """地名から緯度・経度を取得する"""
    if not GOOGLE_API_KEY:
        raise ValueError("Google APIキーが設定されていません。")

    geocode_url = f"https://maps.googleapis.com/maps/api/geocode/json?address={urllib.parse.quote(address)}&key={GOOGLE_API_KEY}&language=ja"
    response = requests.get(geocode_url)
    response.raise_for_status()
    data = response.json()

    if data['status'] == 'OK':
        location = data['results'][0]['geometry']['location']
        return location['lat'], location['lng']
    else:
        raise ValueError(f"ジオコーディングに失敗しました: {data.get('error_message', data['status'])}")

def check_meo_ranking(driver, keyword, location_name):
    """Googleマップでの掲載順位をスクレイピングし、見つかった店舗をすべてリストアップするジェネレータ関数"""
    if not GOOGLE_API_KEY:
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
            app.logger.info(f"MEO計測でマップ枠が表示されませんでした。キーワード: {keyword}")
            # --- 修正: 結果を「枠無」に戻す ---
            final_result = {"rank": "枠無", "results": [], "total_count": 0, "screenshot_path": None, "url": driver.current_url, "html": driver.page_source}
            yield sse_format({"final_result": final_result, "status": "完了"})
            return

        # --- 検索結果の妥当性チェックを一旦無効化 ---
        # Googleマップの仕様変更により、ヘッダーから正確な地名を取得するのが困難になったため、
        # 「エリア不一致」の判定が誤動作するケースが増えていました。
        # このため、このチェックを一旦削除し、検索が実行された結果を正として処理を続行します。
        app.logger.info("MEO計測のエリア一致チェックは現在無効化されています。")

        last_url_checked = driver.current_url

        # --- スクリーンショット撮影処理の修正: ウィンドウリサイズ方式に戻す ---
        yield sse_format({"status": "スクリーンショットを撮影しています..."})
        # 確実にパネル全体を描画させるため、一度一番下までスクロールする
        try:
            driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", scrollable_element)
            time.sleep(1) # スクロール後の描画を待つ
            panel_height = driver.execute_script("return arguments[0].scrollHeight", scrollable_element)
            # ウィンドウの高さをパネルの高さに合わせる（最小800px、最大8000pxの制限を追加）
            window_height = max(800, min(panel_height, 8000))
            driver.set_window_size(1200, window_height)
            time.sleep(0.5)

            # スクリーンショット撮影前に、スクロール位置を一番上に戻して検索バーを確実に表示させる
            driver.execute_script("arguments[0].scrollTop = 0", scrollable_element)
            app.logger.info("スクリーンショット撮影のため、スクロール位置をトップに戻しました。")
            time.sleep(0.5)
        except Exception as e:
            app.logger.warning(f"スクリーンショットのためのリサイズ中にエラーが発生: {e}")

        # --- ファイル名生成ロジックの改善 (yyMMdd形式, 接頭辞なし) ---
        timestamp = datetime.datetime.now().strftime("%y%m%d_%H%M%S")
        safe_keyword = re.sub(r'[\\/:*?"<>|]', '_', keyword)
        safe_location = re.sub(r'[\\/:*?"<>|]', '_', location_name)
        base_filename = f"{timestamp}_{safe_location}_{safe_keyword}"

        temp_png_path = os.path.join('screenshots', f"temp_meo_{timestamp}.png")
        driver.save_screenshot(temp_png_path) # ページ全体を撮影

        jpeg_filename = f"{base_filename}.jpg"
        jpeg_filepath = os.path.join('screenshots', jpeg_filename)
        
        try:
            with Image.open(temp_png_path) as img:
                if img.mode == 'RGBA':
                    img = img.convert('RGB')
                img.save(jpeg_filepath, 'jpeg', quality=15) # qualityは0-95の範囲で調整可能
            screenshot_path = jpeg_filepath
        finally:
            if os.path.exists(temp_png_path):
                os.remove(temp_png_path)

        # --- 店舗情報解析ロジック ---
        yield sse_format({"status": "検索結果を解析しています..."})
        found_salons = []
        processed_aria_labels = set()
        for i in range(3): # 3回スクロールして最大60件程度取得を試みる
            yield sse_format({"status": f"検索結果を解析中... ({i+1}/3)"})
            html = driver.page_source
            soup = BeautifulSoup(html, 'lxml')
            
            result_blocks = soup.select('div[role="feed"] > div > div[jsaction]')
            for item_block in result_blocks:
                # 広告要素は除外
                if item_block.find('span', string=re.compile(r'\b広告\b')):
                    continue
                
                name_element = item_block.find('a', {'aria-label': True})
                if name_element and name_element['aria-label'] not in processed_aria_labels:
                    salon_name = name_element['aria-label'].strip()
                    found_salons.append({"rank": len(found_salons) + 1, "foundSalonName": salon_name})
                    processed_aria_labels.add(salon_name)

            # スクロールして新しい項目を読み込む
            try:
                scroll_target = driver.find_element(By.CSS_SELECTOR, scrollable_element_selector)
                driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", scroll_target)
                time.sleep(2.5) # 読み込み待機
            except Exception as scroll_error:
                app.logger.warning(f"スクロール中にエラーが発生しました: {scroll_error}。ループを中断します。")
                break

        # --- 最終結果の整形 ---
        yield sse_format({"status": "結果を解析しています..."})
        time.sleep(0.5)

        final_result = {
            "total_count": len(found_salons), # 実際にカウントしたオーガニック検索の件数
            "screenshot_path": screenshot_path,
            "url": last_url_checked,
            "html": driver.page_source, # 最終的なHTMLを保存
            "results": found_salons
        }

        yield sse_format({"final_result": final_result, "status": "完了"})

    except (ValueError, requests.RequestException) as e:
        app.logger.error(f"MEO計測の準備中にエラーが発生しました: {e}")
        yield sse_format({"error": str(e)})
    except Exception as e:
        app.logger.error(f"MEO計測処理中にエラーが発生しました: {e}")
        # エラー時にもデバッグ情報を返す
        yield sse_format({
            "error": f"ブラウザの操作中にエラーが発生しました: {e}",
            "url": last_url_checked,
            "html": driver.page_source if 'driver' in locals() and driver else "HTMLの取得に失敗しました。",
            "screenshot_path": screenshot_path
        })

@app.route('/check-meo-ranking', methods=['GET'])
def check_meo_ranking_api():
    keyword = request.args.get('keyword')
    location = request.args.get('location')

    if not all([keyword, location]):
        return jsonify({"error": "キーワードと検索地点の両方が必要です"}), 400

    if not measurement_lock.acquire(blocking=False):
        return jsonify({"error": "現在、他の計測タスクが実行中です。しばらく待ってから再度お試しください。"}), 429

    def generate_stream():
        try:
            chrome_options = Options()
            chrome_options.add_argument("--headless")
            chrome_options.add_argument("--window-size=1200,800")
            driver = None
            try:
                driver = webdriver.Chrome(options=chrome_options)
                driver.set_page_load_timeout(30)
                yield from check_meo_ranking(driver, keyword, location)
            finally:
                if driver:
                    driver.quit()
        finally:
            measurement_lock.release()

    return app.response_class(generate_stream(), mimetype='text/event-stream')

@app.route('/check-seo-ranking', methods=['GET'])
def check_seo_ranking_api():
    url_to_find = request.args.get('url')
    keyword = request.args.get('keyword')
    location = request.args.get('location') # location パラメータを受け取る

    if not all([url_to_find, keyword]):
        return jsonify({"error": "URLとキーワードの両方が必要です"}), 400

    if not measurement_lock.acquire(blocking=False):
        return jsonify({"error": "現在、他の計測タスクが実行中です。しばらく待ってから再度お試しください。"}), 429

    def generate_stream():
        try:
            # --- SEO計測用のボット検出回避オプション ---
            user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
            chrome_options = Options()
            chrome_options.add_argument(f'user-agent={user_agent}')
            chrome_options.add_argument('--headless=new')
            chrome_options.add_argument("--window-size=1200,800")
            chrome_options.add_argument('--disable-blink-features=AutomationControlled')
            chrome_options.add_argument('--accept-lang=ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7')
            chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
            chrome_options.add_experimental_option('useAutomationExtension', False)
            driver = None
            try:
                driver = webdriver.Chrome(options=chrome_options)
                driver.set_page_load_timeout(30)
                # --- ボット検出回避のためのスクリプトを実行 ---
                driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
                    "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
                })
                yield from check_seo_ranking(driver, url_to_find, keyword, location) # locationを渡す
            finally:
                if driver:
                    driver.quit()
        finally:
            measurement_lock.release()

    return app.response_class(generate_stream(), mimetype='text/event-stream')

# --- 特集ページ一括計測API ---
@app.route('/api/run-feature-page-tasks', methods=['GET'])
def run_feature_page_tasks_api():
    feature_page_url = request.args.get('featurePageUrl')
    salon_names_json = request.args.get('salonNames')
    
    if not feature_page_url or not salon_names_json:
        return jsonify({"error": "特集ページのURLとサロン名のリストが必要です"}), 400

    try:
        salon_names = json.loads(salon_names_json)
        if not isinstance(salon_names, list) or not salon_names:
            raise ValueError()
    except (json.JSONDecodeError, ValueError):
        return jsonify({"error": "サロン名は有効なリスト形式である必要があります"}), 400

    if not measurement_lock.acquire(blocking=False):
        return jsonify({"error": "現在、他の計測タスクが実行中です。しばらく待ってから再度お試しください。"}), 429

    def generate_stream():
        try:
            chrome_options = Options()
            chrome_options.add_argument("--headless")
            chrome_options.add_argument("--window-size=1200,800")
            user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            chrome_options.add_argument(f'user-agent={user_agent}')
            
            driver = None
            try:
                driver = webdriver.Chrome(options=chrome_options)
                driver.set_page_load_timeout(30)
                # 特集ページ用のスクレイパーを呼び出す
                yield from check_feature_page_ranking(driver, feature_page_url, salon_names)
            finally:
                if driver:
                    driver.quit()
        finally:
            measurement_lock.release()

    return app.response_class(generate_stream(), mimetype='text/event-stream')

# --- 特集ページ順位計測API ---
@app.route('/check-feature-page-ranking', methods=['GET'])
def check_feature_page_ranking_api():
    feature_page_url = request.args.get('featurePageUrl')
    salon_name = request.args.get('salonName')

    if not feature_page_url or not salon_name:
        return jsonify({"error": "特集ページのURLとサロン名が必要です"}), 400

    if not measurement_lock.acquire(blocking=False):
        return jsonify({"error": "現在、他の計測タスクが実行中です。しばらく待ってから再度お試しください。"}), 429

    def generate_stream():
        try:
            chrome_options = Options()
            chrome_options.add_argument("--headless")
            chrome_options.add_argument("--window-size=1200,800")
            user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            chrome_options.add_argument(f'user-agent={user_agent}')
            
            driver = None
            try:
                yield sse_format({"status": "ブラウザを起動しています..."})
                driver = webdriver.Chrome(options=chrome_options)
                driver.set_page_load_timeout(30)
                # 特集ページ用のスクレイパーを呼び出す
                yield from check_feature_page_ranking(driver, feature_page_url, [salon_name])
            except Exception as e:
                app.logger.error(f"特集ページ計測でのWebDriver生成中にエラー: {e}")
                yield sse_format({"error": "ブラウザの起動に失敗しました。"})
            finally:
                if driver:
                    driver.quit()
        finally:
            measurement_lock.release()

    return app.response_class(generate_stream(), mimetype='text/event-stream')


# --- スケジューリング関連 ---
def run_scheduled_check(task_ids_to_run=None, stream_progress=False):
    """
    指定されたタスク、またはすべてのタスクを実行し、結果を履歴ファイルに保存する
    :param task_ids_to_run: 実行するタスクIDのリスト。Noneの場合は全タスクを実行。
    """
    # --- ロックの取得を試みる ---
    if not measurement_lock.acquire(blocking=False):
        app.logger.warning("自動計測ジョブを開始しようとしましたが、既に別の計測が実行中のためスキップします。")
        if stream_progress:
            yield sse_format({"error": "現在、他の計測タスクが実行中です。"})
        return
    with app.app_context():
        app.logger.info("--- 自動計測ジョブを開始します ---")
        all_tasks = load_json_file(AUTO_TASKS_FILE)

        tasks_to_run = []
        if task_ids_to_run:
            # 渡されたIDの順序を維持しつつ、重複を除外する
            seen_ids = set()
            unique_task_ids = []
            for task_id in task_ids_to_run:
                if task_id not in seen_ids:
                    seen_ids.add(task_id)
                    unique_task_ids.append(task_id)
            task_ids_to_run = unique_task_ids
            app.logger.info(f"選択された {len(task_ids_to_run)} 件のタスクを実行します。ID: {task_ids_to_run}")
            tasks_to_run = [task for task in all_tasks if task.get('id') in task_ids_to_run]
        else:
            app.logger.info("スケジュールされた全タスクを実行します。")
            tasks_to_run = all_tasks

        # --- タイプ別に履歴ファイルを読み込む ---
        history_normal = load_json_file(HISTORY_FILE_NORMAL)
        history_special = load_json_file(HISTORY_FILE_SPECIAL)
        history_meo = load_json_file(HISTORY_FILE_MEO)
        history_seo = load_json_file(HISTORY_FILE_SEO) # SEO履歴を読み込む
        today = datetime.date.today().strftime('%Y/%m/%d')

        # --- ロジック見直し：タスクをタイプ別に分割し、特集ページはURLでグループ化 ---
        normal_tasks = []
        special_tasks_grouped_by_url = {}
        meo_tasks = []
        seo_tasks = [] # ループの外で初期化
        for task in tasks_to_run:
            task_type = task.get('type', 'normal')
            if task_type == 'special':
                url = task['featurePageUrl']
                if url not in special_tasks_grouped_by_url:
                    special_tasks_grouped_by_url[url] = []
                special_tasks_grouped_by_url[url].append(task)
            elif task_type == 'google':
                meo_tasks.append(task)
            elif task_type == 'seo':
                seo_tasks.append(task)
            else:
                normal_tasks.append(task)

        total_job_count = len(normal_tasks) + len(special_tasks_grouped_by_url) + len(meo_tasks) + len(seo_tasks)
        job_counter = 0

        # --- 高速化のための変更: WebDriverを一度だけ起動 ---
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--window-size=1200,800")
        user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        chrome_options.add_argument(f'user-agent={user_agent}')
        
        driver = None
        try:
            driver = webdriver.Chrome(options=chrome_options)
            driver.set_page_load_timeout(30)
            
            # --- ボット検出回避のためのスクリプトを実行 ---
            driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
                "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            })

            # --- 1. 通常検索タスクの処理 ---
            for task in normal_tasks:
                job_counter += 1
                task_id = task['id']
                # --- areaNameをtaskから直接取得するように修正 ---
                area_name_for_task = task.get('areaName', '')
                task_name = f"[{area_name_for_task}] {task.get('serviceKeyword', '')}"
                task['areaName'] = area_name_for_task # 念のためtaskオブジェクトにもareaNameをセット

                if stream_progress:
                    yield sse_format({"progress": {"current": job_counter, "total": total_job_count, "task": task}})
                else:
                    app.logger.info(f"タスク '{task_id}' の計測を開始...")

                result = {}
                scraper_generator = check_hotpepper_ranking(driver, task['serviceKeyword'], task['salonName'], task['areaCodes'])
                for sse_message in scraper_generator:
                    if stream_progress:
                        data = json.loads(sse_message.split('data: ')[1])
                        if 'status' in data:
                            yield sse_format({"status": data['status'], "task_name": task_name})
                    data = json.loads(sse_message.split('data: ')[1])
                    if 'final_result' in data:
                        result = data['final_result']

                rank_to_save = result.get('results', [{}])[0].get('rank', '圏外')
                screenshot_path_to_save = result.get('screenshot_path')

                update_history(history_normal, task, today, rank_to_save, screenshot_path_to_save)
                app.logger.info(f"タスク '{task_id}' の結果: {rank_to_save}位")

                if stream_progress:
                    yield sse_format({"result": {"rank": rank_to_save, "total_count": result.get('total_count'), "task_name": task_name, "task_id": task_id}})
                    time.sleep(1) # フロントエンドでの表示のためのウェイト
                else:
                    time.sleep(random.uniform(5, 15)) # 5〜15秒のランダムな待機 (elif not stream_progress: から else: に変更)

            # --- 2. 特集ページタスクの処理（URLごとに一括） ---
            for url, tasks_in_group in special_tasks_grouped_by_url.items():
                job_counter += 1
                salon_names_in_group = [t['salonName'] for t in tasks_in_group]
                
                # フロントエンドに進捗を伝えるための代表タスク
                representative_task = tasks_in_group[0]
                task_name = representative_task.get('featurePageName', url)

                if stream_progress:
                    yield sse_format({"progress": {"current": job_counter, "total": total_job_count, "task": representative_task}})
                else:
                    app.logger.info(f"特集ページ '{url}' の一括計測を開始... 対象サロン: {salon_names_in_group}")

                result = {}
                scraper_generator = check_feature_page_ranking(driver, url, salon_names_in_group)
                for sse_message in scraper_generator:
                    if stream_progress:
                        data = json.loads(sse_message.split('data: ')[1])
                        if 'status' in data:
                            yield sse_format({"status": data['status'], "task_name": task_name})
                    
                    data = json.loads(sse_message.split('data: ')[1])
                    if 'final_result' in data:
                        result = data['final_result']

                # グループ内の各タスクについて履歴を更新
                for task in tasks_in_group:
                    task_id = task['id']
                    salon_name = task['salonName']
                    
                    # ページタイトルが取得でき、タスクに未設定なら保存
                    page_title = result.get('page_title')
                    if page_title and not task.get('featurePageName'):
                        task['featurePageName'] = page_title
                        # all_tasks内の該当タスクも更新
                        original_task = next((t for t in all_tasks if t.get('id') == task_id), None)
                        if original_task:
                            original_task['featurePageName'] = page_title

                    salon_results = result.get('results_map', {}).get(salon_name, [])
                    rank_to_save = salon_results[0]['rank'] if salon_results else '圏外'
                    screenshot_path_to_save = result.get('screenshot_path')

                    update_history(history_special, task, today, rank_to_save, screenshot_path_to_save)
                    app.logger.info(f"タスク '{task_id}' ({salon_name}) の結果: {rank_to_save}位")

                    if stream_progress:
                        # 個別のタスク名を生成して結果を送信
                        individual_task_name = f"[{task['salonName']}] {task.get('featurePageName', task.get('featurePageUrl'))}"
                        yield sse_format({"result": {"rank": rank_to_save, "total_count": result.get('total_count'), "task_name": individual_task_name, "task_id": task_id}})
                        time.sleep(1)
                
                else:
                    time.sleep(random.uniform(5, 15)) # 5〜15秒のランダムな待機 (elif not stream_progress: から else: に変更)

            # --- 3. MEOタスクの処理 ---
            for task in meo_tasks:
                job_counter += 1
                try:
                    task_id = task['id']
                    task_name = f"[{task.get('searchLocation', '')}] {task.get('keyword', '')}"

                    if stream_progress:
                        yield sse_format({"progress": {"current": job_counter, "total": total_job_count, "task": task}})
                    else:
                        app.logger.info(f"MEOタスク '{task_id}' の計測を開始...")

                    result = {}
                    scraper_generator = check_meo_ranking(driver, task['keyword'], task['searchLocation'])
                    for sse_message in scraper_generator:
                        if stream_progress:
                            data = json.loads(sse_message.split('data: ')[1])
                            if 'status' in data:
                                yield sse_format({"status": data['status'], "task_name": task_name})
                        data = json.loads(sse_message.split('data: ')[1])
                        if 'final_result' in data:
                            result = data['final_result']

                    # MEOの結果から自店の順位を特定
                    # --- 修正: 「枠無」の場合を正しく処理する ---
                    if result.get("rank") == "枠無":
                        # 地図枠自体が表示されなかった場合
                        rank_to_save = "枠無"
                    else:
                        my_salon_result = next((r for r in result.get('results', []) if task['salonName'].lower() in r.get('foundSalonName', '').lower()), None)
                        rank_to_save = my_salon_result['rank'] if my_salon_result else '圏外'
                    
                    screenshot_path_to_save = result.get('screenshot_path')

                    update_history(history_meo, task, today, rank_to_save, screenshot_path_to_save)
                    app.logger.info(f"MEOタスク '{task_id}' の結果: {rank_to_save}")

                    if stream_progress:
                        yield sse_format({"result": {"rank": rank_to_save, "total_count": result.get('total_count'), "task_name": task_name, "task_id": task_id}})
                        time.sleep(1)
                    else:
                        time.sleep(random.uniform(5, 15))
                except Exception as e:
                    app.logger.error(f"MEOタスク '{task.get('id', '不明')}' の処理中にエラーが発生しました: {e}")
                    update_history(history_meo, task, today, "エラー", None) # 履歴にエラーを記録

            # --- 4. SEOタスクの処理 ---
            for task in seo_tasks:
                job_counter += 1
                try:
                    task_id = task['id']
                    task_name = f"[{task.get('url')}] {task.get('keyword')}"

                    if stream_progress:
                        yield sse_format({"progress": {"current": job_counter, "total": total_job_count, "task": task}})
                    else:
                        app.logger.info(f"SEOタスク '{task_id}' の計測を開始...")

                    result = {}
                    scraper_generator = check_seo_ranking(driver, task['url'], task['keyword'], task.get('searchLocation'))
                    for sse_message in scraper_generator:
                        if stream_progress:
                            data = json.loads(sse_message.split('data: ')[1])
                            if 'status' in data:
                                yield sse_format({"status": data['status'], "task_name": task_name})
                        data = json.loads(sse_message.split('data: ')[1])
                        if 'final_result' in data:
                            result = data['final_result']

                    rank_to_save = result.get('results', [{}])[0].get('rank', result.get('rank', '圏外'))
                    screenshot_path_to_save = result.get('screenshot_path')

                    update_history(history_seo, task, today, rank_to_save, screenshot_path_to_save)
                    app.logger.info(f"SEOタスク '{task_id}' の結果: {rank_to_save}")

                    if stream_progress:
                        yield sse_format({"result": {"rank": rank_to_save, "task_name": task_name, "task_id": task_id}})
                        time.sleep(1)
                    else:
                        time.sleep(random.uniform(5, 15))
                except Exception as e:
                    app.logger.error(f"SEOタスク '{task.get('id', '不明')}' の処理中にエラーが発生しました: {e}")
                    update_history(history_seo, task, today, "エラー", None)

        except Exception as e:
            app.logger.error(f"自動計測ジョブ全体でエラーが発生しました: {e}")
        finally:
            if driver:
                driver.quit() # 全てのタスクが終わったらブラウザを終了
            # --- タイプ別に履歴ファイルを保存 ---
            save_json_file(HISTORY_FILE_NORMAL, history_normal)
            save_json_file(HISTORY_FILE_SPECIAL, history_special)
            save_json_file(HISTORY_FILE_MEO, history_meo)
            save_json_file(HISTORY_FILE_SEO, history_seo) # SEO履歴を保存
            # 特集ページ名が更新された可能性があるので、タスクファイルも保存
            save_json_file(AUTO_TASKS_FILE, all_tasks)
            
            if stream_progress:
                measurement_lock.release() # ストリーミングの場合はここで解放
                yield sse_format({"final_status": f"すべての計測が完了しました。（{total_job_count}件）"})
            else:
                app.logger.info("--- 自動計測ジョブが完了しました ---")
                measurement_lock.release() # 通常のジョブの場合はここで解放

def update_history(history, task, date_str, rank, screenshot_path):
    """履歴リストを更新するヘルパー関数"""
    task_id = task['id']
    task_history = next((item for item in history if item["id"] == task_id), None)
    log_entry = {'date': date_str, 'rank': rank, 'screenshot': screenshot_path}

    if task_history:
        date_entry = next((d for d in task_history['log'] if d['date'] == date_str), None)
        if date_entry:
            date_entry.update(log_entry)
        else:
            task_history['log'].append(log_entry)
            task_history['log'].sort(key=lambda x: datetime.datetime.strptime(x['date'], '%Y/%m/%d'))
    else:
        history.append({
            "id": task_id,
            "task": task,
            "log": [log_entry]
        })

@app.route('/api/auto-tasks', methods=['GET', 'POST'])
def handle_auto_tasks():
    if request.method == 'GET':
        # ファイルが存在しない場合や空の場合のハンドリングを追加
        tasks = load_json_file(AUTO_TASKS_FILE)
        return jsonify(tasks)
    if request.method == 'POST':
        tasks = request.get_json()
        if not isinstance(tasks, list):
            return jsonify({"error": "リクエストはリスト形式である必要があります"}), 400
        save_json_file(AUTO_TASKS_FILE, tasks)
        return jsonify({"message": "設定を保存しました"}), 200

@app.route('/api/save-auto-history-entry', methods=['POST'])
def save_auto_history_entry():
    """手動実行された自動計測タスクの結果を1件保存する"""
    data = request.get_json()
    if not data or 'task' not in data or 'result' not in data:
        return jsonify({"error": "タスク情報と結果が必要です"}), 400

    task = data['task']
    result = data['result']
    task_id = task['id']
    today = datetime.date.today().strftime('%Y/%m/%d')
    
    # --- 正しい履歴ファイルを読み書きする ---
    history_filename = get_history_filename(task.get('type'))
    history = load_json_file(history_filename)
    task_history = next((item for item in history if item["id"] == task_id), None)
    log_entry = {'date': today, 'rank': result.get('rank', '圏外'), 'screenshot': result.get('screenshot_path')}

    if task_history:
        date_entry = next((d for d in task_history['log'] if d['date'] == today), None)
        if date_entry:
            date_entry.update(log_entry)
        else:
            # ログを日付でソートしてから追加
            task_history['log'].append(log_entry)
            task_history['log'].sort(key=lambda x: datetime.datetime.strptime(x['date'], '%Y/%m/%d'))

    else:
        history.append({"id": task_id, "task": task, "log": [log_entry]})

    save_json_file(history_filename, history)
    return jsonify({"message": f"タスク '{task_id}' の履歴を保存しました。"}), 200

@app.route('/api/auto-history', methods=['GET'])
def get_auto_history():
    # --- 3つの履歴ファイルをマージして返す ---
    history_normal = load_json_file(HISTORY_FILE_NORMAL)
    history_special = load_json_file(HISTORY_FILE_SPECIAL)
    history_meo = load_json_file(HISTORY_FILE_MEO)
    history_seo = load_json_file(HISTORY_FILE_SEO) # SEO履歴を読み込む
    all_history = history_normal + history_special + history_meo + history_seo
    return jsonify(all_history)

@app.route('/api/schedule', methods=['GET', 'POST'])
def handle_schedule():
    if request.method == 'GET':
        config = load_scheduler_config()
        return jsonify(config)
    
    if request.method == 'POST':
        data = request.get_json()
        if not data or 'hour' not in data or 'minute' not in data:
            return jsonify({"error": "hourとminuteが必要です"}), 400
        
        hour = data.get('hour')
        minute = data.get('minute')

        if not (isinstance(hour, int) and 0 <= hour <= 23 and isinstance(minute, int) and 0 <= minute <= 59):
            return jsonify({"error": "無効な時間です"}), 400

        save_scheduler_config({"hour": hour, "minute": minute})
        return jsonify({"message": "実行時間を保存しました。変更を有効にするには、アプリケーションの再起動が必要です。"}), 200

@app.route('/api/run-tasks-manually', methods=['GET'])
def run_tasks_manually():
    """
    フロントエンドから手動でトリガーされた複数のタスクを、ストリーミングで実行・進捗報告するAPI。
    ブラウザの起動を一度に抑えることで、リソース消費を削減する。
    """
    # GETリクエストのクエリパラメータからtask_idsを取得
    task_ids_json = request.args.get('task_ids')
    if task_ids_json:
        task_ids = json.loads(task_ids_json)
    else:
        task_ids = None

    if task_ids is None or not isinstance(task_ids, list):
        return jsonify({"error": "実行するタスクIDのリストが必要です。"}), 400

    def generate_stream():
        # run_scheduled_check と同様のロジックだが、進捗をyieldで返す
        yield from run_scheduled_check(task_ids_to_run=task_ids, stream_progress=True)

    return app.response_class(generate_stream(), mimetype='text/event-stream')

@app.route('/api/run-auto-check-now', methods=['POST'])
def run_auto_check_now_api():
    """【旧API・互換性のため残置】手動で自動計測ジョブをトリガーするAPI"""
    data = request.get_json()
    task_ids = data.get('task_ids') if data else None

    if not task_ids or not isinstance(task_ids, list):
        return jsonify({"error": "実行するタスクIDのリストが必要です。"}), 400

    app.logger.info("手動での自動計測ジョブを開始します。")
    run_scheduled_check(task_ids_to_run=task_ids)
    app.logger.info("手動での自動計測ジョブが完了しました。")
    return jsonify({"message": f"{len(task_ids)}件のタスクを実行しました。ページをリロードして結果を確認してください。"}), 200

# --- アプリケーションの起動とスケジューラの設定 ---
scheduler = BackgroundScheduler(daemon=True)

# 設定ファイルから実行時間を読み込む
config = load_scheduler_config()
run_hour = config.get('hour', 9)
run_minute = config.get('minute', 0)

# 毎日指定された時間にジョブを実行
scheduler.add_job(
    run_scheduled_check,
    'cron',
    hour=run_hour,
    minute=run_minute,
    misfire_grace_time=3600  # 実行予定時刻から1時間以内なら、遅れても実行する
)

# --- 起動時に一度だけ実行するデータ移行処理 ---
def migrate_meo_history_ids():
    """
    古い形式のMEO履歴IDを新しい `[google]-` プレフィックス付きのIDに移行する。
    この関数はアプリケーション起動時に一度だけ実行される。
    """
    with app.app_context():
        history_meo = load_json_file(HISTORY_FILE_MEO)
        updated = False
        for item in history_meo:
            task = item.get('task', {})
            task_id = item.get('id')
            # IDが '[google]-' プレフィックスを持たず、かつタイプが 'google' のものを対象とする
            if task.get('type') == 'google' and task_id and not task_id.startswith('[google]-'):
                app.logger.info(f"古いMEO履歴IDを移行します: {task_id}")
                # IDを分解して再構築する
                parts = task_id.split('-')
                if len(parts) >= 3:
                    salon_name = parts[0]
                    search_location = parts[1]
                    keyword = '-'.join(parts[2:]) # キーワードにハイフンが含まれる場合を考慮
                    new_id = f"[google]-{salon_name}-{search_location}-{keyword}"
                    item['id'] = new_id
                    task['id'] = new_id
                    updated = True
                else:
                    app.logger.warning(f"古いMEO履歴IDの形式が不正です。スキップします: {task_id}")
        
        if updated:
            save_json_file(HISTORY_FILE_MEO, history_meo)
            app.logger.info("MEO履歴IDの移行が完了しました。")

migrate_meo_history_ids()

scheduler.start()
app.logger.info(f"スケジューラを起動しました。毎日{run_hour:02d}:{run_minute:02d}に自動計測を実行します。(猶予時間: 1時間)")

if __name__ == '__main__':
    # Flaskアプリを起動
    app.run(debug=True, port=5001, use_reloader=False) # use_reloader=Falseが重要
