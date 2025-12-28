# AI Context: サロン業務システム

## アプリケーション概要
美容サロン（美容室、ネイル、アイラッシュ等）向けの業務支援Webアプリケーション。
マーケティング支援（掲載順位計測、ブログ一括投稿）と顧客管理（デモ段階）の機能を持つ。
**構成**:
- **Frontend**: HTML5, CSS3, Vanilla JS (一部Bootstrap 5)
- **Backend**: Python (Flask), Selenium, Playwright
- **Database**: JSONファイルによるローカルファイルベース管理

## 主要画面 / 機能

### 1. 順位チェッカー (`ranking_checker.html`)
- **機能**: Hot Pepper Beauty (HPB) 通常/特集、Google Maps (MEO)、Google検索 (SEO) の順位計測。
- **仕組み**:
  - フロントエンドから SSE (Server-Sent Events) でバックエンドのAPIを呼び出し、リアルタイムに進捗を表示。
  - バックエンドでは Selenium を使用してスクレイピング。
  - `APScheduler` によりバックグラウンドで定期自動計測が可能。
- **データ**: `auto_tasks.json` (タスク定義), `history_*.json` (計測履歴)。

### 2. サロンボード連携 (`salon_board.html`)
- **機能**: リクルート「サロンボード」の自動操作。
- **サブ機能**:
  - **ブログ一括投稿**: Playwright を使用してブラウザ操作を自動化。画像アップロード対応。
  - **店舗設定**: ID/PASSを `salon_board_settings.json` に保存。
- **特徴**: Bot検知回避のため、直列処理やウェイト制御が実装されている。

### 3. 顧客管理 (`customer_search.html`, `customer_detail.html`)
- **機能**: 顧客検索、詳細閲覧、施術履歴。
- **現状**: JS内のハードコードデータ (`customers` 配列) を使用したデモ実装。バックエンドAPIは未連携。

## データフロー & アーキテクチャ
1.  **API通信**:
    - 通常のREST API (`/api/*`) と、長時間処理用の SSE ストリーミング (`/check-ranking` 等) を併用。
    - 排他制御: `threading.Lock` により、計測タスクの同時実行を防止（429 Too Many Requests を返す）。
2.  **ファイル構成 (Backend)**:
    - `app.py`: Flaskアプリケーションエントリーポイント、API定義。
    - `config.py`: 環境変数、定数設定。
    - `task_runner.py`: 自動計測ロジックの統括。
    - `*_scraper.py`: 各プラットフォーム (HPB, MEO, SEO) 用の Selenium スクレイパー。
    - `salon_board_automator.py`: Playwright を用いたサロンボード操作ロジック。
    - `driver_manager.py`: Selenium WebDriver のライフサイクル管理。
    - `excel_generator.py`: Pandas を用いたレポート生成。
3.  **データ永続化**:
    - `*.json` ファイルにデータを保存（DBレス）。

## 重要な制約・前提
- **実行環境**: ローカルサーバー（またはGUIを持つサーバー）での実行が前提。Selenium/Playwright がブラウザを起動するため。
- **認証情報**: サロンボードのパスワード等は平文またはJSON内で管理されている（セキュリティ上の注意点）。
- **排他制御**: ブラウザリソースの競合を防ぐため、計測処理は一度に1つしか実行できないロック機構がある。

## 変更すると壊れやすい箇所
1.  **スクレイピングロジック**: HPBやGoogleのDOM構造変更に極めて脆弱。`*_scraper.py` のセレクタ修正が頻繁に必要になる可能性。
2.  **サロンボード自動化**: ログインフローやDOM IDが変わると `salon_board_automator.py` が停止する。
3.  **JSONデータ構造**: DBスキーマがないため、JSONの構造を変更する際は読み込み側の互換性に注意が必要。

---

## スクレイピング実装詳細 (DOM依存箇所)
**1. HPB通常検索 (`hpb_scraper.py`)**
- サロン名: `h3.slcHead a`
- 総件数: `span.numberOfResult`
- ページネーション: `ul.paging span.current`

**2. HPB特集検索 (`feature_page_scraper.py`)**
- サロン名: `h3.slcHead a` (通常検索と共通)
- ページネーション: `ul.paging span.current`

**3. Google Maps (MEO) (`meo_scraper.py`)**
- リストコンテナ: `div[role="feed"]`
- 結果アイテム: `div[role="feed"] > div > div[jsaction]`
- サロン名: `a[aria-label]`
- 広告除外: `span` タグに "広告" を含む場合はスキップ

**4. Google検索 (SEO) (`seo_scraper.py`)**
- 検索結果ブロック: `div.g`
- タイトル: `h3`

**5. サロンボード自動化 (`salon_board_automator.py`)**
- ログインID: `input[name="userId"]`
- パスワード: `input[name="password"]`
- ログインボタン: `a:has-text("ログイン")`
- ブログタイトル: `input[name="title"]`
- ブログ本文: `.nicEdit-main`
- カテゴリ選択: `select[name="blogCategoryCd"]`
- 画像アップロード: `#upload` (ボタン), `#sendFile` (input)
- 確認ボタン: `#confirm`