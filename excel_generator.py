import pandas as pd
import io
import config

def create_excel_report(group_key, group_data, active_search_type):
    """
    データを受け取り、グラフ付きのExcelレポートを生成してBytesIOオブジェクトを返す。
    """
    # 1. 全日付のリストを作成し、ソートする
    all_dates = sorted(list(set(entry['date'] for task in group_data for entry in task['log'])))

    # 2. ヘッダー行とデータ行を作成
    header_label = 'キーワード'
    if active_search_type == 'special':
        header_label = 'サロン名'
    elif active_search_type == 'google' or active_search_type == 'seo':
        header_label = 'キーワード'

    table_data = []
    for task_data in group_data:
        row_label = ''
        if active_search_type == 'normal':
            row_label = task_data['task'].get('serviceKeyword', '')
        elif active_search_type == 'special':
            row_label = task_data['task'].get('salonName', '')
        elif active_search_type == 'google' or active_search_type == 'seo':
            row_label = task_data['task'].get('keyword', '')

        def format_rank(rank):
            # ランクが数値でない場合（'圏外', 'エラー', '枠無'など）は101を返す
            if not isinstance(rank, (int, float)):
                # グラフの最下部に表示するためのダミーの大きな数値
                return config.EXCEL_OUT_OF_RANGE_RANK
            return rank

        data_map = {entry['date']: entry['rank'] for entry in task_data['log']}
        # ランクをフォーマットしてから行データを作成する
        row_data = [row_label] + [format_rank(data_map.get(date)) for date in all_dates]
        table_data.append(row_data)

    # 3. Pandas DataFrameを作成
    df = pd.DataFrame(table_data, columns=[header_label] + all_dates)

    # 4. メモリ上でExcelファイルを生成
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        sheet_name = '順位履歴'
        df.to_excel(writer, sheet_name=sheet_name, index=False)

        workbook  = writer.book
        worksheet = writer.sheets[sheet_name]

        # --- 書式設定の定義（5段階） ---
        green_format = workbook.add_format({'font_color': '#34c759'})  # 急上昇
        blue_format = workbook.add_format({'font_color': '#007aff'})    # 上昇
        orange_format = workbook.add_format({'font_color': '#ff9500'}) # 下降
        red_format = workbook.add_format({'font_color': '#ff3b30'})    # 急下降
        black_format = workbook.add_format({'font_color': '#000000'})  # 黒

        # データの範囲（2行目から最終行、3列目から最終列）に条件付き書式を適用
        # C2セルから適用を開始 (B列と比較するため)
        first_row = 1  # データの開始行 (0-indexed)
        last_row = len(df)
        first_col = 2  # 条件を適用する最初の列 (C列)
        last_col = len(df.columns) - 1

        # ルールの適用順が重要です。より厳しい条件（変動が大きい）から先に設定します。
        # 5ランク以上悪化した場合 (急下降) -> 赤
        worksheet.conditional_format(first_row, first_col, last_row, last_col,
                                     {'type': 'cell', 'criteria': '>', 'value': 'INDIRECT(ADDRESS(ROW(),COLUMN()-1))+4', 'format': red_format})
        # 5ランク以上改善した場合 (急上昇) -> 緑
        worksheet.conditional_format(first_row, first_col, last_row, last_col,
                                     {'type': 'cell', 'criteria': '<', 'value': 'INDIRECT(ADDRESS(ROW(),COLUMN()-1))-4', 'format': green_format})
        # 1〜4ランク悪化した場合 (下降) -> オレンジ
        worksheet.conditional_format(first_row, first_col, last_row, last_col,
                                     {'type': 'cell', 'criteria': '>', 'value': 'INDIRECT(ADDRESS(ROW(),COLUMN()-1))', 'format': orange_format})
        # 1〜4ランク改善した場合 (上昇) -> 青
        worksheet.conditional_format(first_row, first_col, last_row, last_col,
                                     {'type': 'cell', 'criteria': '<', 'value': 'INDIRECT(ADDRESS(ROW(),COLUMN()-1))', 'format': blue_format})
        # 順位が同じ場合 -> 黒
        worksheet.conditional_format(first_row, first_col, last_row, last_col,
                                     {'type': 'cell', 'criteria': '=', 'value': 'INDIRECT(ADDRESS(ROW(),COLUMN()-1))', 'format': black_format})

        # 5. グラフを作成
        chart = workbook.add_chart({'type': 'line'})

        # データセットをグラフに追加 (各行が1つの系列になる)
        for i in range(len(df)):
            chart.add_series({
                'name':       [sheet_name, i + 1, 0], # A列のラベル (キーワード/サロン名)
                'categories': [sheet_name, 0, 1, 0, len(all_dates)], # 1行目の日付
                'values':     [sheet_name, i + 1, 1, i + 1, len(all_dates)], # 各データ行の値
                'marker':     {'type': 'automatic'},
            })

        chart.set_title({'name': group_key})
        chart.set_x_axis({'name': '日付'})
        
        # Y軸の設定をカスタマイズ
        chart.set_y_axis({
            'name': '順位', 
            'reverse': True, # Y軸を反転させて上位を上にする
            'min': config.EXCEL_CHART_Y_AXIS_MIN,        # Y軸の最小値（グラフの上端）
            'max': config.EXCEL_CHART_Y_AXIS_MAX,      # Y軸の最大値（グラフの下端）
            # 101という数値を「圏外」という文字列で表示するための書式設定
            'num_format': f'[={config.EXCEL_OUT_OF_RANGE_RANK}]"圏外";[<{config.EXCEL_OUT_OF_RANGE_RANK}]0'
        })
        chart.set_legend({'position': 'top'})

        # グラフをシートに挿入
        worksheet.insert_chart('A' + str(len(df) + 3), chart, {'x_scale': 3, 'y_scale': 3})

    output.seek(0)
    return output