import os
import re
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
PROMPT_TEMPLATE = """
{prompt_context} 以下のアンケート結果を元に、顧客の感情や体験が伝わるような、自然で魅力的なお客様の声を作成してください。

# アンケート結果
{details_text}

# 作成ルール
- **最重要ルール**: アンケート結果に記載されている情報のみを使い、文章を作成してください。結果に記載がない項目（例：売却した品物、来店回数など）については、絶対に言及しないでください。
- アンケート結果の「tone」で指定された雰囲気を文章全体で表現してください。例えば「感謝を伝える」なら感謝の気持ちが前面に出るように、「カジュアル」なら親しみやすい言葉遣いになるようにしてください。
- 「visitType」に回答がある場合、その情報を文章中に**一度だけ**含めてください。配置は冒頭、文中、文末など自然な形で構いませんが、繰り返し使用しないでください。
- 「badPoint」に記述がある場合、その内容を「今後の期待を込めて」というニュアンスで、丁寧かつ簡潔に文章に含めてください。「強いて言えば」のような前置きは不要です。
- 顧客本人が書いたような、自然で誠実な文章にしてください。
- 全体で約{text_length}文字にまとめてください。
- 文章の改行スタイルを、以下の3つのうちからランダムに1つ選んでください：【改行なしの1ブロックの文章にする】、【内容の区切りで改行を1つだけ入れる】、【内容の区切りで改行を2つ入れて空白行を1行作る】。
- 毎回少しずつ表現を変えて、より自然な文章にしてください。
"""

app = Flask(__name__)
# CORS(Cross-Origin Resource Sharing)を有効化
CORS(app)

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
        text_length = form_data.get('textLength', 250) # スライダーの値を取得、なければデフォルト250

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
        cleaned_text = re.sub(r'\n{3,}', '\n\n', response.text)

        return jsonify({'review': cleaned_text.strip()})
    
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

@app.errorhandler(Exception)
def handle_generic_exception(e):
    # Flaskが処理しない、その他の予期せぬ例外を捕捉
    app.logger.error(f"ハンドルされていない例外が発生: {e}", exc_info=True)
    return jsonify({'error': 'サーバー内部でエラーが発生しました。'}), 500

if __name__ == '__main__':
    # デバッグモードで起動
    app.run(debug=True, port=5001)