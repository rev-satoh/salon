from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import urllib.parse
import time
import os
import json
import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException
from PIL import Image
from apscheduler.schedulers.background import BackgroundScheduler
from feature_page_scraper import check_feature_page_ranking # 新しいスクレイパーをインポート


# app.pyと同じ階層にある静的ファイル(css, js, html)を読み込めるように設定
app = Flask(__name__, static_folder='.', static_url_path='')
# CORS(Cross-Origin Resource Sharing)を有効化
CORS(app)

# --- グローバル変数と設定 ---
AUTO_TASKS_FILE = 'auto_tasks.json'
AUTO_HISTORY_FILE = 'auto_history.json'
SCHEDULER_CONFIG_FILE = 'scheduler_config.json'

# --- ヘルパー関数 (ファイルの読み書き) ---
def load_json_file(filename):
    if not os.path.exists(filename):
        return []
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

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

def sse_format(data: dict) -> str:
    """Server-Sent Eventsのフォーマットで文字列を返す"""
    return f"data: {json.dumps(data)}\n\n"

@app.route('/')
def index():
    return app.send_static_file('index.html')

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

                timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                
                # PNGで一時的に保存
                temp_png_path = os.path.join('screenshots', f"temp_{timestamp}.png")
                driver.save_screenshot(temp_png_path)

                # Pillowで開き、JPEGとして画質を落として保存
                jpeg_filename = f"screenshot_{timestamp}.jpg"
                jpeg_filepath = os.path.join('screenshots', jpeg_filename)
                
                try:
                    with Image.open(temp_png_path) as img:
                        if img.mode == 'RGBA': # JPEGは透明度をサポートしないためRGBに変換
                            img = img.convert('RGB')
                        img.save(jpeg_filepath, 'jpeg', quality=75) # qualityは0-95の範囲で調整可能
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
    
    def generate_stream():
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

    # ストリーミングレスポンスを返す
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

    def generate_stream():
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

    return app.response_class(generate_stream(), mimetype='text/event-stream')

# --- 特集ページ順位計測API ---
@app.route('/check-feature-page-ranking', methods=['GET'])
def check_feature_page_ranking_api():
    feature_page_url = request.args.get('featurePageUrl')
    salon_name = request.args.get('salonName')

    if not feature_page_url or not salon_name:
        return jsonify({"error": "特集ページのURLとサロン名が必要です"}), 400

    def generate_stream():
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

    return app.response_class(generate_stream(), mimetype='text/event-stream')


# --- スケジューリング関連 ---
def run_scheduled_check(task_ids_to_run=None, stream_progress=False):
    """
    指定されたタスク、またはすべてのタスクを実行し、結果を履歴ファイルに保存する
    :param task_ids_to_run: 実行するタスクIDのリスト。Noneの場合は全タスクを実行。
    """
    with app.app_context():
        app.logger.info("--- 自動計測ジョブを開始します ---")
        all_tasks = load_json_file(AUTO_TASKS_FILE)
        
        tasks_to_run = []
        if task_ids_to_run:
            app.logger.info(f"選択された {len(task_ids_to_run)} 件のタスクを実行します。")
            tasks_to_run = [task for task in all_tasks if task.get('id') in task_ids_to_run]
        else:
            app.logger.info("スケジュールされた全タスクを実行します。")
            tasks_to_run = all_tasks

        history = load_json_file(AUTO_HISTORY_FILE)
        today = datetime.date.today().strftime('%Y/%m/%d')

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

            for i, task in enumerate(tasks_to_run):
                task_id = task['id']
                task_type = task.get('type', 'normal') # typeがなければ通常検索とみなす
                
                task_name = ""
                if task_type == 'normal':
                    task_name = f"[{task.get('areaName', '')}] {task.get('serviceKeyword', '')}"
                else: # special
                    task_name = task.get('featurePageName', task.get('featurePageUrl'))
                
                if stream_progress:
                    yield sse_format({"progress": {"current": i + 1, "total": len(tasks_to_run), "task": task}})
                else:
                    app.logger.info(f"タスク '{task_id}' の計測を開始...")
                
                # --- タスクタイプに応じて呼び出す関数を切り替え ---
                result = {}
                scraper_generator = None
                if task_type == 'normal':
                    scraper_generator = check_hotpepper_ranking(driver, task['serviceKeyword'], task['salonName'], task['areaCodes'])
                else: # special
                    scraper_generator = check_feature_page_ranking(driver, task['featurePageUrl'], [task['salonName']])

                for sse_message in scraper_generator:
                    if stream_progress:
                        # フロントエンドに進捗を中継する
                        data = json.loads(sse_message.split('data: ')[1])
                        if 'status' in data:
                             yield sse_format({"status": data['status'], "task_name": task_name})
                        # 特集ページの場合、初回にページタイトルをタスクに保存する
                        if 'final_result' in data and task_type == 'special' and not task.get('featurePageName'):
                            task['featurePageName'] = data['final_result'].get('page_title')
                    
                    data = json.loads(sse_message.split('data: ')[1])
                    if 'final_result' in data: # 最後の結果のみを保持
                        result = data['final_result']
                
                # 順位とスクリーンショットのパスを取得
                rank_to_save = "圏外"
                if task_type == 'normal':
                    if result.get('results'):
                        rank_to_save = result['results'][0]['rank']
                else: # special
                    # 複数サロンの結果から自分のサロンの結果を取り出す
                    salon_results = result.get('results_map', {}).get(task['salonName'], [])
                    if salon_results:
                        rank_to_save = salon_results[0]['rank']
                
                screenshot_path_to_save = result.get('screenshot_path')

                if stream_progress:
                    yield sse_format({"result": {"rank": rank_to_save, "total_count": result.get('total_count'), "task_name": task_name}})
                    time.sleep(1) # フロントエンドでの表示のためのウェイト

                # 履歴を更新
                task_history = next((item for item in history if item["id"] == task_id), None)
                log_entry = {'date': today, 'rank': rank_to_save, 'screenshot': screenshot_path_to_save}

                if task_history:
                    # 同じ日の記録があれば更新、なければ追加
                    date_entry = next((d for d in task_history['log'] if d['date'] == today), None)
                    if date_entry:
                        # 既存のエントリを更新
                        date_entry['rank'] = rank_to_save
                        date_entry['screenshot'] = screenshot_path_to_save
                    else:
                        task_history['log'].append(log_entry)
                else:
                    # 新しいタスクの履歴を作成
                    history.append({
                        "id": task_id,
                        "task": task,
                        "log": [log_entry]
                    })
                app.logger.info(f"タスク '{task_id}' の結果: {rank_to_save}位")
                time.sleep(10) # 次のタスクまで少し待つ
        except Exception as e:
            app.logger.error(f"自動計測ジョブ全体でエラーが発生しました: {e}")
        finally:
            if driver:
                driver.quit() # 全てのタスクが終わったらブラウザを終了
            save_json_file(AUTO_HISTORY_FILE, history)
            
            if stream_progress:
                yield sse_format({"final_status": f"すべての計測が完了しました。（{len(tasks_to_run)}件）"})
            else:
                app.logger.info("--- 自動計測ジョブが完了しました ---")

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

    history = load_json_file(AUTO_HISTORY_FILE)
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

    save_json_file(AUTO_HISTORY_FILE, history)
    return jsonify({"message": f"タスク '{task_id}' の履歴を保存しました。"}), 200

@app.route('/api/auto-history', methods=['GET'])
def get_auto_history():
    history = load_json_file(AUTO_HISTORY_FILE)
    return jsonify(history)

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
scheduler.start()
app.logger.info(f"スケジューラを起動しました。毎日{run_hour:02d}:{run_minute:02d}に自動計測を実行します。(猶予時間: 1時間)")

if __name__ == '__main__':
    # Flaskアプリを起動
    app.run(debug=True, port=5001, use_reloader=False) # use_reloader=Falseが重要