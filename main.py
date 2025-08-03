import os
import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS

# 環境変数からGoogleのAPIキーを読み込む
try:
    # ローカルの .env ファイルやCloud Functionsの環境変数から読み込む
    from dotenv import load_dotenv
    load_dotenv()
    
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("APIキーが設定されていません。環境変数 'GOOGLE_API_KEY' を設定してください。")
    genai.configure(api_key=api_key)

except ImportError:
    print("dotenvライブラリが見つかりません。ローカル実行の場合は 'pip install python-dotenv' を実行してください。")
except Exception as e:
    print(f"APIキーの設定中にエラーが発生しました: {e}")


app = Flask(__name__)
# CORSを有効にし、どのオリジンからのリクエストも許可する（本番環境ではドメインを限定することを推奨）
CORS(app)

def create_prompt(form_data, context):
    """フロントエンドから受け取ったデータとコンテキストから、AIへのプロンプトを生成する"""
    
    # フォームデータを人間が読みやすいテキストに変換
    answers = []
    for key, value in form_data.items():
        if value: # 値が空でない項目のみを対象にする
            # 配列の場合はカンマ区切りの文字列に変換
            if isinstance(value, list):
                value_str = ", ".join(value)
            else:
                value_str = str(value)
            answers.append(f"- {key}: {value_str}")

    answer_text = "\n".join(answers)

    # 指示文（コンテキスト）とアンケート結果を結合してプロンプトを作成
    prompt = f"""{context}

---
【お客様のアンケート回答】
{answer_text}
---

上記のアンケート回答を元に、レビューを作成してください。
"""
    return prompt

@app.route('/generate', methods=['POST'])
def generate_review_api():
    """APIのエンドポイント"""
    if not request.is_json:
        return jsonify({"error": "リクエストはJSON形式である必要があります"}), 400

    data = request.get_json()
    form_data = data.get('formData')
    context = data.get('context')

    if not form_data or not context:
        return jsonify({"error": "formDataとcontextの両方が必要です"}), 400

    try:
        # プロンプトを生成
        prompt = create_prompt(form_data, context)
        
        # Gemini APIを呼び出し
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(prompt)
        
        return jsonify({"review": response.text})
    except Exception as e:
        print(f"API呼び出し中にエラーが発生しました: {e}")
        return jsonify({"error": "AIの呼び出し中に内部エラーが発生しました。"}), 500