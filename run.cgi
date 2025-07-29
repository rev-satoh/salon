#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys

# プロジェクトフォルダへのパスを通す
project_path = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_path)

# app.py からFlaskアプリのインスタンスをインポート
from app import app

# CGIハンドラを使ってアプリを実行
from wsgiref.handlers import CGIHandler
CGIHandler().run(app)