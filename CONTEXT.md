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
    - **タスク実行**: 計測ロジックはジェネレータ関数として実装され、SSEで進捗を逐次返却する設計。バックグラウンド実行時もこのジェネレータをループで回して処理を進める必要がある。
    - **計測の最適化 (早期終了ロジック)**:
        - 各計測モード（HPB通常、HPB特集、MEO）において、対象のサロンが発見された時点で、次ページ以降の遷移や解析を即座に中断（break）するように実装されている。
        - これにより、特に1ページ目に自店がある場合の計測時間を大幅に短縮し、サーバー負荷とサイト側からのブロックリスクを最小限に抑えている。
2.  **ファイル構成 (Backend)**:
    - `app.py`: Flaskアプリケーションエントリーポイント、API定義。
    - `config.py`: バックエンドの環境変数、定数設定。
    - `task_runner.py`: 自動計測ロジックの統括。
    - `*_scraper.py`: 各プラットフォーム (HPB, MEO, SEO) 用の Selenium スクレイパー。
    - `salon_board_automator.py`: Playwright を用いたサロンボード操作ロジック。
    - `driver_manager.py`: Selenium WebDriver のライフサイクル管理。
    - `excel_generator.py`: Pandas を用いたレポート生成。
3.  **ファイル構成 (Frontend)**:
    - `ranking_checker.js`: 順位チェッカー機能のエントリーポイント。
    - `ui.js`: UIイベントリスナー、DOM操作、タスク追加/描画ロジック。
    - `history.js`: 履歴データの取得、グラフと表の描画ロジック。
    - `manualChecker.js`: 手動計測の実行ロジック。
    - `api.js`: バックエンドAPIとの通信を抽象化する関数群。
    - `dom.js`: DOM要素の参照をまとめたモジュール。
    - `config.js`: フロントエンドの静的設定（エリアコード、グラフ色など）。
    - `common.js`: 全ページ共通の処理（ヘッダー/フッター読み込みなど）。
3.  **データ永続化**:
    - `*.json` ファイルにデータを保存（DBレス）。

## 重要な制約・前提
- **実行環境**: ローカルサーバー（またはGUIを持つサーバー）での実行が前提。Selenium/Playwright がブラウザを起動するため。
- **認証情報**: サロンボードのパスワード等は平文またはJSON内で管理されている（セキュリティ上の注意点）。
- **排他制御**: ブラウザリソースの競合を防ぐため、計測処理は一度に1つしか実行できないロック機構がある。
- **ヘッドレスモード**: `config.py` の `HEADLESS_MODE` で制御。デバッグ時は `False` でブラウザを表示可能。

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

## 運用メモ: HPB広島エリア改定（2026-08-07）
- ケイトステージラッシュの通常検索タスク16件は、旧「八丁堀・幟町・銀山・白島」（smallAreaCd `X165`）から新「本通・八丁堀・袋町・紙屋町」（smallAreaCd `X164`）へ統合移行済み。
- 新URLは `https://beauty.hotpepper.jp/nail/svcSF/macFA/salon/sacX164/`。`auto_tasks.json` と `history_normal.json` のID/areaName/areaCodesを新エリア名へリネームし、`config.js` のエリア候補も新名称へ差し替えた。
- 旧エリア廃止により2026/08/07の旧タスク計測は一度すべて圏外になったが、移行後に同日分を再計測し、グラフ用履歴は8/7から新エリア順位で表示される状態に更新済み。

## 運用メモ: 履歴グラフの過去データ間引き（2026-08-07）
- 2025/09/01〜2026/04/30の計測ログが密集してグラフが読みにくくなっていたため、通常・特集・MEO履歴を各系列・各月ごとに「月初寄り、15日前後、月末寄り」の最大3点へ間引いた。
- 削除量は `history_normal.json` 10,443ログ、`history_special.json` 4,963ログ、`history_meo.json` 7,970ログ。SEO履歴は各系列3件程度で密集していないため未変更。
- 間引き前バックアップは `*.backup_thin_202509_202604_20260807214002` として同階層に保存済み。2026/05以降および2026/08/07の再計測結果は削除対象外。

## 不具合修正: Uber Eats履歴が1グループに潰れる（2026-08-29）
- 原因＝`history.js` `fetchAndDisplayAutoHistory` のログ統合キーが `areaName/searchLocation/featurePageUrl` と `salonName` 前提で、これらを持たないUber Eatsタスクが `ubereats-undefined-undefined-キーワード` に潰れ、さらに日付重複排除で同日40件が1件に削られていた。
- 対処＝`type === 'ubereats'` のときだけキーを `ubereats-{address}-{storeName}-{keyword}` に切り替え（他タイプのキーは無変更）。データファイルは未変更。
- 実測＝ubereats: 統合後 5件 → 60件、グラフのグループ 3 → 17、2026/08/29のログ 4 → 40（生データ40と一致）。normal/special/meo は統合後件数・グループ数・8/29ログ数すべて修正前後で同値。

## 改修: Uber Eats画面下部のデザインモックを実データ描画へ置換（2026-08-29）
- 従来＝`ui.js` の `renderUberEatsMock()` が固定値 `UBER_MOCK_DATES/POINTS/SERIES` でダミーの観測点タイル・サマリー指標・順位推移SVG・ヒートマップを描画していた（「最終計測 8/8 09:00」「10住所 × 3キーワード」等も固定文字列）。
- 対処＝新規 `uberData.js`（`buildUberModel`／`uberSeries`／`uberLatest`／`uberSummary`／`normalizeUberRank`）を追加し、`ui.js` の呼び出しを `renderUberEatsPanel()` へ変更。データは `/api/auto-history` から取得し `task.type === 'ubereats'` で絞る。観測点・キーワード・X軸日付・最終計測日・タスク件数はすべて実データから動的生成。モード説明ヘルプの「現在はデザイン確認用のモック表示です。」の一文も削除。
- rank文字列 "要確認" / "モック" は「未計測」扱い（グラフの線を引かない）とし、"圏外" とは区別する方針を採用。
- 実測＝置換時点で観測住所14件・キーワード5語・観測タスク60件・X軸日付は8/9と8/29の2点・最新計測日2026/08/29。

## データ整理: Uber Eats履歴からキーワード「グリーク」を削除（2026-08-29）
- 対象＝`history_ubereats.json` の `task.keyword === "グリーク"` 完全一致1件（id `[ubereats]-YOGI-店と同じ住所-YOGI 岡山-グリーク`、log 2026/08/09・順位7）。「グリークヨーグルト」は対象外。
- 実測＝総数 60 → 59。keyword別 グリーク1→0／グリークヨーグルト16→16／ヨーグルト16→16／アサイー17→17／アサイーボウル10→10。
- バックアップ＝`history_ubereats.json.backup_delete_keyword_gurique_20260829`。

## データ整理: Uber Eats履歴から未計測の観測点4つを削除（2026-08-29）
- 対象＝`task.addressLabel` 完全一致「北側／南側／東側／西側」の12件。全ログが `rank: "モック"` のみで実計測ゼロだったため削除。
- 部分一致の「中区北側」「中区東側」「北区南側」「南区北側」「南区南側」は実データありのため残す（今後の作業でも完全一致でのみ判定し、誤削除しないこと）。
- 実測＝総数 59 → 47。残る観測点は10（店と同じ住所5・中心部A7・中心部B7・北区近隣4・北区南側4・中区北側4・中区東側4・南区北側4・南区南側4・東区代表4）。
- バックアップ＝`history_ubereats.json.backup_delete_unmeasured_directions_20260829`。

### 注意事項
- Uber Eatsタスクは `auto_tasks.json` に1件も登録されていない（登録は normal138／google120／special80／seo12 のみ）。Uber Eatsの計測は自動計測タスク台帳の外で実行されており、台帳側から件数・観測点を把握できない。

## 調査結果: ロケットナウは順位計測不可（アプリ専用・2026-08-29）
- 結論＝ロケットナウの掲載順位計測は実装しない。社長判断で見送り（2026-08-29）。本日ブラウザで実測済み。
- 理由＝消費者向けのWeb注文サイトが存在しない。公式サイト `https://www.rocketnow.co.jp/` はWordPressの紹介サイトのみで、sitemapは `post-sitemap.xml` と `page-sitemap.xml` の2本だけ＝店舗ページも検索ページも無い。
- 公式FAQ `/customer/` の注文手順が「ロケットナウアプリをダウンロードした後、アプリを開き会員登録／ログイン → お届け先の住所を設定」＝住所指定も検索もアプリ内のみ。
- サイト内CTAの遷移先は App Store（id6739188587）と Google Play のみ。
- 注文用サブドメイン候補 order / m / web / app / shop はすべてNXDOMAIN。存在するのは `store.rocketnow.co.jp`（加盟店管理画面）のみで、注文明細APIはあるが検索順位の概念が無い。
- 公式サイトはcurl直アクセスをAkamaiが403でブロック（ブラウザでは閲覧可）＝スクレイピング前提でも壁がある。
- Uber Eats版から流用できるのは `task_runner.py` のモード分岐・履歴JSON・スクショ保存・UIタブの器のみ。URL生成（座標をbase64 `pl` に載せる方式）・配達先住所のUI操作・店舗カードのDOM解析・レート制限判定はすべてUber EatsのWeb DOM前提で、ロケットナウには対応物が存在しない＝中核は全て作り直しになる。
- 未調査で残っている点＝`store.rocketnow.co.jp` の加盟店管理画面内に、掲載順位・露出に関する指標があるかは未確認。将来やるならここが最初の確認先。
- 実装する唯一の経路＝Androidエミュレータ＋アプリ通信の解析（規約リスクあり）。着手するなら改めて社長判断が要る。
