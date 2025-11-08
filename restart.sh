#!/bin/bash

echo "--- Stopping any existing server on port 5001 ---"
# lsof -t -i:5001 はポート5001を使用しているプロセスのPIDのみを出力します
# killコマンドにPIDを渡し、プロセスを終了させます
# 2>/dev/null || true は、プロセスが見つからずにkillが失敗してもスクリプトが止まらないようにするためのおまじないです
kill -9 $(lsof -t -i:5001) 2>/dev/null || true

echo "--- Starting the server ---"
# まずはフォアグラウンドで起動して、エラーが出ないか確認します。
# このコマンドを実行すると、ターミナルはこのままになります。
python app.py