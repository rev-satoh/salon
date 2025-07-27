import os
import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from google.api_core import exceptions as google_exceptions

# .envファイルから環境変数を読み込む
load_dotenv()

app = Flask(__name__)
# CORS(Cross-Origin Resource Sharing)をアプリケーション全体で有効にする
# これにより、異なるオリジン(例: http://localhost:8000)で動作するフロントエンドからのAPIリクエストが許可される
CORS(app)

# Google AIのAPIキーを設定
try:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("APIキーが設定されていません。.envファイルを確認してください。")
    genai.configure(api_key=api_key)
except Exception as e:
    print(f"サーバー起動エラー: {e}")

# お客様の声 生成用のAPIエンドポイント
@app.route('/generate-review', methods=['POST'])
def generate_review():
    # リクエストボディがJSON形式であり、空でないことを検証
    if not request.is_json:
        return jsonify({'error': 'リクエストの形式が正しくありません。JSON形式で送信してください。'}), 400
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'リクエストボディが空です。'}), 400

    try:
        # 複数選択された項目を自然な文字列に変換
        service_text = ', '.join(data.get('service', [])) if data.get('service') else '特に選択なし'
        atmosphere_text = ', '.join(data.get('atmosphere', [])) if data.get('atmosphere') else '特に選択なし'
        staff_text = ', '.join(data.get('staff', [])) if data.get('staff') else '特に選択なし'

        # AIへの指示（プロンプト）を組み立て
        prompt = f"""
        あなたはプロのライターです。人気サロンの顧客になりきって、以下の情報を元にお客様の声としてサイトに掲載する、自然で魅力的な文章を作成してください。

        # 顧客情報
        - 来店区分: {data.get('visitType') or '未選択'}
        - 希望するお声のトーン: {data.get('tone') or 'おまかせ'}

        # 施術情報
        - 施術内容: {service_text}
        - 仕上がりの満足度: {data.get('satisfaction') or '未選択'}
        - お店の雰囲気: {atmosphere_text}
        - スタッフの接客: {staff_text}
        - 特に良かった点: {data.get('goodPoint') or '特になし'}
        - 悪かった点・改善点: {data.get('badPoint') or '特になし'}

        # 作成する「お客様の声」のルール
        - 指定された「希望するお声のトーン」を最優先し、文章全体の雰囲気を決定してください。もしトーンが「おまかせ」や「未選択」の場合は、他の情報から最適なトーンを判断してください。例えば「感謝を伝える」なら感謝の気持ちが前面に出るように、「具体的・分析的」なら良かった点を客観的に説明するように記述します。
        - 「来店区分」に応じて、初めて来た顧客の視点か、リピーターの視点かを書き分けてください。
        - 「悪かった点・改善点」に具体的な記述がある場合、それを不満やクレームとしてではなく、今後の期待を込めた建設的な意見として、丁寧な言葉で表現してください。ただし、満足度が「不満」の場合は、そのトーンを反映しても構いません。
        - 顧客本人が書いたような、自然で誠実な文章にしてください。
        - 全体で200文字程度の、読みやすい文章量にまとめてください。
        """

        # 利用可能なモデルの中から 'gemini-1.5-flash-latest' を指定
        model = genai.GenerativeModel('models/gemini-1.5-flash-latest')
        response = model.generate_content(prompt)

        # AIからの応答が安全上の理由でブロックされていないか確認
        if response.prompt_feedback.block_reason:
            block_reason = response.prompt_feedback.block_reason.name
            error_message = f'AIによるコンテンツ生成が安全上の理由でブロックされました。({block_reason})'
            print(error_message)
            return jsonify({'error': error_message}), 503

        # 応答にテキストが含まれているか確認
        if not response.text:
             print("AIからの応答にテキストが含まれていませんでした。")
             return jsonify({'error': 'AIからの応答が空でした。プロンプトを調整してください。'}), 500

        return jsonify({'review': response.text})

    except google_exceptions.PermissionDenied as e:
        print(f"Google AI APIエラー (Permission Denied): {e}")
        return jsonify({'error': f'Google AI APIへのアクセスが拒否されました。APIキーやAPI設定を確認してください。\n詳細: {e}'}), 500
    except google_exceptions.InvalidArgument as e:
        print(f"Google AI APIエラー (Invalid Argument): {e}")
        return jsonify({'error': f'AIへのリクエスト内容に問題があります。\n詳細: {e}'}), 400
    except Exception as e:
        print(f"予期せぬエラーが発生しました: {e}")
        return jsonify({'error': f'サーバー内部で予期せぬエラーが発生しました。\n詳細: {e}'}), 500

if __name__ == '__main__':
    # デバッグモードを有効にしてサーバーを起動
    app.run(debug=True, port=5001)