import os
import re
import random
import sys
import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from google.api_core import exceptions as google_exceptions

# .envから環境変数を読込
load_dotenv()

# --- 定数定義 ---
MODEL_NAME = 'models/gemini-1.5-flash-latest'
GENERATION_CONFIG = genai.types.GenerationConfig(temperature=0.7)

# Flaskアプリケーションのインスタンスを作成
app = Flask(__name__)
# CORS(Cross-Origin Resource Sharing)を有効化
CORS(app)

# --- サーバー起動時の設定 ---

# プロンプトテンプレートを外部ファイルから読み込む
try:
    with open('prompt_template.txt', 'r', encoding='utf-8') as f:
        PROMPT_TEMPLATE = f.read()
except FileNotFoundError:
    print("CRITICAL: プロンプトテンプレートファイル 'prompt_template.txt' が見つかりません。", file=sys.stderr)
    sys.exit(1)

# Google AI APIキー設定
try:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        # サーバー起動時にキーの有無をチェック
        print("CRITICAL: APIキーが設定されていません。.envファイルまたは環境変数 'GOOGLE_API_KEY' を確認してください。", file=sys.stderr)
        sys.exit(1) # エラーで終了
    genai.configure(api_key=api_key)
except Exception as e:
    print(f"CRITICAL: サーバー起動エラー: {e}", file=sys.stderr)
    sys.exit(1)

# --- エンドポイント定義 ---

@app.route('/')
def index():
    # サーバーが起動していることを確認するためのヘルスチェック用エンドポイント
    # Pingサービスからのアクセスや、動作確認のために使用します
    return jsonify({'status': 'ok', 'message': 'Backend server is running.'})

# お声生成API
@app.route('/generate-review', methods=['POST'])
def generate_review():
    # JSON形式・空リクエストの検証
    if not request.is_json:
        return jsonify({'error': '不正なリクエスト形式です。Content-Typeがapplication/jsonであることを確認してください。'}), 400
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'リクエストボディが空です。'}), 400

    try:
        prompt_context = data.get('promptContext')
        form_data = data.get('formData')
        if not prompt_context or not form_data:
            return jsonify({'error': 'リクエストにpromptContextとformDataの両方が必要です。'}), 400

        # textLengthを取得し、元の辞書からは削除する
        # これにより、以降のループで意図せず処理されるのを防ぎ、プロンプトをクリーンに保つ
        text_length = form_data.pop('textLength', 250)

        # フォームデータを箇条書きに変換
        details_text = ""
        for key, value in form_data.items():
            # 値が存在する場合のみ追加
            if (isinstance(value, list) and value) or (isinstance(value, str) and value.strip()):
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
            error_message = f'AIによるコンテンツ生成が安全上の理由でブロックされました (理由: {block_reason})'
            app.logger.warning(error_message)
            return jsonify({'error': '生成された内容が不適切と判断されたため、表示できません。'}), 503

        # 応答テキストの有無を確認
        if not hasattr(response, 'text') or not response.text:
             app.logger.error("AIからの応答テキストがありませんでした。")
             return jsonify({'error': 'AIから有効な応答がありませんでした。'}), 500

        # AIの応答から余分な空白行を削除（3つ以上の連続改行を2つに置換）
        cleaned_text = re.sub(r'\n{3,}', '\n\n', response.text).strip()

        # 3つの改行スタイルからランダムに1つを選択
        style = random.choice(['double_newline', 'single_newline', 'single_block'])
        
        if style == 'single_newline':
            # パターン1: 2つ以上の連続改行を1つに置換（空白行なしで、こまめに改行するスタイル）
            final_text = re.sub(r'\n{2,}', '\n', cleaned_text)
        elif style == 'single_block':
            # パターン2: すべての改行をスペースに置換（改行がほとんどない1ブロックの文章）
            final_text = re.sub(r'\s*\n\s*', ' ', cleaned_text)
        else: # 'double_newline'
            # パターン3: 空白行で段落を区切るスタイル（AIの出力を尊重）
            final_text = cleaned_text

        # フロントエンドに返す直前に再度strip()を呼び出し、先頭・末尾の空白を確実に除去する
        return jsonify({'review': final_text.strip()})
    
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
    # APIサーバーなので、存在しないパスへのアクセスはJSONで404エラーを返す
    return jsonify({'error': '指定されたAPIエンドポイントは見つかりません。'}), 404

@app.errorhandler(Exception)
def handle_generic_exception(e):
    # Flaskが処理しない、その他の予期せぬ例外を捕捉
    app.logger.error(f"ハンドルされていない例外が発生: {e}", exc_info=True)
    return jsonify({'error': 'サーバー内部でエラーが発生しました。'}), 500

if __name__ == '__main__':
    # デバッグモードで起動
    # GunicornなどのWSGIサーバーで実行されるため、このブロックは本番環境では通常実行されない
    # ローカルでのデバッグ実行用に残しておく
    app.run(debug=True, port=int(os.environ.get("PORT", 5001)))