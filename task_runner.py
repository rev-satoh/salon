import time
import datetime
import os
import json
import random
from flask import current_app, jsonify

import config
from utils import sse_format
from driver_manager import get_attached_chrome, get_webdriver
from hpb_scraper import check_hotpepper_ranking
from feature_page_scraper import check_feature_page_ranking
from meo_scraper import check_meo_ranking
from ubereats_scraper import check_ubereats_ranking
def load_json_file(filename):
    if not os.path.exists(filename):
        return []
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

def save_json_file(filename, data):
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def update_history(history, task, date_str, rank, screenshot_path, food_rank=None):
    """履歴リストを更新するヘルパー関数

    food_rank（実質順位＝小売店を除いた飲食店内の順位）はUber Eatsのみ。
    値が無い場合はキー自体を付けない（既存履歴との後方互換のため）。
    """
    task_id = task['id']
    task_history = next((item for item in history if item["id"] == task_id), None)
    log_entry = {'date': date_str, 'rank': rank, 'screenshot': screenshot_path}
    if food_rank is not None:
        log_entry['food_rank'] = food_rank

    if task_history:
        date_entry = next((d for d in task_history['log'] if d['date'] == date_str), None)
        if date_entry:
            date_entry.update(log_entry)
        else:
            task_history['log'].append(log_entry)
            task_history['log'].sort(key=lambda x: datetime.datetime.strptime(x['date'], '%Y/%m/%d'))
    else:
        history.append({
            "id": task_id,
            "task": task,
            "log": [log_entry]
        })

def _is_recordable(result, rank):
    """履歴に書いてよい結果かを判定する（4モード共通）。

    判定仕様：
    - 数値の順位 … 常に書く
    - '圏外' … スクレイパが `list_fetched: True`（一覧を実際に取得できた）を
      返している時だけ「圏外確定」として書く。フラグが False／欠落＝一覧を
      取得できていない＝「未取得」なので履歴に書かない（欠測にする）。
    - それ以外（'エラー'・'枠無'・'要確認'）… 従来どおり書く
    """
    if rank == '圏外':
        return bool(result.get('list_fetched'))
    return True


def _record_result(history, task, today, rank, screenshot_path, result, history_filename, food_rank=None):
    """判定を通った結果だけを履歴へ書き込む。書いたら True を返す。"""
    if not _is_recordable(result, rank):
        current_app.logger.warning(
            f"タスク '{task.get('id')}' は一覧を取得できなかったため履歴に記録しません（未取得）。"
        )
        return False
    update_history(history, task, today, rank, screenshot_path, food_rank)
    save_json_file(history_filename, history)
    return True


def _run_normal_tasks(driver, tasks, history, history_filename, today, stream_progress, job_counter, total_job_count, save_screenshot=True):
    """HPB通常検索タスクを実行する"""
    for task in tasks:
        job_counter += 1
        task_id = task['id']
        area_name_for_task = task.get('areaName', '')
        task_name = f"[{area_name_for_task}] {task.get('serviceKeyword', '')}"
        task['areaName'] = area_name_for_task

        if stream_progress:
            yield sse_format({"progress": {"current": job_counter, "total": total_job_count, "task": task}})
        else:
            current_app.logger.info(f"タスク '{task_id}' の計測を開始...")

        result = {}
        try:
            try:
                generator = check_hotpepper_ranking(driver, task.get('serviceKeyword', ''), task['salonName'], task['areaCodes'], save_screenshot=save_screenshot)
            except TypeError:
                # save_screenshot引数に対応していない場合のフォールバック
                generator = check_hotpepper_ranking(driver, task.get('serviceKeyword', ''), task['salonName'], task['areaCodes'])

            for sse_message in generator:
                data = json.loads(sse_message.split('data: ')[1])
                if stream_progress and 'status' in data:
                    yield sse_format({"status": data['status'], "task_name": task_name})
                if 'final_result' in data:
                    result = data['final_result']
        except Exception as e:
            current_app.logger.exception(f"HPB通常タスク '{task_id}' の実行中にエラーが発生しました。")
            result = {"rank": "エラー"}

        rank_to_save = result.get('results', [{}])[0].get('rank', result.get('rank', '圏外'))
        _record_result(history, task, today, rank_to_save, result.get('screenshot_path'), result, history_filename)
        current_app.logger.info(f"タスク '{task_id}' の結果: {rank_to_save}位")

        if stream_progress:
            yield sse_format({"result": {"rank": rank_to_save, "total_count": result.get('total_count'), "task_name": task_name, "task_id": task_id}})
            time.sleep(1)
        else:
            time.sleep(random.uniform(config.TASK_WAIT_TIME_MIN, config.TASK_WAIT_TIME_MAX))
    return job_counter

def _run_special_tasks(driver, tasks_grouped, history, history_filename, all_tasks, today, stream_progress, job_counter, total_job_count, save_screenshot=True):
    """HPB特集ページタスクを実行する"""
    for url, tasks_in_group in tasks_grouped.items():
        job_counter += 1
        salon_names_in_group = [t['salonName'] for t in tasks_in_group]
        # フロントエンド表示用にフィールドを補完
        representative_task = tasks_in_group[0].copy()
        representative_task['areaName'] = '特集'
        representative_task['serviceKeyword'] = representative_task.get('featurePageName', url)
        task_name = representative_task.get('featurePageName', url)

        if stream_progress:
            yield sse_format({"progress": {"current": job_counter, "total": total_job_count, "task": representative_task}})
        else:
            current_app.logger.info(f"特集ページ '{url}' の一括計測を開始... 対象サロン: {salon_names_in_group}")

        result = {}
        try:
            try:
                generator = check_feature_page_ranking(driver, url, salon_names_in_group, save_screenshot=save_screenshot)
            except TypeError:
                # save_screenshot引数に対応していない場合のフォールバック
                generator = check_feature_page_ranking(driver, url, salon_names_in_group)

            for sse_message in generator:
                data = json.loads(sse_message.split('data: ')[1])
                if stream_progress and 'status' in data:
                    yield sse_format({"status": data['status'], "task_name": task_name})
                if 'final_result' in data:
                    result = data['final_result']
        except Exception as e:
            current_app.logger.exception(f"HPB特集タスク '{url}' の実行中にエラーが発生しました。")
            result = {}

        for task in tasks_in_group:
            task_id = task['id']
            salon_name = task['salonName']
            page_title = result.get('page_title')
            if page_title and not task.get('featurePageName'):
                task['featurePageName'] = page_title
                original_task = next((t for t in all_tasks if t.get('id') == task_id), None)
                if original_task: original_task['featurePageName'] = page_title

            salon_results = result.get('results_map', {}).get(salon_name, [])
            rank_to_save = salon_results[0]['rank'] if salon_results else '圏外'
            _record_result(history, task, today, rank_to_save, result.get('screenshot_path'), result, history_filename)
            current_app.logger.info(f"タスク '{task_id}' ({salon_name}) の結果: {rank_to_save}位")

            if stream_progress:
                individual_task_name = f"[{task['salonName']}] {task.get('featurePageName', task.get('featurePageUrl'))}"
                yield sse_format({"result": {"rank": rank_to_save, "total_count": result.get('total_count'), "task_name": individual_task_name, "task_id": task_id}})
                time.sleep(1)
        
        if not stream_progress:
            time.sleep(random.uniform(config.TASK_WAIT_TIME_MIN, config.TASK_WAIT_TIME_MAX))
    return job_counter

def _run_meo_tasks(driver, tasks_grouped, history, history_filename, today, stream_progress, job_counter, total_job_count, save_screenshot=True):
    """MEOタスクを実行する"""
    for (location, keyword), tasks_in_group in tasks_grouped.items():
        job_counter += 1
        # フロントエンド表示用にフィールドを補完 ([undefined] undefined 回避)
        representative_task = tasks_in_group[0].copy()
        representative_task['areaName'] = location
        representative_task['serviceKeyword'] = keyword
        task_name = f"[{location}] {keyword}"

        if stream_progress:
            yield sse_format({"progress": {"current": job_counter, "total": total_job_count, "task": representative_task}})
        else:
            current_app.logger.info(f"MEO一括計測 '{task_name}' を開始...")

        result = {}
        try:
            try:
                scraper_generator = check_meo_ranking(driver, keyword, location, target_salon_name=tasks_in_group[0]['salonName'], save_screenshot=save_screenshot)
            except TypeError:
                # save_screenshot引数に対応していない場合のフォールバック
                scraper_generator = check_meo_ranking(driver, keyword, location)

            for sse_message in scraper_generator:
                data = json.loads(sse_message.split('data: ')[1])
                if stream_progress and 'status' in data:
                    yield sse_format({"status": data['status'], "task_name": task_name})
                if 'final_result' in data:
                    result = data['final_result']
        except Exception as e:
            current_app.logger.exception(f"MEOタスク '{task_name}' の実行中にエラーが発生しました。")
            result = {}

        for task in tasks_in_group:
            try:
                task_id = task['id']
                if result.get("rank") == "枠無":
                    rank_to_save = "枠無"
                else:
                    my_salon_result = next((r for r in result.get('results', []) if task['salonName'].lower() in r.get('foundSalonName', '').lower()), None)
                    rank_to_save = my_salon_result['rank'] if my_salon_result else '圏外'
                
                screenshot_path_to_save = result.get('screenshot_path')
                _record_result(history, task, today, rank_to_save, screenshot_path_to_save, result, history_filename)
                current_app.logger.info(f"MEOタスク '{task_id}' の結果: {rank_to_save}")

                if stream_progress:
                    individual_task_name = f"[{task['salonName']}] {task_name}"
                    yield sse_format({"result": {"rank": rank_to_save, "total_count": result.get('total_count'), "task_name": individual_task_name, "task_id": task_id}})
                    time.sleep(1)
            except Exception as e:
                current_app.logger.exception(f"MEOタスク '{task.get('id', '不明')}' の結果処理中にエラーが発生しました。")
                update_history(history, task, today, "エラー", None)
                save_json_file(history_filename, history) # エラー時も保存

        if not stream_progress:
            time.sleep(random.uniform(config.TASK_WAIT_TIME_MIN, config.TASK_WAIT_TIME_MAX))
    return job_counter

def _run_ubereats_tasks(driver, tasks, history, history_filename, today, stream_progress, job_counter, total_job_count, save_screenshot=True):
    """Uber Eats検索タスクを実行する。"""
    for task in tasks:
        job_counter += 1
        task_id = task['id']
        task_name = f"[{task.get('addressLabel') or task.get('address', '')}] {task.get('keyword', '')}"

        if stream_progress:
            yield sse_format({"progress": {"current": job_counter, "total": total_job_count, "task": task}})
        else:
            current_app.logger.info(f"Uber Eatsタスク '{task_id}' の計測を開始...")

        result = {}
        try:
            generator = check_ubereats_ranking(
                driver,
                task.get('keyword', ''),
                task.get('storeName', ''),
                task.get('address', ''),
                save_screenshot=save_screenshot,
            )
            for sse_message in generator:
                data = json.loads(sse_message.split('data: ')[1])
                if stream_progress and 'status' in data:
                    yield sse_format({"status": data['status'], "task_name": task_name})
                if 'final_result' in data:
                    result = data['final_result']
                if 'error' in data:
                    result = {"rank": "エラー", "screenshot_path": data.get("screenshot_path")}
        except Exception:
            current_app.logger.exception(f"Uber Eatsタスク '{task_id}' の実行中にエラーが発生しました。")
            result = {"rank": "エラー"}

        rank_to_save = result.get('rank', '圏外')
        food_rank_to_save = result.get('food_rank')
        _record_result(history, task, today, rank_to_save, result.get('screenshot_path'), result, history_filename, food_rank_to_save)
        current_app.logger.info(f"Uber Eatsタスク '{task_id}' の結果: {rank_to_save}位（飲食のみ {food_rank_to_save}）")

        if stream_progress:
            yield sse_format({
                "result": {
                    "rank": rank_to_save,
                    "food_rank": food_rank_to_save,
                    "total_count": result.get("total_count"),
                    "retail_count": result.get("retail_count"),
                    "task_name": task_name,
                    "task_id": task_id,
                }
            })
            if result.get("stop_batch"):
                current_app.logger.warning("Uber Eats側の制限または不完全結果を検出したため、後続のUber Eatsタスクを中断します。")
                break
            time.sleep(config.UBER_EATS_TASK_WAIT_SECONDS)
        else:
            if result.get("stop_batch"):
                current_app.logger.warning("Uber Eats側の制限または不完全結果を検出したため、後続のUber Eatsタスクを中断します。")
                break
            time.sleep(max(config.UBER_EATS_TASK_WAIT_SECONDS, random.uniform(config.TASK_WAIT_TIME_MIN, config.TASK_WAIT_TIME_MAX)))
    return job_counter

# --- 計測レーンの表（正本・1か所） -------------------------------------------
# レーン＝同時に走らせてよい計測の単位。app.py はこの表からロック・中断フラグを作り、
# 画面（ui.js の LANE_OF_TYPE）も同じ区分で計測中の状態・結果欄を分ける。
#   types        … このレーンで計測するタスク種別（auto_tasks.json の type）
#   history_keys … このレーンが書き戻す履歴ファイル（config.HISTORY_FILES のキー）
#   saves_tasks  … auto_tasks.json を書き戻すか（HPB通常の areaName 補完・特集ページ名の更新があるため hpb だけ）
# 表に無い種別（seo 等）は DEFAULT_LANE で扱う（従来どおり HPB通常の経路で計測される）。
LANES = {
    'hpb': {'label': 'HPB（通常・特集）', 'types': ('normal', 'special'), 'history_keys': ('normal', 'special'), 'saves_tasks': True},
    'meo': {'label': 'MEO', 'types': ('google',), 'history_keys': ('google',), 'saves_tasks': False},
    'ubereats': {'label': 'Uber Eats', 'types': ('ubereats',), 'history_keys': ('ubereats',), 'saves_tasks': False},
}
DEFAULT_LANE = 'hpb'
_LANE_BY_TYPE = {task_type: lane for lane, spec in LANES.items() for task_type in spec['types']}


def lane_of_task_type(task_type):
    return _LANE_BY_TYPE.get(task_type or 'normal', DEFAULT_LANE)


def _save_lane_results(lane, all_tasks, histories):
    """レーンが担当する履歴ファイル（とタスク定義）だけを、tasks.jsonの順序に並び替えて保存する。"""
    task_id_order = {task['id']: i for i, task in enumerate(all_tasks)}
    for key in LANES[lane]['history_keys']:
        histories[key].sort(key=lambda x: task_id_order.get(x['id'], float('inf')))
        save_json_file(config.HISTORY_FILES[key], histories[key])
    if LANES[lane]['saves_tasks']:
        save_json_file(config.TASKS_FILE, all_tasks)
    current_app.logger.info(f"{LANES[lane]['label']}の履歴を保存しました。")


def run_scheduled_check(task_ids_to_run=None, stream_progress=False, save_screenshot=True, lanes=None, on_lane_done=None):
    """
    指定されたタスク、またはすべてのタスクを実行し、結果を履歴ファイルに保存する
    :param task_ids_to_run: 実行するタスクIDのリスト。Noneの場合は全タスクを実行。
    :param lanes: 実行するレーンの集合（LANES のキー）。Noneなら全レーン。
                  呼び出し側が取れたロックのレーンだけを渡す（app.py のレーン別ロック）。
    :param on_lane_done: レーン1本分が終わるたびに lane を渡して呼ぶ関数（混在実行でロックを先に返すため）。
    🔴 履歴・タスク定義の保存は「このジョブで実行したレーンのファイルだけ」。
       他のレーンは並行して計測・保存している可能性があり、ここで読み込み時点の
       古い内容を書き戻すとその結果を消してしまうため。
    """
    lanes_to_run = set(LANES) if lanes is None else set(lanes)
    current_app.logger.info("--- 自動計測ジョブを開始します ---")
    all_tasks = load_json_file(config.TASKS_FILE)

    tasks_to_run = []
    if task_ids_to_run:
        seen_ids = set()
        unique_task_ids = []
        for task_id in task_ids_to_run:
            if task_id not in seen_ids:
                seen_ids.add(task_id)
                unique_task_ids.append(task_id)
        task_ids_to_run = unique_task_ids
        current_app.logger.info(f"選択された {len(task_ids_to_run)} 件のタスクを実行します。ID: {task_ids_to_run}")
        tasks_to_run = [task for task in all_tasks if task.get('id') in task_ids_to_run]
    else:
        current_app.logger.info("スケジュールされた全タスクを実行します。")
        tasks_to_run = all_tasks

    histories = {key: load_json_file(filename) for key, filename in config.HISTORY_FILES.items()}
    today = datetime.date.today().strftime('%Y/%m/%d')

    normal_tasks = []
    special_tasks_grouped_by_url = {}
    meo_tasks_grouped = {} # MEOタスクをグループ化するための辞書
    ubereats_tasks = []
    for task in tasks_to_run:
        if lane_of_task_type(task.get('type', 'normal')) not in lanes_to_run:
            continue
        task_type = task.get('type', 'normal')
        if task_type == 'special':
            special_tasks_grouped_by_url.setdefault(task['featurePageUrl'], []).append(task)
        elif task_type == 'google':
            meo_tasks_grouped.setdefault((task.get('searchLocation'), task.get('keyword')), []).append(task)
        elif task_type == 'ubereats':
            ubereats_tasks.append(task)
        else:
            normal_tasks.append(task)

    jobs_by_lane = {
        'hpb': len(normal_tasks) + len(special_tasks_grouped_by_url),
        'meo': len(meo_tasks_grouped),
        'ubereats': len(ubereats_tasks),
    }
    total_job_count = sum(jobs_by_lane.values())
    progress = {'done': 0}

    def run_hpb():
        with get_webdriver(is_seo=False) as driver:
            yield from _run_normal_tasks(driver, normal_tasks, histories['normal'], config.HISTORY_FILES['normal'], today, stream_progress, progress['done'], total_job_count, save_screenshot=save_screenshot)
            yield from _run_special_tasks(driver, special_tasks_grouped_by_url, histories['special'], config.HISTORY_FILES['special'], all_tasks, today, stream_progress, progress['done'] + len(normal_tasks), total_job_count, save_screenshot=save_screenshot)

    def run_meo():
        with get_webdriver(is_seo=False) as driver:
            yield from _run_meo_tasks(driver, meo_tasks_grouped, histories['google'], config.HISTORY_FILES['google'], today, stream_progress, progress['done'], total_job_count, save_screenshot=save_screenshot)

    def run_ubereats():
        with get_attached_chrome(
            port=config.UBER_EATS_REMOTE_DEBUGGING_PORT,
            user_data_dir=config.UBER_EATS_CHROME_PROFILE_DIR,
        ) as uber_driver:
            yield from _run_ubereats_tasks(uber_driver, ubereats_tasks, histories['ubereats'], config.HISTORY_FILES['ubereats'], today, stream_progress, progress['done'], total_job_count, save_screenshot=save_screenshot)

    runners = {'hpb': run_hpb, 'meo': run_meo, 'ubereats': run_ubereats}
    unsaved = set()  # 実行を始めたが、まだ保存していないレーン（途中の例外に備える）

    try:
        for lane in LANES:
            if lane not in lanes_to_run:
                continue
            if jobs_by_lane[lane]:
                unsaved.add(lane)
                yield from runners[lane]()
                progress['done'] += jobs_by_lane[lane]
                _save_lane_results(lane, all_tasks, histories)
                unsaved.discard(lane)
            if on_lane_done:
                on_lane_done(lane)

    except Exception as e:
        current_app.logger.exception("自動計測ジョブ全体で予期せぬエラーが発生しました。")
        if stream_progress:
            yield sse_format({"error": f"計測ジョブ全体で予期せぬエラーが発生しました: {e}"})
    finally:
        # 途中で抜けたレーンの分も、そのレーンのファイルだけを保存する
        for lane in list(unsaved):
            _save_lane_results(lane, all_tasks, histories)

        if stream_progress:
            yield sse_format({"final_status": f"すべての計測が完了しました。（{total_job_count}件）"})
        else:
            current_app.logger.info("--- 自動計測ジョブが完了しました ---")
