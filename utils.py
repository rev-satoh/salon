import json
import requests
import urllib.parse
import config

def sse_format(data: dict) -> str:
    """Server-Sent Eventsのフォーマットで文字列を返す"""
    return f"data: {json.dumps(data)}\n\n"

def get_lat_lng_from_address(address):
    """地名から緯度・経度を取得する"""
    if not config.GOOGLE_API_KEY:
        raise ValueError("Google APIキーが設定されていません。")

    geocode_url = f"https://maps.googleapis.com/maps/api/geocode/json?address={urllib.parse.quote(address)}&key={config.GOOGLE_API_KEY}&language=ja"
    response = requests.get(geocode_url)
    response.raise_for_status()
    data = response.json()

    if data['status'] == 'OK':
        location = data['results'][0]['geometry']['location']
        return location['lat'], location['lng']
    else:
        raise ValueError(f"ジオコーディングに失敗しました: {data.get('error_message', data['status'])}")