import time
import datetime
import os
import json
import random
from flask import current_app, jsonify

import config
from utils import sse_format
from driver_manager import get_webdriver
from hpb_scraper import check_hotpepper_ranking
from feature_page_scraper import check_feature_page_ranking
from meo_scraper import check_meo_ranking
from seo_scraper import check_seo_ranking
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

def update_history(history, task, date_str, rank, screenshot_path):
    """履歴リストを更新するヘルパー関数"""
    task_id = task['id']
    task_history = next((item for item in history if item["id"] == task_id), None)
    log_entry = {'date': date_str, 'rank': rank, 'screenshot': screenshot_path}

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

def _run_normal_tasks(driver, tasks, history, today, stream_progress, job_counter, total_job_count):
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
            for sse_message in check_hotpepper_ranking(driver, task.get('serviceKeyword', ''), task['salonName'], task['areaCodes']):
                data = json.loads(sse_message.split('data: ')[1])
                if stream_progress and 'status' in data:
                    yield sse_format({"status": data['status'], "task_name": task_name})
                if 'final_result' in data:
                    result = data['final_result']
        except Exception as e:
            current_app.logger.exception(f"HPB通常タスク '{task_id}' の実行中にエラーが発生しました。")
            result = {"rank": "エラー"}

        rank_to_save = result.get('results', [{}])[0].get('rank', result.get('rank', '圏外'))
        update_history(history, task, today, rank_to_save, result.get('screenshot_path'))
        current_app.logger.info(f"タスク '{task_id}' の結果: {rank_to_save}位")

        if stream_progress:
            yield sse_format({"result": {"rank": rank_to_save, "total_count": result.get('total_count'), "task_name": task_name, "task_id": task_id}})
            time.sleep(1)
        else:
            time.sleep(random.uniform(config.TASK_WAIT_TIME_MIN, config.TASK_WAIT_TIME_MAX))
    return job_counter

def _run_special_tasks(driver, tasks_grouped, history, all_tasks, today, stream_progress, job_counter, total_job_count):
    """HPB特集ページタスクを実行する"""
    for url, tasks_in_group in tasks_grouped.items():
        job_counter += 1
        salon_names_in_group = [t['salonName'] for t in tasks_in_group]
        representative_task = tasks_in_group[0]
        task_name = representative_task.get('featurePageName', url)

        if stream_progress:
            yield sse_format({"progress": {"current": job_counter, "total": total_job_count, "task": representative_task}})
        else:
            current_app.logger.info(f"特集ページ '{url}' の一括計測を開始... 対象サロン: {salon_names_in_group}")

        result = {}
        try:
            for sse_message in check_feature_page_ranking(driver, url, salon_names_in_group):
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
            update_history(history, task, today, rank_to_save, result.get('screenshot_path'))
            current_app.logger.info(f"タスク '{task_id}' ({salon_name}) の結果: {rank_to_save}位")

            if stream_progress:
                individual_task_name = f"[{task['salonName']}] {task.get('featurePageName', task.get('featurePageUrl'))}"
                yield sse_format({"result": {"rank": rank_to_save, "total_count": result.get('total_count'), "task_name": individual_task_name, "task_id": task_id}})
                time.sleep(1)
        
        if not stream_progress:
            time.sleep(random.uniform(config.TASK_WAIT_TIME_MIN, config.TASK_WAIT_TIME_MAX))
    return job_counter

def _run_meo_tasks(driver, tasks_grouped, history, today, stream_progress, job_counter, total_job_count):
    """MEOタスクを実行する"""
    for (location, keyword), tasks_in_group in tasks_grouped.items():
        job_counter += 1
        representative_task = tasks_in_group[0]
        task_name = f"[{location}] {keyword}"

        if stream_progress:
            yield sse_format({"progress": {"current": job_counter, "total": total_job_count, "task": representative_task}})
        else:
            current_app.logger.info(f"MEO一括計測 '{task_name}' を開始...")

        result = {}
        try:
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
                update_history(history, task, today, rank_to_save, screenshot_path_to_save)
                current_app.logger.info(f"MEOタスク '{task_id}' の結果: {rank_to_save}")

                if stream_progress:
                    individual_task_name = f"[{task['salonName']}] {task_name}"
                    yield sse_format({"result": {"rank": rank_to_save, "total_count": result.get('total_count'), "task_name": individual_task_name, "task_id": task_id}})
                    time.sleep(1)
            except Exception as e:
                current_app.logger.exception(f"MEOタスク '{task.get('id', '不明')}' の結果処理中にエラーが発生しました。")
                update_history(history, task, today, "エラー", None)

        if not stream_progress:
            time.sleep(random.uniform(config.TASK_WAIT_TIME_MIN, config.TASK_WAIT_TIME_MAX))
    return job_counter

def run_scheduled_check(task_ids_to_run=None, stream_progress=False):
    """
    指定されたタスク、またはすべてのタスクを実行し、結果を履歴ファイルに保存する
    :param task_ids_to_run: 実行するタスクIDのリスト。Noneの場合は全タスクを実行。
    """
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

    history_normal = load_json_file(config.HISTORY_FILES['normal'])
    history_special = load_json_file(config.HISTORY_FILES['special'])
    history_meo = load_json_file(config.HISTORY_FILES['google'])
    today = datetime.date.today().strftime('%Y/%m/%d')

    normal_tasks = []
    special_tasks_grouped_by_url = {}
    meo_tasks_grouped = {} # MEOタスクをグループ化するための辞書
    for task in tasks_to_run:
        task_type = task.get('type', 'normal')
        if task_type == 'special':
            url = task['featurePageUrl']
            if url not in special_tasks_grouped_by_url:
                special_tasks_grouped_by_url[url] = []
            special_tasks_grouped_by_url[url].append(task)
        elif task_type == 'google':
            group_key = (task.get('searchLocation'), task.get('keyword'))
            if group_key not in meo_tasks_grouped:
                meo_tasks_grouped[group_key] = []
            meo_tasks_grouped[group_key].append(task)
        else:
            normal_tasks.append(task)

    total_job_count = len(normal_tasks) + len(special_tasks_grouped_by_url) + len(meo_tasks_grouped)
    job_counter = 0

    try:
        # --- HPB通常, 特集, MEOタスクの処理 ---
        if normal_tasks or special_tasks_grouped_by_url or meo_tasks_grouped:
            with get_webdriver(is_seo=False) as driver:
                # HPB通常タスク
                yield from _run_normal_tasks(driver, normal_tasks, history_normal, today, stream_progress, job_counter, total_job_count)
                job_counter = len(normal_tasks)

                # HPB特集タスク
                yield from _run_special_tasks(driver, special_tasks_grouped_by_url, history_special, all_tasks, today, stream_progress, job_counter, total_job_count)
                job_counter += len(special_tasks_grouped_by_url)

                # MEOタスク
                yield from _run_meo_tasks(driver, meo_tasks_grouped, history_meo, today, stream_progress, job_counter, total_job_count)
                job_counter += len(meo_tasks_grouped)

    except Exception as e:
        current_app.logger.exception("自動計測ジョブ全体で予期せぬエラーが発生しました。")
        if stream_progress:
            yield sse_format({"error": f"計測ジョブ全体で予期せぬエラーが発生しました: {e}"})
    finally:
        # 履歴を保存する前に、tasks.jsonの順序にソートする
        task_id_order = {task['id']: i for i, task in enumerate(all_tasks)}
        
        history_normal.sort(key=lambda x: task_id_order.get(x['id'], float('inf')))
        history_special.sort(key=lambda x: task_id_order.get(x['id'], float('inf')))
        history_meo.sort(key=lambda x: task_id_order.get(x['id'], float('inf')))
        
        current_app.logger.info("履歴データをタスク定義ファイルの順序に並び替えて保存します。")

        save_json_file(config.HISTORY_FILES['normal'], history_normal)
        save_json_file(config.HISTORY_FILES['special'], history_special)
        save_json_file(config.HISTORY_FILES['google'], history_meo)
        save_json_file(config.TASKS_FILE, all_tasks)
        
        if stream_progress:
            yield sse_format({"final_status": f"すべての計測が完了しました。（{total_job_count}件）"})
        else:
            current_app.logger.info("--- 自動計測ジョブが完了しました ---")