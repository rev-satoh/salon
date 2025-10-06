import time
import datetime
import os
import json
from bs4 import BeautifulSoup
from selenium.common.exceptions import TimeoutException
from PIL import Image

def sse_format(data: dict) -> str:
    """Server-Sent Eventsのフォーマットで文字列を返す"""
    return f"data: {json.dumps(data)}\n\n"

def check_feature_page_ranking(driver, feature_page_url, salon_names):
    """
    ホットペッパービューティーの特集ページ内での掲載順位をスクレイピングで取得するジェネレータ関数。
    :param driver: SeleniumのWebDriverインスタンス
    :param feature_page_url: 計測対象の特集ページのURL
    :param salon_names: 探したいサロン名のリスト
    """
    found_salons_map = {name: [] for name in salon_names} # サロン名ごとに結果を格納
    total_count = 0
    screenshot_path = None
    page_title = "（タイトル取得失敗）"

    last_url_checked = ""
    last_html_content = "リクエストが実行されませんでした。"

    # スクリーンショット保存用ディレクトリを作成
    if not os.path.exists('screenshots'):
        os.makedirs('screenshots')

    try:
        # ページを1から順番にチェック（最大5ページ=100位まで）
        for page in range(1, 6):
            # --- URL生成ロジックをパス形式に修正 ---
            base_url = feature_page_url
            # 既に入力URLにページ番号が含まれている場合、それを除去してベースURLを正規化
            import re
            base_url = re.sub(r'PN\d+/?$', '', base_url)
            # 末尾が'/'で終わるように調整
            if not base_url.endswith('/'):
                base_url += '/'

            url = base_url if page == 1 else f"{base_url}PN{page}/"

            yield sse_format({"status": f"{page}ページ目を検索しています..."})
            try:
                driver.get(url)
                time.sleep(1)
            except TimeoutException:
                break

            last_url_checked = driver.current_url
            last_html_content = driver.page_source
            soup = BeautifulSoup(last_html_content, 'lxml')

            # ページネーションがスタックしていないか確認
            if page > 1:
                current_page_span = soup.select_one('ul.paging span.current')
                if current_page_span:
                    try:
                        current_page_num = int(current_page_span.get_text(strip=True))
                        if current_page_num < page:
                            # 要求したページより前のページが表示されている場合、検索の終端とみなす
                            break
                    except (ValueError, TypeError):
                        pass # ページ番号が解析できなくても処理は続行
                else:
                    # ページネーション自体が見つからない場合も終端とみなす
                    break

            # 1ページ目でのみ各種情報を取得
            if page == 1:
                page_title = soup.title.string.strip() if soup.title else "（タイトル不明）"
                yield sse_format({"status": "スクリーンショットを撮影しています..."})
                
                total_height = driver.execute_script("return document.body.parentNode.scrollHeight")
                driver.set_window_size(1200, total_height)
                time.sleep(0.5)

                timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                temp_png_path = os.path.join('screenshots', f"temp_special_{timestamp}.png")
                driver.save_screenshot(temp_png_path)

                jpeg_filename = f"screenshot_special_{timestamp}.jpg"
                jpeg_filepath = os.path.join('screenshots', jpeg_filename)
                
                try:
                    with Image.open(temp_png_path) as img:
                        if img.mode == 'RGBA':
                            img = img.convert('RGB')
                        img.save(jpeg_filepath, 'jpeg', quality=15)
                    screenshot_path = jpeg_filepath
                finally:
                    if os.path.exists(temp_png_path):
                        os.remove(temp_png_path)

                count_span = soup.select_one('span.numberOfResult')
                if count_span:
                    try:
                        total_count = int(count_span.get_text(strip=True))
                    except (ValueError, TypeError):
                        total_count = 0

            all_salons_on_page = soup.select('h3.slcHead a')
            if not all_salons_on_page:
                break

            for i, salon_tag in enumerate(all_salons_on_page):
                current_salon_name = salon_tag.get_text(strip=True)
                # リストにあるすべてのサロン名と照合
                for salon_name in salon_names:
                    if salon_name in current_salon_name:
                        rank = (page - 1) * 20 + (i + 1)
                        found_salons_map[salon_name].append({"rank": rank, "foundSalonName": current_salon_name})

    except Exception as e:
        yield sse_format({"error": f"特集ページ解析中にエラー: {e}"})
        return

    final_result = {
        "total_count": total_count,
        "screenshot_path": screenshot_path,
        "url": last_url_checked,
        "html": last_html_content,
        "page_title": page_title,
        "results_map": found_salons_map # サロンごとの結果を返す
    }
    
    yield sse_format({"final_result": final_result, "status": "完了"})