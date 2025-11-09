from flask import Flask, request, jsonify, current_app
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
from hpb_scraper import check_hotpepper_ranking
from meo_scraper import check_meo_ranking
from task_runner import run_scheduled_check, update_history
from driver_manager import get_webdriver
from seo_scraper import check_seo_ranking # SEOスクレイパーをインポート
from excel_generator import create_excel_report # Excel生成関数をインポート
import config # 設定ファイルをインポート

# app.pyと同じ階層にある静的ファイル(css, js, html)を読み込めるように設定
app = Flask(__name__, static_folder='.', static_url_path='')
# CORS(Cross-Origin Resource Sharing)を有効化
CORS(app)

# --- 環境変数の読み込み ---
if not config.GOOGLE_API_KEY:
    app.logger.warning("GOOGLE_API_KEYが.envファイルに設定されていません。MEO計測機能は利用できません。")

# --- グローバル変数と設定 ---

# --- 計測ジョブの同時実行を防ぐためのロック ---
measurement_lock = threading.Lock()

def save_json_file(filename, data):
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def load_scheduler_config():
    """スケジューラ設定を読み込む。なければデフォルト値を返す"""
    if not os.path.exists(config.SCHEDULER_CONFIG_FILE):
        return {"hour": 9, "minute": 0}
    try:
        with open(config.SCHEDULER_CONFIG_FILE, 'r', encoding='utf-8') as f:
            loaded_config = json.load(f)
            if isinstance(loaded_config.get('hour'), int) and isinstance(loaded_config.get('minute'), int):
                return loaded_config
    except (json.JSONDecodeError, IOError, KeyError):
        pass
    return {"hour": 9, "minute": 0}

def save_scheduler_config(config):
    """スケジューラ設定を保存する"""
    with open(config.SCHEDULER_CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2)

def get_history_filename(task_type):
    """タスクタイプに応じた履歴ファイル名を返す"""
    if task_type == 'special':
        return config.HISTORY_FILE_SPECIAL
    elif task_type == 'google':
        return config.HISTORY_FILE_MEO
    elif task_type == 'seo':
        return config.HISTORY_FILE_SEO
    else: # 'normal' or default
        return config.HISTORY_FILE_NORMAL

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
    return app.send_static_file(os.path.join(config.SCREENSHOT_DIR, filename))

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
            try:
                yield sse_format({"status": "ブラウザを起動しています..."})
                with get_webdriver() as driver:
                    yield from check_hotpepper_ranking(driver, serviceKeyword, salonName, areaCodes)
            except Exception as e:
                yield sse_format({"status": "ブラウザを起動しています..."})
                app.logger.error(f"手動計測でのWebDriver生成中にエラー: {e}")
                yield sse_format({"error": "ブラウザの起動に失敗しました。"})
        finally:
            measurement_lock.release() # ストリームが終了したら必ずロックを解放

    # ストリーミングレスポンスを返す
    return app.response_class(generate_stream(), mimetype='text/event-stream')

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
            try:
                with get_webdriver() as driver:
                    yield from check_meo_ranking(driver, keyword, location)
            except Exception as e:
                app.logger.error(f"MEO計測でのWebDriver生成中にエラー: {e}")
                yield sse_format({"error": "ブラウザの起動に失敗しました。"})
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
            try:
                with get_webdriver(is_seo=True) as driver:
                    yield from check_seo_ranking(driver, url_to_find, keyword, location) # locationを渡す
            except Exception as e:
                app.logger.error(f"SEO計測でのWebDriver生成中にエラー: {e}")
                yield sse_format({"error": "ブラウザの起動に失敗しました。"})
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
            try:
                with get_webdriver() as driver:
                    # 特集ページ用のスクレイパーを呼び出す
                    yield from check_feature_page_ranking(driver, feature_page_url, salon_names)
            except Exception as e:
                app.logger.error(f"特集ページ一括計測でのWebDriver生成中にエラー: {e}")
                yield sse_format({"error": "ブラウザの起動に失敗しました。"})
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
            try:
                yield sse_format({"status": "ブラウザを起動しています..."})
                with get_webdriver() as driver:
                    # 特集ページ用のスクレイパーを呼び出す
                    yield from check_feature_page_ranking(driver, feature_page_url, [salon_name])
            except Exception as e:
                app.logger.error(f"特集ページ計測でのWebDriver生成中にエラー: {e}")
                yield sse_format({"error": "ブラウザの起動に失敗しました。"})
        finally:
            measurement_lock.release()

    return app.response_class(generate_stream(), mimetype='text/event-stream')


@app.route('/api/auto-tasks', methods=['GET', 'POST'])
def handle_auto_tasks():
    if request.method == 'GET':
        # ファイルが存在しない場合や空の場合のハンドリングを追加
        tasks = load_json_file(config.AUTO_TASKS_FILE)
        return jsonify(tasks)
    if request.method == 'POST':
        tasks = request.get_json()
        if not isinstance(tasks, list):
            return jsonify({"error": "リクエストはリスト形式である必要があります"}), 400
        save_json_file(config.AUTO_TASKS_FILE, tasks)
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
    
    # update_history関数を呼び出す
    update_history(history, task, today, result.get('rank', '圏外'), result.get('screenshot_path'))

    save_json_file(history_filename, history)
    return jsonify({"message": f"タスク '{task_id}' の履歴を保存しました。"}), 200

@app.route('/api/auto-history', methods=['GET'])
def get_auto_history():
    # --- 3つの履歴ファイルをマージして返す ---
    history_normal = load_json_file(config.HISTORY_FILE_NORMAL)
    history_special = load_json_file(config.HISTORY_FILE_SPECIAL)
    history_meo = load_json_file(config.HISTORY_FILE_MEO)
    history_seo = load_json_file(config.HISTORY_FILE_SEO) # SEO履歴を読み込む
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
        with app.app_context():
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

    # --- ロックの取得を試みる ---
    if not measurement_lock.acquire(blocking=False):
        return jsonify({"error": "現在、他の計測タスクが実行中です。しばらく待ってから再度お試しください。"}), 429

    try:
        app.logger.info("手動での自動計測ジョブを開始します。")
        run_scheduled_check(task_ids_to_run=task_ids)
        return jsonify({"message": f"{len(task_ids)}件のタスクを実行しました。ページをリロードして結果を確認してください。"}), 200
    finally:
        measurement_lock.release()

@app.route('/download_excel', methods=['POST'])
def download_excel():
    """
    フロントエンドからデータを受け取り、excel_generatorモジュールを使って
    グラフ付きのExcelファイルを生成して返す。
    """
    data = request.get_json()
    if not data or not all(k in data for k in ['groupKey', 'groupData', 'activeSearchType']):
        return jsonify({"error": "必要なデータが不足しています。"}), 400

    try:
        # Excel生成ロジックを外部モジュールに委譲
        excel_output = create_excel_report(
            data['groupKey'], data['groupData'], data['activeSearchType']
        )
        # ファイルをレスポンスとして返す
        return app.response_class(
            excel_output.read(),
            headers={
                "Content-Disposition": f"attachment; filename={urllib.parse.quote(data['groupKey'])}.xlsx",
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }
        )
    except Exception as e:
        app.logger.error(f"Excelファイル生成中にエラー: {e}\n{traceback.format_exc()}")
        return jsonify({"error": f"Excelファイルの生成に失敗しました: {e}"}), 500

# --- アプリケーションの起動とスケジューラの設定 ---
scheduler = BackgroundScheduler(daemon=True)

def scheduled_job_wrapper():
    """スケジューラから呼び出されるラッパー関数"""
    if not measurement_lock.acquire(blocking=False):
        current_app.logger.warning("自動計測ジョブを開始しようとしましたが、既に別の計測が実行中のためスキップします。")
        return
    with app.app_context():
        try:
            run_scheduled_check()
        finally:
            measurement_lock.release()

# 設定ファイルから実行時間を読み込む
scheduler_setting = load_scheduler_config()
run_hour = scheduler_setting.get('hour', 9)
run_minute = scheduler_setting.get('minute', 0)

# 毎日指定された時間にジョブを実行
scheduler.add_job(
    scheduled_job_wrapper,
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
        history_meo = load_json_file(config.HISTORY_FILE_MEO)
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
            save_json_file(config.HISTORY_FILE_MEO, history_meo)
            app.logger.info("MEO履歴IDの移行が完了しました。")

migrate_meo_history_ids()

scheduler.start()
app.logger.info(f"スケジューラを起動しました。毎日{run_hour:02d}:{run_minute:02d}に自動計測を実行します。(猶予時間: 1時間)")

if __name__ == '__main__':
    # Flaskアプリを起動
    app.run(debug=True, port=5001, use_reloader=False) # use_reloader=Falseが重要
