# /Users/satoudaisuke/anaconda/salon/config.py
import os
from dotenv import load_dotenv

"""
アプリケーション全体の設定を管理するファイル。
このファイルを変更することで、コードを直接編集せずにアプリケーションの挙動を調整できます。
"""

# --- 環境変数の読み込み ---
load_dotenv()
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")

# --- ファイルパス設定 ---
# 各種データや設定を保存するファイル名
TASKS_FILE = 'auto_tasks.json'
SCHEDULER_CONFIG_FILE = 'scheduler_config.json'

HISTORY_FILES = {
    'normal': 'history_normal.json',
    'special': 'history_special.json',
    'google': 'history_meo.json',
    'seo': 'history_seo.json'
}

# --- スクレイピング共通設定 ---
# Seleniumのページ読み込みタイムアウト時間（秒）
WEBDRIVER_TIMEOUT = 30
# スクリーンショットの保存先ディレクトリ
SCREENSHOT_DIR = "/Users/satoudaisuke/Library/CloudStorage/OneDrive-合同会社リビジョン/画像/salon/screenshots"
# スクリーンショットのJPEG品質 (0-95の範囲で設定)
SCREENSHOT_JPEG_QUALITY = 15
# デフォルトのUser-Agent
DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

# --- ホットペッパービューティー (HPB) 関連設定 ---
# HPB通常検索・特集検索での最大検索ページ数
HPB_MAX_PAGES = 5
# HPB特集ページのスクリーンショットファイル名に含めるタイトルの最大文字数
HPB_SPECIAL_TITLE_MAX_LENGTH = 30

# --- Google MEO/SEO 関連設定 ---
# MEO計測時のスクロール回数（1回あたり約20件読み込む）
MEO_SCROLL_COUNT = 3
# SEO計測で1ページに表示する検索結果の数
SEO_RESULTS_PER_PAGE = 100

# --- 自動実行タスク関連設定 ---
# 各タスク実行後のランダムな待機時間（秒）の範囲
TASK_WAIT_TIME_MIN = 5
TASK_WAIT_TIME_MAX = 15

# --- Excelレポート生成設定 ---
# グラフ上で「圏外」や「エラー」を示すための数値
EXCEL_OUT_OF_RANGE_RANK = 101 # グラフのY軸の最大値としても利用
# グラフのY軸の最小値
EXCEL_CHART_Y_AXIS_MIN = 1
# グラフのY軸の最大値（圏外表示用）
EXCEL_CHART_Y_AXIS_MAX = 101

# --- Playwright設定 ---
# ヘッドレスモード (True: ブラウザを表示しない / False: 表示する)
HEADLESS_MODE = False