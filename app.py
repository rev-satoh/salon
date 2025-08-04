import os
import re
import random
import sys
import google.generativeai as genai
from flask import Flask, request, jsonify, redirect, url_for
from flask_cors import CORS
from dotenv import load_dotenv
from google.api_core import exceptions as google_exceptions

# .envから環境変数を読込
load_dotenv()

# --- 定数定義 ---
MODEL_NAME = 'models/gemini-1.5-flash-latest'
GENERATION_CONFIG = genai.types.GenerationConfig(temperature=0.7)

# app.pyと同じ階層にある静的ファイル(css, js, html)を読み込めるように設定
app = Flask(__name__, static_folder='.', static_url_path='')
# CORS(Cross-Origin Resource Sharing)を有効化
CORS(app)

# --- サーバー起動時の設定 ---

# プロンプトテンプレートを外部ファイルから読み込む
try:
    with open('prompt_template.txt', 'r', encoding='utf-8') as f:
        PROMPT_TEMPLATE = f.read()
except FileNotFoundError:
    app.logger.critical("プロンプトテンプレートファイル 'prompt_template.txt' が見つかりません。")
    sys.exit(1)

# Google AI APIキー設定
try:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        # サーバー起動時にキーの有無をチェック
        app.logger.critical("APIキーが設定されていません。.envファイルを確認してください。")
        sys.exit(1) # エラーで終了
    genai.configure(api_key=api_key)
except Exception as e:
    app.logger.critical(f"サーバー起動エラー: {e}")
    sys.exit(1)

# --- エンドポイント定義 ---

@app.route('/')
def index():
    # デフォルトで広島八丁堀店にリダイレクト
    return redirect('/ksl-h')

# お声生成API
@app.route('/generate-review', methods=['POST'])
def generate_review():
    # JSON形式・空リクエストの検証
    if not request.is_json:
        return jsonify({'error': '不正なリクエスト形式'}), 400
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'リクエストボディが空'}), 400

    try:
        prompt_context = data.get('promptContext', 'あなたは顧客です。')
        form_data = data.get('formData', {})

        # textLengthを取得し、元の辞書からは削除する
        # これにより、以降のループで意図せず処理されるのを防ぎ、プロンプトをクリーンに保つ
        text_length = form_data.pop('textLength', 250)

        # フォームデータを箇条書きに変換
        details_text = ""
        for key, value in form_data.items():
            # 値が存在する場合のみ追加
            if (isinstance(value, list) and value) or (isinstance(value, str) and value):
                value_text = ', '.join(value) if isinstance(value, list) else value
                details_text += f"- {key}: {value_text}\n"

        # テンプレートからAIへの指示を組立
        prompt = PROMPT_TEMPLATE.format(
            prompt_context=prompt_context,
            details_text=details_text,
            text_length=text_length
        )

        # モデル指定
        model = genai.GenerativeModel(MODEL_NAME)
        response = model.generate_content(prompt, generation_config=GENERATION_CONFIG)

        # AI応答の安全性を確認
        if response.prompt_feedback.block_reason:
            block_reason = response.prompt_feedback.block_reason.name
            error_message = f'AIコンテンツ生成をブロック ({block_reason})'
            app.logger.warning(error_message)
            return jsonify({'error': error_message}), 503

        # 応答テキストの有無を確認
        if not response.text:
             app.logger.error("AIからの応答テキストがありませんでした。")
             return jsonify({'error': 'AIの応答が空'}), 500

        # AIの応答から余分な空白行を削除（3つ以上の連続改行を2つに置換）
        cleaned_text = re.sub(r'\n{3,}', '\n\n', response.text).strip()

        # 改行スタイルを常に「空白行あり」に固定し、読みやすさを担保する
        final_text = cleaned_text

        # フロントエンドに返す直前に再度strip()を呼び出し、先頭・末尾の空白を確実に除去する
        return jsonify({'review': final_text.strip()})
    
    # このtry-exceptは、予期せぬエラーを捕捉するための最後の砦として残します。
    # 個別のGoogle APIエラーは下のerrorhandlerで処理されます。
    except Exception as e:
        app.logger.error(f"予期せぬエラーが発生しました: {e}", exc_info=True)
        return jsonify({'error': f'サーバー内部で予期せぬエラーが発生しました。'}), 500

# --- エラーハンドラ ---
@app.errorhandler(google_exceptions.PermissionDenied)
def handle_permission_denied(e):
    app.logger.error(f"Google AI APIエラー (Permission Denied): {e}")
    return jsonify({'error': 'Google AI APIへのアクセスが拒否されました。APIキーや設定を確認してください。'}), 500

@app.errorhandler(google_exceptions.InvalidArgument)
def handle_invalid_argument(e):
    app.logger.error(f"Google AI APIエラー (Invalid Argument): {e}")
    return jsonify({'error': 'AIへのリクエスト内容に問題があります。プロンプトなどを確認してください。'}), 400

@app.errorhandler(404)
def not_found_error(error):
    # APIへのリクエストで404になった場合はJSONでエラーを返す
    if request.path.startswith('/generate-review'):
        return jsonify(error='API endpoint not found'), 404
    # それ以外のパス（/ksl-h など）はSPAの本体を返す
    return app.send_static_file('review_generator.html')

@app.errorhandler(Exception)
def handle_generic_exception(e):
    # Flaskが処理しない、その他の予期せぬ例外を捕捉
    app.logger.error(f"ハンドルされていない例外が発生: {e}", exc_info=True)
    return jsonify({'error': 'サーバー内部でエラーが発生しました。'}), 500

if __name__ == '__main__':
    # デバッグモードで起動
    app.run(debug=True, port=5001)