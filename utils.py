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

# --- Googleマップ（MEO）計測タスクの組合せ展開（JS側の同じ処理＝meoTasks.js） ---
# 地点・キーワードにカンマ（, 、 ，）区切りで複数書かれていたら「1地点×1語＝1タスク」へ展開する。
# 空白では区切らない（「まつげパーマ 福山」のような1語を壊さないため）。2026-10-06〜
import re as _re

_MEO_LIST_SEPARATOR = _re.compile(r'[,、，]')


def split_meo_list(raw):
    """カンマ区切りの入力を、前後の空白を除いた重複なしのリストにする。"""
    items = []
    for part in _MEO_LIST_SEPARATOR.split(str(raw or '')):
        part = part.strip()
        if part and part not in items:
            items.append(part)
    return items


def meo_task_id(salon_name, search_location, keyword):
    return f"[google]-{salon_name}-{search_location}-{keyword}"


def expand_meo_task(task):
    """google タスク1件を、地点×キーワードの組合せの個別タスクのリストにする。
    区切りが無ければ元のタスクをそのまま1件で返す（id も変えない）。google 以外もそのまま返す。"""
    if task.get('type') != 'google':
        return [task]
    locations = split_meo_list(task.get('searchLocation'))
    keywords = split_meo_list(task.get('keyword'))
    if len(locations) <= 1 and len(keywords) <= 1:
        return [task]
    expanded = []
    for loc in locations:
        for kw in keywords:
            sub = dict(task)
            sub['searchLocation'] = loc
            sub['keyword'] = kw
            sub['id'] = meo_task_id(task.get('salonName', ''), loc, kw)
            expanded.append(sub)
    return expanded


def expand_meo_tasks(tasks):
    """タスク一覧の google タスクを組合せへ展開する（順序維持・id 重複は先勝ち）。"""
    result, seen = [], set()
    for task in tasks or []:
        for t in expand_meo_task(task):
            tid = t.get('id')
            if tid is not None and tid in seen:
                continue
            if tid is not None:
                seen.add(tid)
            result.append(t)
    return result
