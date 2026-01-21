import time
import traceback
import re
import os
import datetime
import json
from flask import current_app
from playwright.sync_api import sync_playwright, TimeoutError
import config

CATEGORY_MAPPING = {
    "プライベート": "KL01",
    "サロンのNEWS": "KL02",
    "おすすめメニュー": "KL03",
    "おすすめデザイン": "KL04",
    "ビューティー": "KL05",
}

def load_salon_board_settings():
    try:
        with open('salon_board_settings.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, list):
                return {"stores": data}
            return data
    except (FileNotFoundError, json.JSONDecodeError):
        return {"stores": []}

def post_blog_to_store(store_id: str, title: str, content: str, category: str, publish_status: str, image_path: str = None) -> dict:
    """
    指定された店舗IDでサロンボードにログインし、ブログを投稿する。

    Args:
        store_id (str): 店舗を識別するID (例: "fukuyama_ekimae")
        title (str): ブログのタイトル
        content (str): ブログの本文
        category (str): ブログのカテゴリ (例: "プライベート", "サロンのNEWS")
        publish_status (str): 'publish' (登録・反映する) または 'draft' (登録・未反映にする)
        image_path (str, optional): アップロードする画像のパス

    Returns:
        dict: 処理結果 (status, messageなど)
    """
    # 1. 設定ファイルから店舗情報を取得
    settings = load_salon_board_settings()
    store_config = next((s for s in settings.get("stores", []) if s["id"] == store_id), None)
    
    if not store_config:
        return {"store_id": store_id, "status": "error", "message": "店舗設定が見つかりません。"}

    # 定型文がある場合、本文の末尾に追加
    if store_config.get("template_text"):
        content += "\n\n" + store_config["template_text"]

    credentials = {
        "id": store_config.get("sb_id"),
        "password": store_config.get("sb_password"),
        "staff_name": store_config.get("staff_name")
    }
    
    with sync_playwright() as p:
        # headless=Falseにすると、デバッグ時にブラウザの動きを視覚的に確認できます
        # slow_mo=500 (0.5秒) に設定して、入力の様子を確認しやすくします
        browser = p.chromium.launch(
            headless=config.HEADLESS_MODE,
            # slow_mo=500, # サーバーのタイムアウトを避けるため、遅延を削除
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        
        try:
            # コンテキストを作成し、デフォルトのタイムアウト時間を60秒に延長（通常は30秒）
            # これにより、順位チェックとの同時実行でPCが重くなってもエラーになりにくくします
            context = browser.new_context()
            context.set_default_timeout(60000)
            page = context.new_page()

            # --- ログイン処理 ---
            current_app.logger.info(f"[{store_id}] サロンボードへのログインを開始します。")
            page.goto("https://salonboard.com/login/")
            
            # ログインボタンが表示されるのを待つことで、ページが操作可能になったことを確認します
            current_app.logger.info(f"[{store_id}] ログインフォームの表示を待っています...")
            page.wait_for_selector('a:has-text("ログイン")') # デフォルトタイムアウト(60秒)を使用
            current_app.logger.info(f"[{store_id}] フォームを認識しました。入力を開始します。")
            
            # 共有いただいたHTMLに基づき、入力欄の特定方法を修正します。
            # ID入力欄は name="userId" で特定
            page.locator('input[name="userId"]').fill(credentials["id"])
            current_app.logger.info(f"[{store_id}] IDを入力しました。")

            # パスワード入力欄は name="password" で特定
            page.locator('input[name="password"]').fill(credentials["password"])
            current_app.logger.info(f"[{store_id}] パスワードを入力しました。")

            # ログインボタンは「ログイン」というテキストを持つリンク(aタグ)なので、get_by_roleで特定
            # strict modeエラーを回避するため、.first をつけて最初に見つかった要素をクリックする
            page.get_by_role('link', name='ログイン').first.click()
            current_app.logger.info(f"[{store_id}] ログインボタンをクリックしました。")

            # ログイン成功 or 失敗の判別
            # ご指摘の通り、ログイン失敗時の具体的なエラーメッセージを取得するように修正します。
            try:
                # まずはログイン成功（トップページへの遷移）を待ちます
                # 読み込みに時間がかかる場合があるため、タイムアウトを60秒に延長します
                # URLが /KLP/top/ や /main/top/ など変わる可能性があるため、正規表現で待機します
                page.wait_for_url(re.compile(r"/KLP/top/"), timeout=60000)
                current_app.logger.info(f"[{store_id}] ログインに成功しました。")

            except TimeoutError:
                # タイムアウトした場合、ログイン失敗と判断し、画面上のエラーメッセージを探す
                current_app.logger.warning(f"[{store_id}] ログイン後のページ遷移がタイムアウトしました。エラーメッセージの有無を確認します。")
                try:
                    # ユーザーから提供されたエラーメッセージ「IDもしくはパスワードの入力が正しくありません。」を直接テキストで探します。
                    # これにより、HTML構造の変更に強い、より確実なエラー検出が可能になります。
                    error_locator = page.locator('text="IDもしくはパスワードの入力が正しくありません。"')
                    
                    # エラーメッセージが表示されるまで最大5秒待機します。
                    error_locator.wait_for(timeout=5000)
                    
                    error_text = error_locator.inner_text()
                    error_message = f"ログインに失敗しました: {error_text.strip()}"
                    current_app.logger.error(f"[{store_id}] {error_message}")
                    return {"store_id": store_id, "status": "error", "message": error_message}
                except Exception: # TimeoutErrorやその他のエラーをキャッチ
                    # 上記の特定のエラーメッセージが見つからなかった場合のフォールバック
                    error_message = "ログインに失敗しました。ID/パスワードが正しいか、または予期せぬ画面が表示されていないか確認してください。"
                    current_app.logger.error(f"[{store_id}] {error_message} (具体的なエラーメッセージは取得できませんでした)", exc_info=True)
                    return {"store_id": store_id, "status": "error", "message": error_message}

            # --- ブログ編集入力画面へ直接移動 ---
            blog_edit_url = "https://salonboard.com/KLP/blog/blog/"
            current_app.logger.info(f"[{store_id}] ブログ編集入力画面 ({blog_edit_url}) へ直接移動します。")
            page.goto(blog_edit_url)
            
            # ブログ編集ページ（blog/ または blog_entry/）への遷移を待機
            page.wait_for_url(re.compile(r"/KLP/blog/blog(_entry)?/"), timeout=60000)
            current_app.logger.info(f"[{store_id}] ブログ編集ページに遷移しました。")

            # --- ブログ内容の入力 ---
            current_app.logger.info(f"[{store_id}] ブログの内容を入力します。")

            # カテゴリの選択
            current_app.logger.info(f"[{store_id}] カテゴリ「{category}」を選択します。")
            # サロンボードのカテゴリ選択要素のname属性と、各カテゴリのvalue属性は、実際のサイトのHTMLに合わせて調整してください。
            # ここでは仮にname="blogCategoryCd"とし、値はCATEGORY_MAPPINGで定義します。
            salon_board_category_value = CATEGORY_MAPPING.get(category, category)
            try:
                # カテゴリ選択のセレクタを実際のHTMLに合わせて 'select[name="blogCategoryCd"]' に修正
                page.wait_for_selector('select[name="blogCategoryCd"]')
                page.select_option('select[name="blogCategoryCd"]', value=salon_board_category_value)
                current_app.logger.info(f"[{store_id}] カテゴリ「{category}」を選択しました。")
            except TimeoutError:
                current_app.logger.warning(f"[{store_id}] カテゴリ選択要素が見つからないか、選択に失敗しました。")
            except Exception as e:
                current_app.logger.warning(f"[{store_id}] カテゴリ選択中に予期せぬエラー: {e}")
            
            # 投稿者の選択
            if "staff_name" in credentials and credentials["staff_name"]:
                target_staff = credentials["staff_name"]
                current_app.logger.info(f"[{store_id}] 投稿者「{target_staff}」を選択します。")
                try:
                    # 投稿者選択のプルダウン (一般的に name="staffId")
                    page.wait_for_selector('select[name="staffId"]', timeout=10000)
                    page.select_option('select[name="staffId"]', label=target_staff)
                    current_app.logger.info(f"[{store_id}] 投稿者を選択しました。")
                except Exception as e:
                    current_app.logger.warning(f"[{store_id}] 投稿者の選択に失敗しました（デフォルトまたは選択なしで続行します）: {e}")

            # タイトル入力欄が表示されるのを待ってから入力
            title_locator = page.locator('input[name="title"]')
            title_locator.wait_for(state='visible')
            current_app.logger.info(f"[{store_id}] タイトル入力欄を認識。入力します。")
            title_locator.fill(title)
            current_app.logger.info(f"[{store_id}] タイトル「{title}」を入力しました。")

            # ユーザーの要望に基づき、画像を先に挿入し、その後に本文を入力するフローに変更
            content_locator = page.locator('.nicEdit-main')
            content_locator.wait_for(state='visible')
            
            # 本文入力の前に、まずエリアをクリアする
            current_app.logger.info(f"[{store_id}] 本文入力エリアをクリアします。")
            content_locator.fill("") 

            # 画像アップロード (本文入力より先に実行)
            if image_path and os.path.exists(image_path):
                try:
                    current_app.logger.info(f"[{store_id}] 画像アップロード処理を開始します: {image_path}")
                    
                    # 1. 「画像アップロード」ボタンをクリックしてモーダルを開く
                    page.click('#upload')
                    current_app.logger.info(f"[{store_id}] 画像アップロードボタンをクリックしました。")

                    # 2. モーダルが表示されるのを待つ
                    page.wait_for_selector('.jscImageUploaderModal', state='visible', timeout=30000)

                    # 3. ファイル入力要素にファイルをセットする (id="sendFile")
                    page.locator('#sendFile').set_input_files(image_path)
                    current_app.logger.info(f"[{store_id}] ファイルをセットしました。")

                    # 4. 「登録する」ボタンをクリックする
                    page.click('.jscImageUploaderModalSubmitButton')
                    current_app.logger.info(f"[{store_id}] 登録ボタンをクリックしました。")

                    # 5. モーダルが閉じるのを待つ（アップロード完了待ち）
                    page.wait_for_selector('.jscImageUploaderModal', state='hidden', timeout=60000)
                    current_app.logger.info(f"[{store_id}] 画像アップロード処理が完了しました。")
                    
                    time.sleep(1) # 念のため少し待機
                except Exception as e:
                    current_app.logger.warning(f"[{store_id}] 画像アップロードに失敗しましたが、続行します: {e}")
                    # エラー発生時、モーダルが開いたままなら閉じる試みをする
                    try:
                        if page.locator('.jscImageUploaderModal').is_visible():
                            page.locator('.jscImageUploaderModalCloseButton').first.click()
                    except:
                        pass

            # 本文を入力
            current_app.logger.info(f"[{store_id}] 本文を入力します。")

            # nicEditが改行(\n)を<p>タグに変換して意図しない改行が生まれる問題への対策
            # 本文の改行コードを<br>タグに変換してから入力する
            # 修正: \r\n や \r が残っていると、エディタによっては二重改行として扱われる場合があるため、
            # 先に改行コードを \n に正規化してから <br> に変換する
            normalized_content = content.replace('\r\n', '\n').replace('\r', '\n')
            html_content = normalized_content.replace('\n', '<br>')

            if image_path and os.path.exists(image_path):
                # 画像がある場合、エディタの末尾にHTMLとして追記する
                # これにより、先に追加した画像を消さずに本文を挿入できる
                current_app.logger.info(f"[{store_id}] 画像の後ろに本文を追記します。")
                content_locator.evaluate("(el, html) => el.innerHTML += html", html_content)
            else:
                # 画像がない場合は、エディタの内容をHTMLで一括置換する
                current_app.logger.info(f"[{store_id}] 本文をエディタに入力します。")
                content_locator.evaluate("(el, html) => el.innerHTML = html", html_content)

            current_app.logger.info(f"[{store_id}] 本文を入力しました。")

            # --- 確認画面へ進み、投稿を実行 ---
            current_app.logger.info(f"[{store_id}] 確認画面へ進み、投稿を実行します。")

            # 「確認する」ボタンクリック後に表示されることがある確認ダイアログを自動で承諾
            page.on("dialog", lambda dialog: dialog.accept())

            # STEP 1: 「確認する」ボタンをクリック
            current_app.logger.info(f"[{store_id}] 「確認する」ボタンをクリックします。")
            # 確認ボタンのセレクタは '#confirm' または name="confirm" の input の可能性がある
            page.locator('#confirm, input[name="confirm"]').first.click()

            # STEP 2: 「登録・反映する」または「登録・未反映にする」ボタンをクリック
            try:
                if publish_status == 'publish':
                    button_text = '登録・反映する'
                    success_message = "ブログを投稿しました。"
                else:  # 'draft' の場合
                    button_text = '登録・未反映にする'
                    success_message = "ブログを下書き保存しました。"

                # ログから、「登録・未反映」でも完了ページに遷移する場合があることが判明したため、
                # 完了ページ(/complete/)と一覧ページ(/list/)のどちらに遷移しても成功とみなすように修正します。
                completion_url_re = r"/KLP/blog/blog/(complete|list)/?$"

                current_app.logger.info(f"[{store_id}] 「{button_text}」ボタンが表示されるのを待ちます。")
                # IDセレクタ('a#entry')が原因でタイムアウトしていたため、より堅牢なテキスト指定に変更します。
                entry_button_locator = page.get_by_role("link", name=button_text)
                entry_button_locator.wait_for(state='visible')

                current_app.logger.info(f"[{store_id}] 「{button_text}」ボタンをクリックし、完了ページへの遷移を待ちます。")
                with page.expect_navigation(url=re.compile(completion_url_re), timeout=60000):
                    entry_button_locator.click()

                current_app.logger.info(f"[{store_id}] ブログの「{button_text}」が完了しました。")

            except TimeoutError as e:
                # タイムアウト時のエラーハンドリングを調整
                error_message = f"投稿処理がタイムアウトしました。画面上のエラーメッセージを確認してください。"
                screenshot_path = ""
                try:
                    screenshot_dir = "screenshots"
                    os.makedirs(screenshot_dir, exist_ok=True)
                    screenshot_path = os.path.join(screenshot_dir, f"error_post_timeout_{store_id}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
                    page.screenshot(path=screenshot_path)
                    current_app.logger.error(f"[{store_id}] 投稿処理タイムアウト。スクリーンショットを保存しました: {screenshot_path}")
                except Exception as ss_e:
                    current_app.logger.error(f"[{store_id}] スクリーンショットの保存に失敗しました: {ss_e}")
                
                try:
                    error_elem = page.locator('.error, .alert, .errormsg, .error_list').first
                    if error_elem.is_visible():
                        error_message += f" 画面上のエラー: {error_elem.inner_text().strip()}"
                except:
                    pass
                raise Exception(error_message)
            
            return {"store_id": store_id, "status": "success", "message": success_message}

        except TimeoutError as e:
            # ログイン以外の処理でのタイムアウトエラー
            error_message = "処理がタイムアウトしました。"
            if "blog_entry" in str(e):
                error_message = "ブログ登録ページの読み込みに失敗しました。"
            elif "blog_confirm" in str(e):
                error_message = "ブログ確認ページの読み込みに失敗しました。"
            elif "blog_complete" in str(e):
                error_message = "ブログ投稿完了ページの確認に失敗しました。投稿されているか確認してください。"

            current_app.logger.error(f"[{store_id}] {error_message}\n{traceback.format_exc()}")
            return {"store_id": store_id, "status": "error", "message": error_message}

        except Exception as e:
            current_app.logger.error(f"[{store_id}] 予期せぬエラーが発生しました。\n{traceback.format_exc()}")
            return {"store_id": store_id, "status": "error", "message": f"予期せぬエラーが発生しました: {str(e)}"}
        finally:
            # 成功・失敗にかかわらず必ずブラウザを閉じる
            if browser:
                browser.close()