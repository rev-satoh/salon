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

## 判定仕様: 取得失敗を「圏外」として履歴に残さない（2026-09-04）
- 背景＝2026/9/3の計測でHPB通常150件が約4分半で完了し123件が「圏外」・スクショ15件のみ、特集80件とMEO120件はスクショゼロ。一覧を取得できていないのに圏外として履歴に書かれていた。
- 原因＝`task_runner.py` が結果が空でも既定値 `'圏外'` を採用（通常80行付近・特集136行付近・MEO190行付近・Uber243行付近）。`hpb_scraper.py` の圏外判定自体（一覧を読めた上で自店なし）は正当。
- 対処＝スクレイパの `final_result` に `list_fetched`（一覧を実際に取得できたか）を持たせ、`task_runner.py` の共通ヘルパー `_is_recordable()` / `_record_result()` が4モード共通で判定する。
- **圏外を確定できる条件**＝`list_fetched: True` のときだけ。フラグが False／欠落（＝例外・タイムアウト・ページ未描画）は「未取得」とし、`update_history` を呼ばず履歴に一切書かない（欠測）。
- `list_fetched` の立て方＝HPB通常/特集は1ページ目でサロン行を1件以上読めた場合（通常は `span.numberOfResult` が描画された場合も可）。MEOは店舗を1件以上取得できた場合、および「枠無」確定時。Uber Eatsは検索結果ページを読み切った正常終了時のみ。
- `'エラー'`・`'枠無'`・`'要確認'`（Uberのブロック・レート制限）は従来どおり履歴に記録する。例外時に `'圏外'` を書く経路は無くなった。
- UI側は未記録＝欠測として既存処理で扱われる（`history.js`：該当日のエントリが無ければグラフは `y: NaN` で線が途切れ、表は `-` 表示）。UI変更は不要。

## 改修: 手動計測ストリームの自動再接続（離席・スリープ対策・2026-09-06）

### 事象
長時間の手動計測中にMacを放置（ディスプレイスリープ／省電力）するとブラウザ側の接続が切れ、
Console に `net::ERR_NETWORK_IO_SUSPENDED` ／ `ui.js 手動実行中にエラーが発生しました: TypeError: network error`
が出て計測が中断表示になった。

### 実測で確認したサーバ側の挙動（設計の前提）
- Flaskのストリーム生成器はクライアント切断時、**次のyieldで GeneratorExit が発生して停止する**。
  最小再現アプリ（Flask + threaded、curlを途中でkill）で確認：`GENERATOR_EXIT` → `finally` 到達 → ロック解放。
  よって **切断後に計測は継続しない**（＝「あとで結果を拾い直す」方式は不成立）。
- ただし `task_runner._record_result()` はタスク1件ごとに `save_json_file(history_*.json)` している。
  **完了済みタスクの結果は切断時点まで履歴に残る**。
- `measurement_lock` は generate_stream の `finally` で解放されるが、解放はSelenium処理が次のyieldへ
  到達した後＝切断直後の再接続は「実行中です」エラー（busy）になり得る。
- 取得失敗（未取得）は `_is_recordable()` で履歴に書かれない＝再開対象として正しく残る。

### 採った方式（未完了タスクのみ再開・二重実行なし）
- 新API `POST /api/measured-today`（app.py）：task_ids を受け、種別ごとの history ファイルを引いて
  **本日日付の記録があるタスク**を completed / remaining に分けて返す（`measuring` にロック状態も同梱）。
- `ui.js` の `processStream` を再接続ループに変更。
  - `runTaskStreamOnce()` … 1回ぶんの接続。結果を `completed / cancelled / disconnected / busy` で返す。
    `final_status` を受け取らずに閉じたストリームは **disconnected 扱い**（黙って途中終了するケースを拾う）。
  - 切断を検知したら指数バックオフ（2秒→最大30秒・上限8回）で待ち、`/api/measured-today` で
    未計測ぶんだけに絞って再実行する。サーバに届かない間はカウントを消費しつつ待機継続。
  - 進捗イベントを受け取れた回は再試行カウントをリセット（長時間計測で上限に当たらないため）。
  - **ユーザーの明示中断（中断ボタン＝AbortController）は再接続しない**（AbortError で即終了）。
  - 画面には結果エリア先頭に1行だけ `#streamReconnectNotice`（接続が切れたため再接続中…／復旧して再開）を表示。
- SSEのパースを**バッファ方式**（`\n\n` 境界で切り出し、端数を持ち越し）に修正。従来はチャンク跨ぎのイベントを取りこぼしていた。
- サーバのbusyエラーに `"busy": true` を付与し、フロントが「致命エラー」と「待てば直る」を区別できるようにした。

### 変更ファイル
- `app.py` … `/api/measured-today` 追加、run-tasks-manually の busy レスポンスに `busy` フラグ追加
- `ui.js` … `processStream` 再構成、`runTaskStreamOnce` / `fetchRemainingTaskIds` / 再接続通知を追加

### 検証状況
- `/api/measured-today` は稼働中サーバ（:5001）へ実POSTして応答確認済み（実タスクID3件が completed 判定）。
- 切断→再接続の実走（実計測を止めて繋ぎ直す）は未実施。次回の手動計測時に画面で確認する。

## 改修: Uber Eats「実質順位（小売店を除く飲食店内の順位）」の追加（2026-09-06）

### 背景
「グリークヨーグルト」等の検索でUberが単語分解し、ヨーグルト在庫を持つスーパー・ドラッグストア・コンビニが上位を占める。生順位だけでは、変動の原因が自店なのか小売の増減なのか判別できない。

### 実測（2026-09-06・スクリーンショット 260906_160554_ubereats_西大寺駅_グリークヨーグルト.jpg）
- 検索結果カードに載っている情報＝店名／評価（★・件数）／配達時間または距離／プロモバッジ（セール中・お店と同価格・お持ち帰り）のみ。
- **カテゴリ表記（食料品・コンビニ・ドラッグストア等）はカード上に無い。** 左サイドバーの「スーパー／コンビニ／お酒／小売」等はグローバルナビであり、結果カードの属性ではない。
- 「お店と同価格」バッジは小売固有ではない（ローソン・トライアルにもCOU等の飲食店にも付く）＝小売判定の根拠に使えない。
- 履歴 `history_ubereats.json` は `{date, rank, screenshot}` のみで店舗一覧を保存していない → **過去分の実質順位は再計算不可＝未計測扱い**。

### 実装した判定
`ubereats_scraper.py`
- `load_retail_filter()` … `ubereats_retail_filter.json` を毎回mtime確認で読み直す（社長が編集したら即反映・再起動不要）。読めない場合は小売判定なし＝実質順位＝生順位。
- `detect_retail_category(text)` … カード内テキストからカテゴリ語を検出。上記実測のとおり通常は空。将来Uberがカテゴリを出した場合に第一優先で効く。
- `classify_store_card(card)` … 優先順位＝①カテゴリ表記 ②店名キーワード。`excludeStoreNameKeywords` に当たる店は必ず飲食扱い（誤判定の救済）。
- `annotate_food_ranks(results)` … 各店に `isRetail` / `retailReason` / `foodRank`（小売はnull）を付与。
- `final_result` に `food_rank`（自店の実質順位・自店が小売判定なら "圏外"）、`retail_count`、`food_total_count` を追加。`rank`（生順位）は無改変。

`ubereats_retail_filter.json`（新規・設定の正本）
- `categoryKeywords` / `storeNameKeywords` / `excludeStoreNameKeywords`。ハードコードしない。

`task_runner.py` / `app.py`
- `update_history(..., food_rank=None)`。値がある時だけ log に `food_rank` を追加＝既存履歴と後方互換（過去分はキー無し＝未計測）。

`uberData.js` / `ui.js` / `manualChecker.js`
- `normalizeUberRank` の結果に `food` を持たせ、`uberStatusLabel` が「9位（飲食のみ 2位）」を返す。生順位のみが要る箇所は `uberRawStatusLabel`。
- 観測点タイル・ヒートマップは生順位を主表示、その下に「飲食のみ N位」を小さく併記。グラフ（順位推移）は生順位のまま。
- 手動計測の結果一覧は各店の行に「小売」／「飲食N」を表示。総数行に「（うち小売 N件）」。

### 検証（2026-09-06）
- 上記スクリーンショットの16店名で `annotate_food_ranks` を実行 → ローソン／スーパードラッグひまわり／トライアル／天満屋／ポプラの5件を小売判定、YOGI GREEK&ACAI 岡山店は生10位→飲食5位。
- `uberData.js` を Node で実行し、`food_rank` 有りの履歴で「9位（飲食のみ 2位）」、無い過去履歴で「17位」を確認。
- ブラウザ実計測（Chrome起動）は未実施＝スクレイパ経路での `food_rank` 記録は実走未確認。

### 追加: 順位推移グラフの「生順位／飲食のみ」切替（2026-09-07）
- `ui.js` `drawUberEatsPanel(model, keyword, rankMode)` に第3引数を追加。**既定は `'raw'`（生順位）＝従来の見た目・挙動を維持**。
- 切替UIはキーワード切替ボタンと同一様式のセグメント（`uberRankModeButton`）をグラフ見出し右・キーワード列の上に配置。語彙は「生順位」「飲食のみ」で統一（「実質順位」等は画面に出さない）。
- `uberSeriesForMode()` … `'food'` 時は各日の `food` を返し、値の無い日は `null`＝線を引かない（`uberPolyline` の欠測処理をそのまま利用）。**過去分の遡及計算はしない方針のため、データが始まる日から描画される。**
- `'food'` で全観測点・全日に値が無い場合はSVGを描かず「飲食のみの順位は、まだ計測データがありません／次回の計測分から表示されます」を同サイズの枠内に表示。
- タイル・ヒートマップ・検索結果一覧は無改変（生順位＋併記のまま）。

#### 検証（2026-09-07）
- Nodeで `buildUberModel` に合成履歴（`food_rank` が最終日のみ）を通し、生順位 `[12,10,9]` / 飲食のみ `[null,null,2]` を確認＝先頭2日は線が引かれない。
- 実 `history_ubereats.json`（`food_rank` 0件）でモデルを組み、「飲食のみ」系列が全件nullになること＝空メッセージ表示パスに入ることを確認。
- ブラウザでの実画面確認は未実施。

### 残課題
- 小売判定は店名キーワード依存。新しいチェーンが上位に来たら `ubereats_retail_filter.json` に追記する運用。

## 改修: ChromeDriverをSelenium Manager自動解決へ（2026-09-19）

### 事象
`session not created: This version of ChromeDriver only supports Chrome version 151 / Current browser version is 153.0.8010.48` で計測が起動不能。

### 原因（実コードで特定）
- `config.py` の `CHROMEDRIVER_PATH = "/opt/homebrew/bin/chromedriver"`（固定パス）を `driver_manager.py` の `Service(...)` が使用（`get_webdriver` / `get_attached_chrome` の2か所）。
- 実体は Homebrew cask `chromedriver` 151.0.7922.77。Chrome は自動更新で 153.0.8010.48 になり、cask は追従しない＝Chrome更新のたびに再発する構造だった。
- 🔴 追加の実測事実：`Service` を外して Selenium Manager に任せても、**PATH上に古い chromedriver があると Selenium Manager はそれを優先採用し、警告を出しつつ同じエラーで落ちる**。PATH側の掃除まで行わないと自動解決にならない。

### 採った方式（バージョン直書きを増やさない汎用の仕組み）
1. `brew uninstall --cask chromedriver` で PATH から固定バイナリを排除（PATHに chromedriver 無しを維持する＝これが前提条件）。
2. `config.py` を `CHROMEDRIVER_PATH = os.environ.get("SALON_CHROMEDRIVER_PATH") or None` に変更。`driver_manager.py` は元から `None` なら `service=None`＝**selenium同梱のSelenium Managerがブラウザ実バージョンを検出して一致ドライバを取得・`~/.cache/selenium`へキャッシュ**する。
3. 以後 Chrome が自動更新されてもドライバは自動追従。バージョン番号はコード・設定のどこにも書かない。`driver_manager.py` は無改修。

採用理由＝selenium 4.35 同梱で追加依存ゼロ（webdriver-manager の新規導入不要）、解決ロジックが1か所（Selenium Manager）に閉じる、Chrome更新への追従が自動。

### 他ツールへの波及（調査済み・再調査不要）
- `~/anaconda` 配下で chromedriver を参照していた稼働コードは **`salon/config.py` のみ**。`~/anaconda/keisoku`（selenium 4.41）は元から固定パスを持たずSelenium Manager任せ＝同じ仕組みで整合済み。`_archive/2026-07/mercari-price-update*/boot.py` はアーカイブ（対象外）。
- `.company` 配下に selenium / chromedriver を使うツールは無し（サロンボード系はPlaywright＝本件の影響なし）。

### ログイン・プロファイル再利用への影響
なし。`get_attached_chrome`（`--remote-debugging-port` で通常Chromeへアタッチ）と `user-data-dir` によるプロファイル維持は無改修。変えたのはドライバの調達方法だけで、セッション再利用の設計は保持。

### 検証（2026-09-19・実走）
- `driver_manager.get_webdriver()` 起動 → browserVersion 153.0.8010.48 / chromedriverVersion **153.0.8010.52**、stderr 0行。
- `hpb_scraper.check_hotpepper_ranking(keyword="まつげパーマ", salonName="ケイトステージラッシュ", area=FC/SF)` を実走 → total_count 105・**rank 1** を取得（計測が最後まで通ることを確認）。

## 改修: Uber Eatsの入力欄が保存済みタスクを反映しない（2026-09-19）

### 事象
Uber Eatsモードの「検索キーワード」欄が常に「グリークヨーグルト ヨーグルト アサイー」の3語で、
「アサイーボウル」を足しても再読み込みで消える＝保存されていないように見える。

### 原因（実データ・実コードで特定）
- 保存自体は正常だった。`auto_tasks.json` には ubereats タスクが40件（4キーワード×10住所）あり、
  `アサイーボウル` も `history_ubereats.json` に 2026/09/10〜09/14 の順位（例: 店と同じ住所 8位／飲食のみ1位）まで入っていた。
- 真因は画面側。`ranking_checker.html` の入力欄に初期値がHTML直書きされていた
  （`uberKeywordInput` に `value="グリークヨーグルト ヨーグルト アサイー"`、住所textareaにも同内容の本文、店舗名に `value="YOGI"`）。
  Uber Eatsモードの入力欄だけ保存済みデータから復元する処理が無く、再読み込みのたびに直書きの3語へ戻っていた。
- 重複判定・文字数/件数上限・部分一致による弾きは**存在しない**（`handleAddTask` のubereats分岐はタスクIDの完全一致だけを見る）。「アサイー」を含むことによる弾きも無い＝実測で否定。

### 対処
- `ranking_checker.html`: Uber Eats入力欄3つの直書き初期値を削除（プレースホルダのみ残す）。
- `ui.js`: `fillUberFormFromTasks(autoTasks)` を追加し、`updateUIForSearchType` の ubereats 分岐で呼ぶ。
  保存済み ubereats タスクから 店舗名／住所セット（ラベル: 住所・重複排除）／キーワード（重複排除・スペース区切り）を復元する。
  画面の初期表示は常に保存済みデータ（auto_tasks.json）を正とし、HTMLに業務データを直書きしない。

### 検証（2026-09-19・実走 http://127.0.0.1:5001/ranking_checker.html）
- Uber Eatsタブを開く → キーワード欄「グリークヨーグルト ヨーグルト アサイーボウル アサイー」・住所10行・店舗名YOGI を復元（修正前は3語固定）。
- 検証用キーワードを1語足して「自動計測に追加」→ `auto_tasks.json` の ubereats が40→50件、ページ再読み込み後も欄に残ることを確認。
- 検証後、追加分はAPI経由で元の40件へ戻し（再読み込みで4キーワードに復帰・履歴グラフにアサイーボウルの線あり）。

## 恒久策: 本番(Render)相当のimportスモークチェック（2026-09-21）

### 背景
`app.py` が Mac固有パス（company リポの `_common`）を `sys.path` に足して `live_reload` を
トップレベルimportしていたため、Renderで `ModuleNotFoundError: live_reload` となり起動失敗。
同種（requirements.txt に無い外部パッケージ・ローカル専用モジュール）を1件ずつ直しては落ちる、
を止めるためのチェックを追加した。

### 使い方
- `python3 scripts/check_prod_import.py` … requirements.txt（＋その依存）のパッケージだけを見せ、
  Mac固有パスを無効化（`LIVE_RELOAD_COMMON_DIR` を実在しないパスへ）した状態で `import app` を検証する。
  push前に必ず実行し、`OK:` が出ることを確認する（NG時は落ちたモジュール名が出る）。

### 実装側の約束
- `live_reload` は「共通部品ディレクトリが実在し、importできる時だけ」有効化する（app.py 57〜79行）。
  Renderでは自動リロード無しで通常起動する。ローカルでは従来どおり `before_request` フックが入る。
- Render に無いものをトップレベルでimportしない（playwright 等は使う直前に遅延import）。

### 実測（2026-09-21）
- `scripts/check_prod_import.py` → `OK: 本番相当（requirements.txt のみ / Mac固有パス無効）で import app 成功`
- 検知力の確認：app.py に一時的に `import playwright` を足すと
  `NG ... 'playwright' は requirements.txt に無く、本番(Render)には存在しません` で exit 1。
- 全トップレベルimportの棚卸し結果＝app.py と自作モジュール（feature_page_scraper / utils / hpb_scraper /
  meo_scraper / ubereats_scraper / task_runner / driver_manager / excel_generator / config）を再帰確認し、
  外部依存は flask, flask_cors, requests, bs4, selenium, PIL, apscheduler, dotenv, pandas のみ＝全て
  requirements.txt に存在。Render非対応は `live_reload` の1件のみだった。

## 廃止: Renderの公開サービス（2026-09-21・社長決定で削除）

- **経緯**＝Render Web Service `salon`（srv-d284h4u3jp1c73fv4560／URL `https://kuchikomi-api.onrender.com`・無料枠）は、**2025/9/30のコミット `78485a5`「MEO順位計測のUIを追加、不要な口コミ機能を削除」以前に口コミ作成機能（`review_generator.html`/`.js`）を公開していた時の名残**。サービス名 `kuchikomi-api` はその当時のもの。
- **削除の理由**＝現行の順位チェッカーはMacローカル（`app.py` ポート5001・手動実行）で使っており、Render側は使っていなかった。実測＝Render側 `/api/auto-history` の最新が 2026/9/3 で停止、Mac側は 2026/9/20 まで更新。さらに 2026/9/19 以降のデプロイが連続失敗し、失敗メールだけが届く状態だった。
- **削除の実施**＝2026/9/21、Renderダッシュボードから Web Service を削除（社長指示）。以後この順位チェッカーに本番・公開環境は存在しない＝**Renderを前提にした案内・デプロイ手順を書かない**。
- **残した対策**＝`scripts/check_prod_import.py`（Mac固有パス・未導入パッケージのトップレベルimport検知）は削除せず残す。ローカル環境でも「Mac固有パスへの依存を増やさない」チェックとして有効なため。

