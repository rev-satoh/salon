import time
import traceback
from flask import current_app
from playwright.sync_api import sync_playwright, TimeoutError

# --- 店舗情報管理 ---
#【重要】
# 本番環境では、ID/パスワードをコードに直接記述せず、
# 環境変数や暗号化された設定ファイルなど、安全な方法で管理してください。
STORE_CREDENTIALS = {
    "fukuyama_ekimae": {
        "id": "CE34001",      # 福山駅前店のサロンボードIDに書き換えてください
        "password": "YOUR_FUKUYAMA_PASSWORD" # 福山駅前店のパスワードに書き換えてください
    },
    # 他の店舗も同様に追加できます
    # "hiroshima_hatchobori": {
    #     "id": "YOUR_HIROSHIMA_ID",
    #     "password": "YOUR_HIROSHIMA_PASSWORD"
    # },
}

def post_blog_to_store(store_id: str, title: str, content: str) -> dict:
    """
    指定された店舗IDでサロンボードにログインし、ブログを投稿する。

    Args:
        store_id (str): 店舗を識別するID (例: "fukuyama_ekimae")
        title (str): ブログのタイトル
        content (str): ブログの本文

    Returns:
        dict: 処理結果 (status, messageなど)
    """
    # 1. 認証情報の取得
    credentials = STORE_CREDENTIALS.get(store_id)
    if not credentials:
        return {"store_id": store_id, "status": "error", "message": "店舗IDに対応する認証情報が見つかりません。"}

    # 2. Playwrightの実行
    # with sync_playwright() as p: # 本番環境はこちら
    #     browser = p.chromium.launch(headless=True) # 本番環境はTrue
    try:
        with sync_playwright() as p:
            # headless=Falseにすると、デバッグ時にブラウザの動きを視覚的に確認できます
            browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
            page = browser.new_page()

            # --- ログイン処理 ---
            current_app.logger.info(f"[{store_id}] サロンボードへのログインを開始します。")
            page.goto("https://salonboard.com/login/")
            
            #【注意】セレクタは実際のサイトに合わせて調整が必要な場合があります
            page.fill('input[name="id"]', credentials["id"])
            page.fill('input[name="password"]', credentials["password"])
            page.click('button[type="submit"]')

            # ログイン成功の確認 (トップページのURLに遷移するのを待つ)
            page.wait_for_url("https://salonboard.com/main/top/", timeout=15000)
            current_app.logger.info(f"[{store_id}] ログインに成功しました。")

            # --- ブログ投稿ページへ移動 ---
            current_app.logger.info(f"[{store_id}] ブログ登録ページへ移動します。")
            # 直接URLを指定する方が、UIの変更に強く安定します
            page.goto("https://salonboard.com/blog/blog_entry/")

            # --- ブログ内容の入力 ---
            current_app.logger.info(f"[{store_id}] ブログのタイトルと本文を入力します。")
            #【注意】セレクタは実際のサイトに合わせて調整が必要な場合があります
            page.wait_for_selector('input[name="blogTitle"]', timeout=10000)
            page.fill('input[name="blogTitle"]', title)

            # 本文入力エリアはiframe内にあるため、frameを取得してから操作する
            # 'wysiwygTextarea_ifr' は実際のiframeのIDやname属性に置き換えてください
            frame = page.frame_locator('iframe[id$="_ifr"]') # IDが "_ifr" で終わるiframeを探す
            # iframe内のbody要素に本文を入力
            frame.locator('body#tinymce').fill(content)

            # --- 確認画面へ進み、投稿を実行 ---
            current_app.logger.info(f"[{store_id}] 確認画面へ進み、投稿を実行します。")
            #【注意】セレクタは実際のサイトに合わせて調整が必要な場合があります
            page.click('input#confirm') # 確認画面へ
            
            page.wait_for_url("https://salonboard.com/blog/blog_confirm/", timeout=10000)
            
            page.click('input#entry') # 登録実行

            # 投稿完了画面への遷移を待つ
            page.wait_for_url("https://salonboard.com/blog/blog_complete/", timeout=15000)
            current_app.logger.info(f"[{store_id}] ブログ投稿が完了しました。")

            browser.close()
            return {"store_id": store_id, "status": "success", "message": "ブログを投稿しました。"}

    except TimeoutError as e:
        error_message = "タイムアウトエラーが発生しました。"
        if "main/top" in str(e):
            error_message = "ログインに失敗しました。IDまたはパスワードを確認してください。"
        elif "blog_entry" in str(e):
            error_message = "ブログ登録ページの読み込みに失敗しました。"
        elif "blog_confirm" in str(e):
            error_message = "ブログ確認ページの読み込みに失敗しました。"
        elif "blog_complete" in str(e):
            error_message = "ブログ投稿完了ページの確認に失敗しました。投稿されているか確認してください。"
        
        current_app.logger.error(f"[{store_id}] {error_message}\n{traceback.format_exc()}")
        if 'browser' in locals() and browser.is_connected():
            browser.close()
        return {"store_id": store_id, "status": "error", "message": error_message}

    except Exception as e:
        current_app.logger.error(f"[{store_id}] 予期せぬエラーが発生しました。\n{traceback.format_exc()}")
        if 'browser' in locals() and browser.is_connected():
            browser.close()
        return {"store_id": store_id, "status": "error", "message": f"予期せぬエラーが発生しました: {str(e)}"}