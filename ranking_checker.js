// スクロールボタン用の関数
function scrollbtn(scpos) {
    window.scrollTo({ top: scpos, left: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
    const largeAreaSelect = document.getElementById('largeAreaSelect');
    const middleAreaGroup = document.getElementById('middleAreaGroup');
    const middleAreaSelect = document.getElementById('middleAreaSelect');
    const smallAreaGroup = document.getElementById('smallAreaGroup');
    const smallAreaSelect = document.getElementById('smallAreaSelect');
    const keywordInput = document.getElementById('keywordInput');
    const salonNameInput = document.getElementById('salonNameInput');
    const checkRankButton = document.getElementById('checkRankButton');
    const resultArea = document.getElementById('resultArea');
    const salonNameFormGroup = document.querySelector('label[for="salonNameInput"]').parentElement;
    const addAutoTaskButton = document.getElementById('addAutoTaskButton');
    const autoTaskList = document.getElementById('autoTaskList');
    const autoHistoryContainer = document.getElementById('autoHistoryContainer');
    const noAutoHistoryMessage = document.getElementById('noAutoHistoryMessage');
    const manualTriggerButton = document.getElementById('manualTriggerButton');
    const selectAllContainer = document.getElementById('selectAllContainer');
    const selectAllCheckbox = document.getElementById('selectAllTasks');
    const scheduleHourSelect = document.getElementById('scheduleHourSelect');
    const saveScheduleButton = document.getElementById('saveScheduleButton');
    const scheduleStatus = document.getElementById('scheduleStatus');
    const autoTaskListToggle = document.getElementById('autoTaskListToggle');
    const autoTaskListContent = document.getElementById('autoTaskListContent');
    const taskListToggleIcon = document.getElementById('taskListToggleIcon');
    const normalSearchInputs = document.getElementById('normalSearchInputs');
    const specialSearchInputs = document.getElementById('specialSearchInputs');
    const googleMapSearchInputs = document.getElementById('googleMapSearchInputs');
    const searchTypeToggle = document.getElementById('searchTypeToggle');
    const seoSearchInputs = document.getElementById('seoSearchInputs'); // SEO入力フォーム
    const meoCopySection = document.getElementById('meoTaskCopySection');
    const hpbNormalTaskCopySection = document.getElementById('hpbNormalTaskCopySection');
    const hpbSpecialTaskCopySection = document.getElementById('hpbSpecialTaskCopySection');
    const printButton = document.getElementById('printButton');
    const toggleAllTablesButton = document.getElementById('toggleAllTablesButton');
    const modeHelpButton = document.getElementById('modeHelpButton');
    const scrollToManualCheckButton = document.getElementById('scrollToManualCheckButton');

    const seoTaskCopySection = document.getElementById('seoTaskCopySection'); // SEOコピーセクション

    // --- 状態管理オブジェクト ---
    const state = {
        isMeasuring: false
    };
    // --- 自動計測タスクを保持するグローバル変数 ---
    let autoTasks = [];





    // グラフで使用する色のリスト
    const CHART_COLORS = [
        '#007aff', '#34c759', '#ff9500', '#ff3b30', '#5856d6', 
        '#ff2d55', '#af52de', '#5ac8fa', '#ffcc00', '#8e8e93',
        '#4cd964', '#ff453a', '#bf5af2', '#a2845e', '#00a0a0',
        '#e58a00', '#0059b3', '#d9006c', '#63a95e', '#a6a6a6'
    ];
    // HPBの内部コードを含むエリアデータ構造に変更
    const areas = {
        "北海道": {
            code: "SD", // サービスエリアコード
            middleAreas: { "札幌": { code: "DA", smallAreas: {} }, "旭川": { code: "DB", smallAreas: {} }, "函館": { code: "DD", smallAreas: {} }, "その他北海道": { code: "DC", smallAreas: {} }}
        },
        "東北": {
            code: "SE",
            middleAreas: {
                "仙台・宮城": { code: "EA", smallAreas: {} }, "郡山": { code: "EH", smallAreas: {} }, "いわき・福島・その他福島県": { code: "EG", smallAreas: {} },
                "岩手・盛岡": { code: "EC", smallAreas: {} }, "青森・八戸": { code: "ED", smallAreas: {} }, "山形": { code: "EE", smallAreas: {} }, "秋田": { code: "EF", smallAreas: {} }
            }
        },
        "北信越": {
            code: "SH",
            middleAreas: {
                "新潟": { code: "HA", smallAreas: {} }, "長岡": { code: "HB", smallAreas: {} }, "石川・金沢": { code: "HC", smallAreas: {} },
                "長野": { code: "HD", smallAreas: {} }, "松本": { code: "HE", smallAreas: {} }, "その他長野県": { code: "HH", smallAreas: {} },
                "富山": { code: "HF", smallAreas: {} }, "福井": { code: "HG", smallAreas: {} }
            }
        },
        "関東": {
            code: "SA",
            middleAreas: {
                "新宿・高田馬場・代々木": { code: "AA", smallAreas: {} }, "池袋・目白": {
                    code: "AB",
                    smallAreas: {
                        "東口・サンシャイン方面": { code: "X006" },
                        "西口・北口・目白": { code: "X007" }
                    }
                }, "恵比寿・代官山・中目黒・広尾・麻布・六本木": { code: "AC", smallAreas: {} },
                "渋谷・青山・表参道・原宿": { code: "AD", smallAreas: {} }, "自由が丘・学芸大学・武蔵小杉・菊名": { code: "AE", smallAreas: {} }, "三軒茶屋・二子玉川・溝の口・青葉台": { code: "JL", smallAreas: {} },
                "銀座・有楽町・新橋・丸の内・日本橋": { code: "AF", smallAreas: {} }, "上野・神田・北千住・亀有・青砥・町屋": { code: "AG", smallAreas: {} }, "品川・目黒・五反田・田町": { code: "AH", smallAreas: {} },
                "両国・錦糸町・小岩・森下・瑞江": { code: "JP", smallAreas: {} }, "門前仲町・勝どき・月島・豊洲": { code: "JQ", smallAreas: {} }, "中野・高円寺・阿佐ヶ谷": { code: "AI", smallAreas: {} },
                "吉祥寺・荻窪・西荻窪・三鷹": { code: "AJ", smallAreas: {} }, "八王子・立川・国立・多摩・日野・福生・秋川": { code: "AK", smallAreas: {} }, "山梨": { code: "JN", smallAreas: {} },
                "町田・相模大野・海老名・本厚木・橋本": { code: "AL", smallAreas: {} }, "大宮・浦和・川口・岩槻": { code: "AM", smallAreas: {} }, "千葉・稲毛・幕張・鎌取・都賀": { code: "AN", smallAreas: {} },
                "船橋・津田沼・本八幡・浦安・市川": { code: "AO", smallAreas: {} }, "柏・松戸・我孫子": { code: "AP", smallAreas: {} }, "横浜・関内・元町・上大岡・白楽": { code: "AQ", smallAreas: {} },
                "センター南・二俣川・戸塚・杉田・金沢文庫": { code: "JM", smallAreas: {} }, "大井町・大森・蒲田・川崎・鶴見": { code: "AR", smallAreas: {} }, "湘南・鎌倉・逗子": { code: "AS", smallAreas: {} },
                "宇都宮・栃木": { code: "AT", smallAreas: {} }, "水戸・ひたちなか・日立・茨城": { code: "JO", smallAreas: {} }, "横須賀・小田原": { code: "AU", smallAreas: {} },
                "御茶ノ水・四ツ谷・千駄木・茗荷谷": { code: "AV", smallAreas: {} }, "鷺ノ宮・田無・東村山・拝島": { code: "AW", smallAreas: {} }, "市原・木更津・茂原・勝浦・東金・銚子": { code: "AX", smallAreas: {} },
                "取手・土浦・つくば・鹿嶋": { code: "AY", smallAreas: {} }, "上尾・熊谷・本庄": { code: "AZ", smallAreas: {} }, "東大宮・古河・小山": { code: "JA", smallAreas: {} },
                "下北沢・成城学園・向ヶ丘遊園・新百合ヶ丘": { code: "JB", smallAreas: {} }, "赤羽・板橋・王子・巣鴨": { code: "JC", smallAreas: {} }, "西新井・草加・越谷・春日部・久喜": { code: "JD", smallAreas: {} },
                "大山・成増・志木・川越・東松山": { code: "JE", smallAreas: {} }, "八千代・佐倉・鎌ヶ谷・成田": { code: "JF", smallAreas: {} }, "明大前・千歳烏山・調布・府中": { code: "JG", smallAreas: {} },
                "流山・三郷・野田": { code: "JH", smallAreas: {} }, "練馬・ひばりヶ丘・所沢・飯能・狭山": { code: "JI", smallAreas: {} }, "前橋・高崎・伊勢崎・太田・群馬": { code: "JK", smallAreas: {} }
            }
        },
        "東海": {
            code: "SC",
            middleAreas: {
                "名駅・栄・金山・本山": { code: "CA", smallAreas: {} }, "一宮・犬山・江南・小牧・小田井": { code: "CE", smallAreas: {} }, "日進・豊田・刈谷・岡崎・安城・豊橋": { code: "CI", smallAreas: {} },
                "岐阜": {
                    code: "CB",
                    smallAreas: { "岐阜駅・柳ヶ瀬周辺": { code: "X113" } }
                }, "静岡・藤枝・焼津・島田": { code: "CC", smallAreas: {} }, "浜松・磐田・掛川・袋井": { code: "CD", smallAreas: {} },
                "桑名・四日市・津・鈴鹿・伊勢": { code: "CH", smallAreas: {} }
            }
        },
        "関西": {
            code: "SB",
            middleAreas: {
                "梅田・京橋・福島・本町": {
                    code: "BA",
                    smallAreas: {
                        "梅田・西梅田": { code: "X074" },
                        "芝田・茶屋町・中崎町": { code: "X506" },
                        "福島・野田": { code: "X507" },
                        "天神橋筋": { code: "X508" },
                        "京橋・都島": { code: "X075" },
                        "北浜・肥後橋・本町": { code: "X509" }
                    }
                }, "心斎橋・難波・天王寺": { code: "BB", smallAreas: {} }, "茨木・高槻": { code: "BC", smallAreas: {} },
                "堺・南大阪": { code: "BD", smallAreas: {} }, "京都": { code: "BE", smallAreas: {} }, "舞鶴・福知山・京丹後": { code: "BT", smallAreas: {} },
                "三宮・元町・神戸・兵庫・灘・東灘": { code: "BF", smallAreas: {} }, "姫路・加古川": { code: "BG", smallAreas: {} }, "高石・府中・岸和田・泉佐野・和歌山": { code: "BH", smallAreas: {} },
                "川西・宝塚・三田・豊岡": { code: "BI", smallAreas: {} }, "滋賀": { code: "BJ", smallAreas: {} }, "鴫野・住道・四条畷・緑橋・石切・布施・花園": { code: "BK", smallAreas: {} },
                "昭和町・大正・住吉・住之江": { code: "BL", smallAreas: {} }, "西宮・伊丹・芦屋・尼崎": { code: "BM", smallAreas: {} }, "長岡京・伏見・山科・京田辺・木津・亀岡": { code: "BN", smallAreas: {} },
                "奈良": { code: "BO", smallAreas: {} }, "平野・八尾・松原・古市・藤井寺・富田林": { code: "BP", smallAreas: {} }, "門真・枚方・寝屋川・関目・守口・蒲生・鶴見": { code: "BQ", smallAreas: {} },
                "三木・北区・西区・長田・明石・垂水": { code: "BR", smallAreas: {} }, "江坂・緑地公園・千里中央・豊中・池田・箕面": { code: "BS", smallAreas: {} }
            }
        },
        "中国": {
            code: "SF",
            middleAreas: {
                "広島": {
                    code: "FA",
                    smallAreas: {
                        "袋町・中町・小町・富士見": { code: "X161" }, "立町・本通・並木通り・三川町": { code: "X164" }, "紙屋町・大手町": { code: "X163" }, "八丁堀・幟町・銀山・白島": { code: "X165" }, "段原・皆実・宇品・千田": { code: "X384" }, "広島駅周辺・東区・安芸区・安芸郡": { code: "X166" }, "横川・十日市・天満・舟入": { code: "X167" }, "佐伯区・西区": { code: "X385" }, "廿日市": { code: "X450" }, "安佐南区・安佐北区": { code: "X386" }, "呉": { code: "X335" }, "東広島": { code: "X451" }
                    }
                }, "福山・尾道": {
                    code: "FC",
                    smallAreas: {
                        "福山駅前・三吉周辺": { code: "X336" }, "福山その他エリア": { code: "X337" }, "尾道周辺": { code: "X461" }, "三原周辺": { code: "X474" }
                    }
                }, "岡山・倉敷": { code: "FB", smallAreas: {} }, "山口": { code: "FG", smallAreas: {} }, "鳥取": { code: "FD", smallAreas: {} }, "島根": { code: "FE", smallAreas: {} }
            }
        },
        "四国": {
            code: "SI",
            middleAreas: { "松山・愛媛": { code: "IA", smallAreas: {} }, "高松・香川": { code: "IB", smallAreas: {} }, "高知": { code: "IC", smallAreas: {} }, "徳島": { code: "ID", smallAreas: {} }}
        },
        "九州・沖縄": {
            code: "SG",
            middleAreas: {
                "福岡": {
                    code: "GA",
                    smallAreas: {
                        "天神・大名": { "code": "X168" },
                        "今泉・警固・薬院": { "code": "X169" },
                        "赤坂・大濠・西新周辺": { "code": "X174" },
                        "博多駅周辺": { "code": "X170" },
                        "中洲・住吉・春吉": { "code": "X171" },
                        "平尾・高宮・大橋・井尻": { "code": "X172" },
                        "春日・大野城・筑紫野周辺": { "code": "X348" },
                        "姪浜周辺": { "code": "X349" },
                        "七隈沿線": { "code": "X175" },
                        "箱崎・千早・香椎周辺": { "code": "X350" },
                        "糟屋・新宮・古賀・福津": { "code": "X466" },
                        "大牟田・柳川": { "code": "X481" },
                        "飯塚・田川": { "code": "X482" },
                        "宗像・遠賀": { "code": "X491" },
                        "糸島・その他福岡エリア": { "code": "X176" }
                    }
                }, "北九州": { code: "GB", smallAreas: {} }, "久留米": { code: "GH", smallAreas: {} },
                "長崎": { code: "GD", smallAreas: {} }, "熊本": { code: "GE", smallAreas: {} }, "大分": { code: "GF", smallAreas: {} },
                "宮崎": { code: "GG", smallAreas: {} }, "鹿児島": { code: "GC", smallAreas: {} }, "佐賀": { code: "GJ", smallAreas: {} }, "沖縄": { code: "GI", smallAreas: {} }
            }
        }
    };

    // 1. エリアブロック（大エリア）のプルダウンを生成
    for (const blockName in areas) {
        const option = document.createElement('option');
        option.value = blockName;
        option.textContent = `${blockName} (${areas[blockName].code})`;
        largeAreaSelect.appendChild(option);
    }

    // 2. エリアブロックが選択されたら、中エリアのプルダウンを更新
    largeAreaSelect.addEventListener('change', () => {
        const selectedLargeArea = largeAreaSelect.value;
        middleAreaSelect.innerHTML = '<option value="">ブロック全域</option>';
        smallAreaSelect.innerHTML = '<option value="">エリア全域</option>';
        middleAreaGroup.style.visibility = 'hidden';
        smallAreaGroup.style.visibility = 'hidden';

        if (selectedLargeArea && areas[selectedLargeArea]) {
            for (const middleAreaName in areas[selectedLargeArea].middleAreas) {
                const option = document.createElement('option');
                option.value = middleAreaName;
                const middleAreaCode = areas[selectedLargeArea].middleAreas[middleAreaName].code;
                option.textContent = `${middleAreaName} (${middleAreaCode})`;
                middleAreaSelect.appendChild(option);
            }
            middleAreaGroup.style.visibility = 'visible';
        }
    });

    // 3. 中エリアが選択されたら、小エリアのプルダウンを更新
    middleAreaSelect.addEventListener('change', () => {
        const selectedLargeArea = largeAreaSelect.value;
        const selectedMiddleArea = middleAreaSelect.value;
        smallAreaSelect.innerHTML = '<option value="">エリア全域</option>';
        smallAreaGroup.style.visibility = 'hidden';

        // 3階層目のデータが存在し、空の配列でない場合のみ小エリアのプルダウンを表示
        const smallAreaDefs = areas[selectedLargeArea]?.middleAreas[selectedMiddleArea]?.smallAreas;
        if (smallAreaDefs && Object.keys(smallAreaDefs).length > 0) {

            for (const smallAreaName in smallAreaDefs) {
                const option = document.createElement('option');
                option.value = smallAreaName;
                const smallAreaCode = smallAreaDefs[smallAreaName].code;
                option.textContent = `${smallAreaName} (${smallAreaCode})`;
                smallAreaSelect.appendChild(option);
            }
            smallAreaGroup.style.visibility = 'visible';
        }
    });

    // --- 計測タイプ切り替え ---
    searchTypeToggle.addEventListener('click', (event) => {
        const clickedButton = event.target.closest('.toggle-button');
        if (!clickedButton) return;

        // すべてのボタンからactiveクラスを削除
        searchTypeToggle.querySelectorAll('.toggle-button').forEach(btn => {
            btn.classList.remove('active');
        });
        // クリックされたボタンにactiveクラスを追加
        clickedButton.classList.add('active');
        // グラフの表示を切り替えるために履歴を再読み込み・再描画する
        // MEOの履歴機能は今後の拡張で対応
        fetchAndDisplayAutoHistory();
        const activeType = clickedButton.dataset.type;
        updateUIForSearchType(activeType); // Call the new function
        renderAutoTasks();
    });

    // モード説明ボタンのイベントリスナー
    modeHelpButton.addEventListener('click', () => {
        const activeMode = searchTypeToggle.querySelector('.toggle-button.active').dataset.type;
        let helpText = '';

        if (activeMode === 'normal') {
            helpText = `■ HPB通常検索モードについて

このモードは、ホットペッパービューティーの通常の検索結果ページでの掲載順位を計測します。

【計測方法】
ユーザーがフリーワード（例：「まつげパーマ」）とエリア（例：「福山・尾道」）を指定して検索した際の結果をシミュレートします。

【用途】
特定のキーワードとエリアの組み合わせにおける、自店のオーガニックな検索順位を確認したい場合に使用します。`;
        } else if (activeMode === 'special') {
            helpText = `■ HPB特集検索モードについて

このモードは、「〇〇駅で人気のサロン特集」のような、ホットペッパービューティーが独自に編集した「特集ページ」での掲載順位を計測します。

【計測方法】
指定された特集ページのURLに直接アクセスし、そのページ内でのサロンの掲載順位を確認します。

【用途】
HPBの特集企画に掲載されている場合の順位を確認したい場合に使用します。代理店様などが「LP（ランディングページ）」と呼ぶページも、多くはこの特集ページに該当します。`;
        } else if (activeMode === 'google') {
            helpText = `■ MEO検索モードについて

このモードは、Googleマップでの検索結果（MEO）における掲載順位を計測します。

【計測地点について】

【パーソナライズの排除】
Googleマップの検索結果は、検索場所や履歴によって変動しますが、このシステムでは以下の方法で客観的な順位を計測しています。

1. クリーンな環境: 履歴のないブラウザで計測します。
2. 検索場所の固定: あなたのPCの場所ではなく、指定された検索地点（例：「福山駅」）の座標を仮想的に設定して検索します。

これにより、誰がどこで計測しても、常に「指定した地点の周辺での検索結果」という同じ条件下での順位を確認できます。`;
        } else if (activeMode === 'seo') {
            helpText = `■ SEO検索モードについて

このモードは、通常のGoogleウェブ検索結果での掲載順位（SEO）を計測します。

【計測方法】
指定された「キーワード」でGoogle検索を行い、検索結果の1ページ目から順に、指定された「計測対象URL」が含まれるページを探します。

【検索地点（任意）】
「検索地点」を指定すると、その地点から検索した際の結果をシミュレートします。これにより、地域によって変動する検索順位（ローカルSEO）の確認が可能です。
地点を指定しない場合は、より一般的な検索結果を取得します。

【注意】Googleの検索結果は常に変動するため、計測結果はあくまで目安としてご利用ください。`;
        }

        alert(helpText);
    });

    // 手動計測セクションへのスクロールボタン
    scrollToManualCheckButton.addEventListener('click', () => {
        const manualCheckSection = document.getElementById('manualCheckSection');
        manualCheckSection.scrollIntoView({ behavior: 'smooth' });
    });
    let rankChart = null; // グラフのインスタンスを保持する変数

    // --- Excelエクスポート機能 ---
    async function exportToExcel(button, groupKey, groupData, activeSearchType) {
        const originalText = button.textContent;
        button.textContent = '作成中...';
        button.disabled = true;

        try {
            const response = await fetch('/download_excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupKey, groupData, activeSearchType })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Excelファイルの生成に失敗しました。');
            }

            const blob = await response.blob();
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);

            // ファイル名の生成
            const safeGroupKey = groupKey.replace(/[\\/:*?"<>|]/g, '_');
            const fileName = `${safeGroupKey}.xlsx`;

            link.setAttribute("download", fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            alert(`エラー: ${error.message}`);
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    function generateFileName(groupKey, activeSearchType, extension) {
        const safeGroupKey = groupKey.replace(/[\\/:*?"<>|]/g, '_');
        let typeName = '';
        if (activeSearchType === 'normal') typeName = 'HPB通常';
        else if (activeSearchType === 'special') typeName = 'HPB特集';
        else if (activeSearchType === 'google') typeName = 'MEO';
        else if (activeSearchType === 'seo') typeName = 'SEO';
        const fileName = `${safeGroupKey}_${typeName}履歴.${extension}`;
        return fileName;
    }

    // --- ヘルパー関数 ---
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function openResultInNewTab(resultData) {
        const newTab = window.open('', '_blank');
        if (!newTab) {
            alert('ポップアップブロックが有効になっている可能性があります。新しいタブを開けませんでした。');
            return;
        }

        const screenshotHtml = resultData.screenshot_path
            ? `
                <h2>スクリーンショット</h2>
                <a href="${resultData.screenshot_path}" target="_blank"><img src="${resultData.screenshot_path}" style="max-width: 100%; border: 1px solid #ddd;" alt="Screenshot"></a>
            `
            : '<h2>スクリーンショットはありません</h2>';

        const debugHtmlContent = resultData.html ? escapeHtml(resultData.html) : 'HTMLコンテンツはありませんでした。';

        const debugInfoHtml = `
            <h2>デバッグ情報</h2>
            <p><strong>最終アクセスURL:</strong> <a href="${resultData.url || '#'}" target="_blank">${resultData.url || 'N/A'}</a></p>
            <p><strong>取得したページのHTMLソース:</strong></p>
            <textarea style="width: 98%; height: 400px; font-family: monospace; border: 1px solid #ccc; padding: 5px;" readonly>${debugHtmlContent}</textarea>
        `;

        const newTabContent = `
            <!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>計測詳細 - ${resultData.keyword || ''}</title>
            <style>body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; line-height: 1.6; } h1, h2 { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px; }</style>
            </head><body><h1>計測詳細</h1>${screenshotHtml}<hr style="margin: 20px 0;">${debugInfoHtml}</body></html>
        `;

        newTab.document.write(newTabContent);
        newTab.document.close();
    }

    // 順位をグラフのY軸座標に変換する（線形補間）
    function convertRankToY(rank) {
        if (typeof rank !== 'number') {
            if (rank === '圏外') {
                return 1.5; // '圏外' のY座標
            }
            // 「枠無」「エラー」「スキップ」などはグラフに表示しない
            return NaN;
        }

        const points = [
            { rank: 1, y: 6 },
            { rank: 5, y: 5 },
            { rank: 20, y: 4 },
            { rank: 50, y: 3 },
            { rank: 100, y: 2 }
        ];

        // ランクがどの区間に属するかを見つける
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            if (rank >= p1.rank && rank <= p2.rank) {
                const rankRange = p2.rank - p1.rank;
                const yRange = p1.y - p2.y;
                const rankOffset = rank - p1.rank;
                return p1.y - ((rankOffset / (rankRange || 1)) * yRange);
            }
        }
        return (rank < 1) ? 6 : 1.5; // 1位より良いか、100位より悪い場合
    }

    // --- UIの状態を管理する関数 ---
    function setMeasuringState(measuring) {
        state.isMeasuring = measuring;
        // 計測実行ボタンの状態を更新
        checkRankButton.disabled = measuring;
        manualTriggerButton.disabled = measuring;

        // 計測中はモード切替とタスク追加/コピーボタンを無効化
        searchTypeToggle.querySelectorAll('button').forEach(btn => btn.disabled = measuring);
        addAutoTaskButton.disabled = measuring;
        document.getElementById('executeCopyButton').disabled = measuring; // MEOコピーボタン
        document.getElementById('executeHpbNormalCopyButton').disabled = measuring; // HPB通常コピーボタン
        document.getElementById('executeHpbSpecialCopyButton').disabled = measuring; // HPB特集コピーボタン
    }

    checkRankButton.addEventListener('click', async () => {
        const salonName = salonNameInput.value.trim();
        const activeSearchType = searchTypeToggle.querySelector('.toggle-button.active').dataset.type;

        let serviceKeywords = [];
        let areaCodes = {};
        let areaName = '';

        if (activeSearchType === 'normal') {
            const largeArea = largeAreaSelect.value;
            const middleArea = middleAreaSelect.value;
            const smallArea = smallAreaSelect.value;
            const keywordsRaw = keywordInput.value.trim();

            if (!salonName) {
                alert('自店のサロン名を入力してください。');
                return;
            }
            if (!largeArea || !keywordsRaw) {
                alert('通常検索では、エリアブロックを必ず入力してください。');
                return;
            }
            serviceKeywords = keywordsRaw.split(/[\s,、]+/).filter(k => k);
            areaName = smallArea || middleArea || largeArea;
            if (largeArea) areaCodes.serviceAreaCd = areas[largeArea].code;
            if (middleArea) areaCodes.middleAreaCd = areas[largeArea].middleAreas[middleArea].code;
            if (smallArea) areaCodes.smallAreaCd = areas[largeArea].middleAreas[middleArea].smallAreas[smallArea].code; // この行は変更なし
        } else if (activeSearchType === 'special') { // special
            const featureUrl = featurePageUrlInput.value.trim();
            if (!featureUrl) {
                alert('特集ページ検索では、URLを入力してください。');
                return;
            }
            if (!salonName) {
                alert('特集ページ検索では、URLを入力してください。');
                return;
            }
            serviceKeywords.push(featureUrl); // 特集ページはURLをキーワードとして1タスクとして扱う
        } else if (activeSearchType === 'google') {
            const googleKeyword = document.getElementById('googleKeywordInput').value.trim();
            const searchLocation = document.getElementById('searchLocationInput').value.trim();
            if (!salonName) {
                alert('MEO検索では、自店のサロン名を入力してください。');
                return;
            }
            if (!googleKeyword || !searchLocation) {
                alert('MEO検索では、検索地点と検索キーワードを入力してください。');
                return;
            }
            serviceKeywords.push(googleKeyword); // MEOではキーワードは1つずつ
        } else if (activeSearchType === 'seo') {
        }

        setMeasuringState(true); // 計測状態を開始に設定
        checkRankButton.textContent = '計測中...';
        resultArea.innerHTML = ''; // 以前の結果をクリア

        // --- 所要時間計測開始 ---
        const startTime = performance.now();
        let timerInterval = null;

        // 全体のステータスを表示するコンテナを作成
        const overallStatusContainer = document.createElement('div');
        overallStatusContainer.id = 'overallStatus';
        overallStatusContainer.style.padding = '10px';
        overallStatusContainer.style.marginBottom = '15px';
        overallStatusContainer.style.borderBottom = '1px solid #ddd';
        overallStatusContainer.style.fontWeight = '500';
        resultArea.appendChild(overallStatusContainer);

        // --- 経過時間表示タイマーを開始 ---
        timerInterval = setInterval(() => {
            const elapsedTotalSeconds = Math.floor((performance.now() - startTime) / 1000);
            const minutes = Math.floor(elapsedTotalSeconds / 60);
            const seconds = elapsedTotalSeconds % 60;
            const durationString = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
            const currentText = overallStatusContainer.textContent;
            // 最後の括弧部分を時間表示で置き換える
            const baseText = currentText.replace(/\s*\([^)]*\)$/, '');
            if (baseText) { // 計測完了メッセージには追記しない
                overallStatusContainer.textContent = `${baseText} (経過時間: ${durationString})`;
            }
        }, 1000);

        for (const [index, serviceKeyword] of serviceKeywords.entries()) {
            // 各キーワードの結果を表示するコンテナを作成
            // 全体ステータスとは別に、各キーワードの結果表示エリアを作成
            const keywordResultContainer = document.createElement('div');
            keywordResultContainer.style.borderBottom = '1px solid #e5e5e7';
            keywordResultContainer.style.paddingBottom = '15px';
            keywordResultContainer.style.marginBottom = '15px';
            resultArea.appendChild(keywordResultContainer);

            let fullKeyword = '';
            let eventSourceUrl = '';
            if (activeSearchType === 'normal') {
                const displayArea = areaName || "エリア未指定";
                fullKeyword = (displayArea !== "全国" ? displayArea + ' ' : '') + serviceKeyword;
                eventSourceUrl = `/check-ranking?` + new URLSearchParams({
                    serviceKeyword, salonName, areaCodes: JSON.stringify(areaCodes)
                });
            } else if (activeSearchType === 'google') {
                const searchLocation = document.getElementById('searchLocationInput').value.trim();
                fullKeyword = `[${searchLocation}] ${serviceKeyword}`;
                eventSourceUrl = `/check-meo-ranking?` + new URLSearchParams({
                    keyword: serviceKeyword,
                    location: searchLocation,
                    // salonName: salonName // バックエンドでの照合は不要になったため削除
                });
            } else if (activeSearchType === 'seo') {
                const urlToFind = document.getElementById('urlToFindInput').value.trim();
                const seoLocation = document.getElementById('seoLocationInput').value.trim();
                fullKeyword = `[${seoLocation || '指定なし'}] ${serviceKeyword}`;
                eventSourceUrl = `/check-seo-ranking?` + new URLSearchParams({
                    url: urlToFind,
                    keyword: serviceKeyword,
                    location: seoLocation
                    // salonName: salonName // バックエンドでの照合は不要になったため削除
                });
            } else { // special
                fullKeyword = serviceKeyword; // この時点ではURLそのもの
                eventSourceUrl = `/check-feature-page-ranking?` + new URLSearchParams({
                    featurePageUrl: serviceKeyword, salonName
                });
            }
            
            // 全体ステータスを更新
            overallStatusContainer.textContent = `${index + 1} / ${serviceKeywords.length} 件目: 「${fullKeyword}」を計測中... `; // 末尾にスペース
            // 個別の結果エリアにも初期メッセージを表示
            keywordResultContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${fullKeyword}」</h4><p>計測しています...</p>`;

            await new Promise((resolve, reject) => {
                const eventSource = new EventSource(eventSourceUrl, { withCredentials: true });

                // サーバーからメッセージが届くたびに呼び出される
                eventSource.onmessage = (event) => {
                    const data = JSON.parse(event.data);

                    if (data.error) {
                        keywordResultContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${escapeHtml(fullKeyword)}」</h4><p style="color: red;">エラー: ${escapeHtml(data.error)}</p>`;
                        eventSource.close();
                        reject(new Error(data.error));
                        return;
                    }

                    if (data.status) {
                        // 詳細なステータスを個別の結果エリアに表示
                        keywordResultContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${escapeHtml(fullKeyword)}」</h4><p>${escapeHtml(data.status)}</p>`;
                    }

                    if (data.final_result) {
                        const result = data.final_result;
                        // 特集ページの場合、タイトルで表示を更新
                        const resultTitle = (activeSearchType === 'special') ? (result.page_title || fullKeyword) : fullKeyword;
                        result.keyword = resultTitle;

                        let totalCountHtml = (result.total_count !== undefined) ? `<p style="font-size: 14px; color: #6c6c70; margin-bottom: 10px;">検索結果総数: <strong style="color: #1c1c1e;">${result.total_count}</strong> 件</p>` : '';
                        let resultMessageHtml;

                        // --- MEOとそれ以外で結果表示を分岐 ---
                        if (activeSearchType === 'google') {
                            if (result.results && result.results.length > 0) {
                                let foundMySalon = false;
                                const resultsListHtml = result.results.map((item, index) => {
                                    const isMySalon = salonName && item.foundSalonName.toLowerCase().includes(salonName.toLowerCase());
                                    if (isMySalon) foundMySalon = true;
                                    const itemStyle = isMySalon ? 'background-color: #eef7ff; border-left: 3px solid #007aff;' : '';
                                    const rankColor = isMySalon ? '#007aff' : '#1c1c1e';
                                    return `
                                        <div style="padding: 10px; ${index < result.results.length - 1 ? 'border-bottom: 1px solid #e5e5e7;' : ''} ${itemStyle}">
                                            <p style="margin: 0; font-size: 16px; font-weight: bold;"><span style="color: ${rankColor}; font-size: 1.2em; display: inline-block; width: 3em;">${item.rank}位</span> ${escapeHtml(item.foundSalonName)}</p>
                                        </div>
                                    `;
                                }).join('');
                                
                                const summaryMessage = foundMySalon 
                                    ? `<p style="font-weight: bold; color: #007aff; margin-bottom: 15px;">自店をリスト内に発見しました。</p>`
                                    : `<p style="font-weight: bold; color: #ff3b30; margin-bottom: 15px;">自店が見つかりませんでした。以下のリストを確認してください。</p>`;

                                resultMessageHtml = `${summaryMessage}<div style="text-align: left; max-height: 400px; overflow-y: auto;">${resultsListHtml}</div>`;

                                // --- MEOの履歴保存処理 ---
                                const mySalonRankItem = result.results.find(item => salonName && item.foundSalonName.toLowerCase().includes(salonName.toLowerCase()));
                                const finalRank = mySalonRankItem ? mySalonRankItem.rank : '圏外';
                                const searchLocation = document.getElementById('searchLocationInput').value.trim();
                                const googleKeyword = document.getElementById('googleKeywordInput').value.trim();
                                if (result.rank === "エリア不一致") {
                                    resultMessageHtml = `<p style="color: #ff9500;">検索地点と結果が一致しませんでした (エリア不一致)</p>`;
                                }
                                // IDの形式を統一する
                                // 古い形式のIDが "[google]-" プレフィックスなしで作成されていたため、
                                // 新しく作成する際は必ずプレフィックスを付けるようにする。
                                const taskId = `[google]-${salonName}-${searchLocation}-${googleKeyword}`; 
                                const taskPayload = { id: taskId, type: 'google', salonName, searchLocation, keyword: googleKeyword };
                                const historyPayload = {
                                    task: taskPayload,
                                    result: { rank: finalRank, screenshot_path: result.screenshot_path }
                                };
                                saveManualHistory(historyPayload);

                            } else {
                                resultMessageHtml = `<p>検索結果に店舗が見つかりませんでした。</p>`;
                            }
                        } else { // 通常検索と特集ページ検索の場合
                            if (result.results && result.results.length > 0) {
                                const resultsListHtml = result.results.map((item, index) => {
                                    const isMySalon = salonName && item.foundSalonName.includes(salonName);
                                    const itemStyle = isMySalon ? 'background-color: #eef7ff; border-left: 3px solid #007aff;' : '';
                                    const rankColor = isMySalon ? '#007aff' : '#1c1c1e';

                                    return `
                                        <div style="padding: 10px; ${index < result.results.length - 1 ? 'border-bottom: 1px solid #e5e5e7;' : ''} ${itemStyle}">
                                            <p style="margin: 0; font-size: 16px; font-weight: bold;"><span style="color: ${rankColor}; font-size: 1.2em; display: inline-block; width: 3em;">${item.rank}位</span> ${escapeHtml(item.foundSalonName)}</p>
                                        </div>
                                    `;
                                }).join('');
                                resultMessageHtml = `<div style="text-align: left;">${resultsListHtml}</div>`;
                                
                                // --- 履歴保存をバックエンドAPI呼び出しに変更 ---
                                const finalRank = result.results[0].rank;
                                let taskId, taskPayload;
                                if (activeSearchType === 'normal') {
                                    taskId = `${salonName}-${areaName}-${serviceKeyword}`;
                                    taskPayload = { id: taskId, type: 'normal', salonName, areaName, areaCodes, serviceKeyword };
                                } else if (activeSearchType === 'special') {
                                    taskId = `${salonName}-${serviceKeyword}`; // URLをIDの一部に
                                    taskPayload = { id: taskId, type: 'special', salonName, featurePageUrl: serviceKeyword, featurePageName: result.page_title };
                                } else {
                                    taskPayload = null;
                                }
                                if (taskPayload) {
                                    const historyPayload = {
                                        task: taskPayload,
                                        result: { rank: finalRank, screenshot_path: result.screenshot_path }
                                    };
                                    saveManualHistory(historyPayload);
                                }
                            } else { // 圏外の場合
                                resultMessageHtml = `<p>5ページ（100位）以内に見つかりませんでした (圏外)</p>`;
                                // --- 圏外の場合の履歴保存処理を追加 ---
                                let taskId, taskPayload;
                                if (activeSearchType === 'normal') {
                                    taskId = `${salonName}-${areaName}-${serviceKeyword}`;
                                    taskPayload = { id: taskId, type: 'normal', salonName, areaName, areaCodes, serviceKeyword };
                                } else if (activeSearchType === 'special') {
                                    taskId = `${salonName}-${serviceKeyword}`;
                                    taskPayload = { id: taskId, type: 'special', salonName, featurePageUrl: serviceKeyword, featurePageName: result.page_title };
                                } else {
                                    taskPayload = null;
                                }
                                if (taskPayload) {
                                    const historyPayload = {
                                        task: taskPayload,
                                        result: { rank: '圏外', screenshot_path: result.screenshot_path }
                                    };
                                    saveManualHistory(historyPayload);
                                }
                            }
                        }

                        function saveManualHistory(payload) {
                            fetch('/api/save-auto-history-entry', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload) // 引数 payload を使用するように修正
                            }).catch(err => console.error('履歴の保存に失敗しました:', err));
                        }

                        keywordResultContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${escapeHtml(fullKeyword)}」</h4>${totalCountHtml}${resultMessageHtml}`;
                        keywordResultContainer.style.cursor = 'pointer';
                        keywordResultContainer.title = 'クリックして詳細（スクショとデバッグ情報）を表示';
                        keywordResultContainer.onclick = () => openResultInNewTab(result);
                        
                        eventSource.close();
                        resolve();
                    }
                };

                eventSource.onerror = (err) => {
                    keywordResultContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${escapeHtml(fullKeyword)}」</h4><p style="color: red;">エラー: サーバーとの接続に失敗しました。</p>`;
                    eventSource.close();
                    reject(err);
                };
            }).catch(error => {
                console.error(`「${fullKeyword}」の計測中にエラーが発生しました:`, error);
            });
        }

        // --- タイマーを停止 ---
        clearInterval(timerInterval);

        // --- 所要時間計測終了 ---
        const endTime = performance.now();
        const elapsedTotalSeconds = Math.floor((endTime - startTime) / 1000);
        const minutes = Math.floor(elapsedTotalSeconds / 60);
        const seconds = elapsedTotalSeconds % 60;
        const durationString = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;

        // 全ての計測が完了したことを通知
        overallStatusContainer.textContent = `すべての計測が完了しました。（${serviceKeywords.length}件 / 所要時間: ${durationString}）`;
        // 全ての処理が完了したらUIの状態を元に戻す
        setMeasuringState(false);
        checkRankButton.textContent = '順位を計測';
        fetchAndDisplayAutoHistory(); // 自動計測履歴グラフを更新
    });

    // --- 自動計測 実行時間設定 ---
    // 時間選択のプルダウンを生成 (0-23時)
    for (let i = 0; i < 24; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i}`.padStart(2, '0');
        scheduleHourSelect.appendChild(option);
    }

    // 現在のスケジュール設定を取得して表示する関数
    const fetchSchedule = async () => {
        try {
            const response = await fetch('/api/schedule');
            if (response.ok) {
                const data = await response.json();
                scheduleHourSelect.value = data.hour;
                scheduleStatus.textContent = `現在の設定: 毎日 ${String(data.hour).padStart(2, '0')}:${String(data.minute).padStart(2, '0')} に実行されます。`;
            } else {
                scheduleStatus.textContent = '現在の設定時間を取得できませんでした。';
            }
        } catch (error) {
            console.error('スケジュールの取得に失敗しました:', error);
            scheduleStatus.textContent = '現在の設定時間を取得できませんでした。';
        }
    };

    // スケジュール保存ボタンのクリックイベント
    saveScheduleButton.addEventListener('click', async () => {
        const newHour = parseInt(scheduleHourSelect.value, 10);
        if (isNaN(newHour)) {
            alert('有効な時間を選択してください。');
            return;
        }

        saveScheduleButton.disabled = true;
        saveScheduleButton.textContent = '保存中...';

        try {
            const response = await fetch('/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hour: newHour, minute: 0 }), // 分は0で固定
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '保存に失敗しました。');
            alert(result.message);
            fetchSchedule(); // 表示を更新
        } catch (error) {
            alert(`エラー: ${error.message}`);
        } finally {
            saveScheduleButton.disabled = false;
            saveScheduleButton.textContent = '設定を保存';
        }
    });

    // --- 自動計測タスク一覧の開閉 ---
    autoTaskListToggle.addEventListener('click', () => {
        const isVisible = autoTaskListContent.style.display === 'block';
        if (isVisible) {
            localStorage.setItem('taskListVisible', 'false');
            autoTaskListContent.style.display = 'none';
            taskListToggleIcon.style.transform = 'rotate(0deg)';
        } else {
            localStorage.setItem('taskListVisible', 'true');
            autoTaskListContent.style.display = 'block';
            taskListToggleIcon.style.transform = 'rotate(180deg)';
        }
    });

    // --- MEOタスクコピー機能 ---
    const copySourceSelect = document.getElementById('copySourceLocation');
    const copyDestInput = document.getElementById('copyDestLocation');
    const copyDestSalonNameInput = document.getElementById('copyDestSalonName');
    const copyButton = document.getElementById('executeCopyButton');

    function updateCopySourceLocations() {
        const meoTasks = autoTasks.filter(task => task.type === 'google');
        const locations = [...new Set(meoTasks.map(task => task.searchLocation))];
        
        copySourceSelect.innerHTML = ''; // プルダウンをクリア
        if (locations.length === 0) {
            const option = document.createElement('option');
            option.textContent = 'コピー元の地点がありません';
            option.disabled = true;
            copySourceSelect.appendChild(option);
            copyButton.disabled = true;
            return;
        }

        locations.sort((a,b) => a.localeCompare(b, 'ja'));
        locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            copySourceSelect.appendChild(option);
        });
        copyButton.disabled = false;
    }

    copyButton.addEventListener('click', () => {
        const sourceLocation = copySourceSelect.value;
        const destLocation = copyDestInput.value.trim();
        const destSalonName = copyDestSalonNameInput.value.trim();

        if (!sourceLocation || !destLocation) {
            alert('コピー元とコピー先の両方を指定してください。');
            return;
        }

        if (sourceLocation === destLocation && !destSalonName) {
            alert('コピー元とコピー先が同じ地点です。別のサロン名を指定する場合のみコピーできます。');
            return;
        }

        const tasksToCopy = autoTasks.filter(task => task.type === 'google' && task.searchLocation === sourceLocation);
        
        if (!confirm(`「${sourceLocation}」の${tasksToCopy.length}個のキーワードを「${destLocation}」にコピーしますか？`)) {
            return;
        }

        tasksToCopy.forEach(task => {
            const salonName = destSalonName || task.salonName; // 新しいサロン名が指定されていれば使用
            const originalKeyword = task.keyword;
            let newKeyword = originalKeyword;

            // --- キーワード内の地名を置換するロジック ---
            const sourceLocationBase = sourceLocation.replace(/駅|市$/, '').trim();
            const destLocationBase = destLocation.replace(/駅|市$/, '').trim();

            // キーワードがコピー元の地名で始まっている場合、コピー先の地名に置き換える
            if (sourceLocationBase && originalKeyword.startsWith(sourceLocationBase)) {
                newKeyword = destLocationBase + originalKeyword.substring(sourceLocationBase.length);
            }

            const newTaskId = `[google]-${salonName}-${destLocation}-${newKeyword}`;
            if (!autoTasks.some(t => t.id === newTaskId)) {
                autoTasks.push({ id: newTaskId, type: 'google', salonName: salonName, searchLocation: destLocation, keyword: newKeyword });
            }
        });

        saveAutoTasks();
        renderAutoTasks();
        alert(`タスクのコピーが完了しました。「${destLocation}」のタスク一覧を確認してください。`);
        copyDestInput.value = ''; // 入力欄をクリア
        copyDestSalonNameInput.value = ''; // サロン名入力欄もクリア
    });
    
    // --- HPB通常タスクコピー機能 ---
    const copySourceAreaSelect = document.getElementById('copySourceArea');
    const copyDestAreaSelect = document.getElementById('copyDestArea');
    const copyDestSalonNameHpbNormalInput = document.getElementById('copyDestSalonNameHpbNormal');
    const hpbNormalCopyButton = document.getElementById('executeHpbNormalCopyButton');

    function updateHpbNormalCopySources() {
        const normalTasks = (autoTasks || []).filter(task => (task.type || 'normal') === 'normal');
        const sourceAreas = [...new Set(normalTasks.map(task => task.areaName))];
        
        copySourceAreaSelect.innerHTML = '';
        if (sourceAreas.length === 0) {
            const option = document.createElement('option');
            option.textContent = 'コピー元のエリアがありません';
            option.disabled = true;
            copySourceAreaSelect.appendChild(option);
            hpbNormalCopyButton.disabled = true;
        } else {
            sourceAreas.sort((a,b) => a.localeCompare(b, 'ja'));
            sourceAreas.forEach(area => {
                const option = document.createElement('option');
                option.value = area;
                option.textContent = area;
                copySourceAreaSelect.appendChild(option);
            });
            hpbNormalCopyButton.disabled = false;
        } // updateHpbNormalCopySources

        // コピー先プルダウンを生成
        copyDestAreaSelect.innerHTML = '';
        // デフォルトオプションを追加
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'コピー先のエリアを選択';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        copyDestAreaSelect.appendChild(defaultOption);

        Object.keys(areas).sort((a,b) => a.localeCompare(b, 'ja')).forEach(largeAreaName => {
            const largeArea = areas[largeAreaName];
            
            // 大エリア自体をコピー先として追加
            let largeAreaOption = document.createElement('option');
            largeAreaOption.value = JSON.stringify({
                areaName: largeAreaName,
                areaCodes: { serviceAreaCd: largeArea.code }
            });
            largeAreaOption.textContent = `${largeAreaName} (全域)`;
            copyDestAreaSelect.appendChild(largeAreaOption);

            Object.keys(largeArea.middleAreas).sort((a,b) => a.localeCompare(b, 'ja')).forEach(middleAreaName => {
                const option = document.createElement('option');
                option.value = JSON.stringify({
                    areaName: middleAreaName,
                    areaCodes: { serviceAreaCd: largeArea.code, middleAreaCd: largeArea.middleAreas[middleAreaName].code }
                });
                option.textContent = `${largeAreaName} > ${middleAreaName}`;
                copyDestAreaSelect.appendChild(option);

                // 小エリアが存在する場合、それも追加
                const smallAreaDefs = largeArea.middleAreas[middleAreaName].smallAreas;
                if (smallAreaDefs && Object.keys(smallAreaDefs).length > 0) {
                    Object.keys(smallAreaDefs).sort((a,b) => a.localeCompare(b, 'ja')).forEach(smallAreaName => {
                        const smallAreaOption = document.createElement('option');
                        smallAreaOption.value = JSON.stringify({
                            areaName: smallAreaName,
                            areaCodes: { serviceAreaCd: largeArea.code, middleAreaCd: largeArea.middleAreas[middleAreaName].code, smallAreaCd: smallAreaDefs[smallAreaName].code }
                        });
                        smallAreaOption.textContent = `${largeAreaName} > ${middleAreaName} > ${smallAreaName}`;
                        copyDestAreaSelect.appendChild(smallAreaOption);
                    });
                }
            });
        });
    }

    hpbNormalCopyButton.addEventListener('click', () => {
        const sourceAreaName = copySourceAreaSelect.value;
        if (!copyDestAreaSelect.value) {
            alert('コピー先のエリアを選択してください。');
            return;
        }
        const { areaName: destAreaName, areaCodes: destAreaCodes } = JSON.parse(copyDestAreaSelect.value);
        const destSalonName = copyDestSalonNameHpbNormalInput.value.trim();

        if (!sourceAreaName || !destAreaName) {
            alert('コピー元とコピー先の両方のエリアを指定してください。');
            return;
        }
        if (sourceAreaName === destAreaName && !destSalonName) {
            alert('コピー元とコピー先が同じエリアです。別のサロン名を指定する場合のみコピーできます。');
            return;
        }

        const tasksToCopy = autoTasks.filter(task => (task.type || 'normal') === 'normal' && task.areaName === sourceAreaName);
        if (!confirm(`「${sourceAreaName}」の${tasksToCopy.length}個のキーワードを「${destAreaName}」にコピーしますか？`)) {
            return;
        }

        tasksToCopy.forEach(task => {
            const salonName = destSalonName || task.salonName;
            const newTaskId = `${salonName}-${destAreaName}-${task.serviceKeyword}`;
            if (!autoTasks.some(t => t.id === newTaskId)) {
                autoTasks.push({
                    id: newTaskId,
                    type: 'normal',
                    salonName: salonName,
                    areaName: destAreaName,
                    areaCodes: destAreaCodes,
                    serviceKeyword: task.serviceKeyword
                });
            }
        });

        saveAutoTasks();
        renderAutoTasks();
        alert(`タスクのコピーが完了しました。「${destAreaName}」のタスク一覧を確認してください。`);
        copyDestSalonNameHpbNormalInput.value = '';
    });

    // --- HPB特集タスクコピー機能 ---
    const copySourceSpecialPageSelect = document.getElementById('copySourceSpecialPage');
    const copyDestSpecialPageUrlInput = document.getElementById('copyDestSpecialPageUrl');
    const copyDestSalonNameHpbSpecialInput = document.getElementById('copyDestSalonNameHpbSpecial');
    const hpbSpecialCopyButton = document.getElementById('executeHpbSpecialCopyButton');

    function updateHpbSpecialCopySources() {
        const specialTasks = autoTasks.filter(task => task.type === 'special');
        const sourcePages = [...new Map(specialTasks.map(task => [task.featurePageUrl, task.featurePageName || task.featurePageUrl])).entries()];

        copySourceSpecialPageSelect.innerHTML = '';
        if (sourcePages.length === 0) {
            const option = document.createElement('option');
            option.textContent = 'コピー元の特集ページがありません';
            option.disabled = true;
            copySourceSpecialPageSelect.appendChild(option);
            hpbSpecialCopyButton.disabled = true;
        } else {
            sourcePages.forEach(([url, name]) => {
                const option = document.createElement('option');
                option.value = url;
                option.textContent = name;
                copySourceSpecialPageSelect.appendChild(option);
            });
            hpbSpecialCopyButton.disabled = false;
        }
    }

    hpbSpecialCopyButton.addEventListener('click', () => {
        const sourceUrl = copySourceSpecialPageSelect.value;
        const destUrl = copyDestSpecialPageUrlInput.value.trim();
        const destSalonName = copyDestSalonNameHpbSpecialInput.value.trim();

        if (!sourceUrl || !destUrl) { alert('コピー元とコピー先の両方を指定してください。'); return; }
        if (sourceUrl === destUrl && !destSalonName) {
            alert('コピー元とコピー先が同じURLです。別のサロン名を指定する場合のみコピーできます。'); return;
        }

        const tasksToCopy = autoTasks.filter(task => task.type === 'special' && task.featurePageUrl === sourceUrl);
        if (!confirm(`「${copySourceSpecialPageSelect.options[copySourceSpecialPageSelect.selectedIndex].text}」の${tasksToCopy.length}個のサロンを新しいURLにコピーしますか？`)) { return; }

        tasksToCopy.forEach(task => {
            const salonName = destSalonName || task.salonName;
            const newTaskId = `${salonName}-${destUrl}`;
            if (!autoTasks.some(t => t.id === newTaskId)) {
                autoTasks.push({ id: newTaskId, type: 'special', salonName: salonName, featurePageUrl: destUrl });
            }
        });
        saveAutoTasks();
        renderAutoTasks();
        alert('タスクのコピーが完了しました。');
        copyDestSpecialPageUrlInput.value = '';
        copyDestSalonNameHpbSpecialInput.value = '';
    });

    // --- SEOタスクコピー機能 ---
    const copySourceSeoUrlSelect = document.getElementById('copySourceSeoUrl');
    const copyDestSeoUrlInput = document.getElementById('copyDestSeoUrl');
    const seoCopyButton = document.getElementById('executeSeoCopyButton');

    function updateSeoCopySources() {
        const seoTasks = autoTasks.filter(task => task.type === 'seo');
        // URLをキーにしてユニークなURLのリストを作成
        const sourceUrls = [...new Set(seoTasks.map(task => task.url))];

        copySourceSeoUrlSelect.innerHTML = '';
        if (sourceUrls.length === 0) {
            const option = document.createElement('option');
            option.textContent = 'コピー元のURLがありません';
            option.disabled = true;
            copySourceSeoUrlSelect.appendChild(option);
            seoCopyButton.disabled = true;
        } else {
            sourceUrls.sort();
            sourceUrls.forEach(url => {
                const option = document.createElement('option');
                option.value = url;
                option.textContent = url;
                copySourceSeoUrlSelect.appendChild(option);
            });
            seoCopyButton.disabled = false;
        }
    }

    seoCopyButton.addEventListener('click', () => {
        const sourceUrl = copySourceSeoUrlSelect.value;
        const destUrl = copyDestSeoUrlInput.value.trim();
        if (!sourceUrl || !destUrl) { alert('コピー元とコピー先の両方を指定してください。'); return; }
        if (sourceUrl === destUrl) { alert('コピー元とコピー先が同じです。'); return; }

        const tasksToCopy = autoTasks.filter(task => task.type === 'seo' && task.url === sourceUrl);
        if (!confirm(`「${sourceUrl}」の${tasksToCopy.length}個のタスクを新しいURL「${destUrl}」にコピーしますか？`)) { return; }

        tasksToCopy.forEach(task => {
            const newTaskId = `[seo]-${destUrl}-${task.keyword}-${task.searchLocation || ''}`;
            if (!autoTasks.some(t => t.id === newTaskId)) {
                autoTasks.push({ id: newTaskId, type: 'seo', url: destUrl, keyword: task.keyword, searchLocation: task.searchLocation });
            }
        });
        saveAutoTasks();
        renderAutoTasks();
        alert('タスクのコピーが完了しました。');
        copyDestSeoUrlInput.value = '';
    });

    // Function to update visibility of search inputs and copy sections
    function updateUIForSearchType(activeType) {
        normalSearchInputs.style.display = 'none';
        specialSearchInputs.style.display = 'none';
        googleMapSearchInputs.style.display = 'none';
        salonNameFormGroup.style.display = 'block'; // Always visible for now
        seoSearchInputs.style.display = 'none';

        if (activeType === 'normal') {
            normalSearchInputs.style.display = 'block';
        } else if (activeType === 'special') {
            specialSearchInputs.style.display = 'block';
        } else if (activeType === 'seo') {
            seoSearchInputs.style.display = 'block';
        } else if (activeType === 'google') {
            googleMapSearchInputs.style.display = 'block';
        }

        // コピー機能セクションの表示切り替え
        meoCopySection.style.display = 'none';
        hpbNormalTaskCopySection.style.display = 'none';
        hpbSpecialTaskCopySection.style.display = 'none';
        seoTaskCopySection.style.display = 'none';

        if (activeType === 'google') {
            meoCopySection.style.display = 'block';
            updateCopySourceLocations();
        } else if (activeType === 'normal') {
            hpbNormalTaskCopySection.style.display = 'block';
            updateHpbNormalCopySources();
        } else if (activeType === 'special') {
            hpbSpecialTaskCopySection.style.display = 'block';
            updateHpbSpecialCopySources();
        } else if (activeType === 'seo') {
            seoTaskCopySection.style.display = 'block';
            updateSeoCopySources();
        }
    }

    // Initial UI setup based on active search type
    const initialActiveButton = searchTypeToggle.querySelector('.toggle-button.active');
    if (initialActiveButton) {
        const initialActiveType = initialActiveButton.dataset.type;
        updateUIForSearchType(initialActiveType);
    }

    // --- 自動計測機能 ---
    let autoRankChart = null;

    const fetchAutoTasks = async () => {
        try {
            const response = await fetch(`/api/auto-tasks?_=${new Date().getTime()}`);
            autoTasks = await response.json();
            updateCopySourceLocations(); // MEOコピー元のプルダウンも更新
            updateHpbNormalCopySources(); // HPB通常コピー元のプルダウンも更新
            updateHpbSpecialCopySources(); // HPB特集コピー元のプルダウンも更新
            updateSeoCopySources(); // SEOコピー元のプルダウンも更新
            renderAutoTasks();
        } catch (error) {
            console.error('自動計測タスクの読み込みに失敗しました:', error);
        }
    };

    const saveAutoTasks = async () => {
        try {
            await fetch('/api/auto-tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(autoTasks),
            });
        } catch (error) {
            console.error('自動計測タスクの保存に失敗しました:', error);
        }
    };

    const renderAutoTasks = () => {
        autoTaskList.innerHTML = '';

        // --- 検索タイプに応じてタスクをフィルタリング ---
        // activeなボタンがない場合(初期描画時など)を考慮
        const activeButton = searchTypeToggle.querySelector('.toggle-button.active');
        if (!activeButton) return;
        const activeSearchType = activeButton.dataset.type;
        const filteredTasks = autoTasks.filter(task => (task.type || 'normal') === activeSearchType);

        if (filteredTasks.length === 0) {
            autoTaskList.innerHTML = `<li style="padding: 8px 0; color: #6c6c70;">この検索タイプの自動計測タスクはありません。</li>`;
            selectAllContainer.style.display = 'none';
            return;
        }
        selectAllContainer.style.display = 'flex'; // blockからflexに変更
        
        // --- MEOの場合のみグループ化 ---
        if (activeSearchType === 'google') {
            const groupedTasks = filteredTasks.reduce((acc, task) => {
                const groupKey = task.searchLocation || '地点未設定';
                if (!acc[groupKey]) {
                    acc[groupKey] = [];
                }
                acc[groupKey].push(task);
                return acc;
            }, {});

            const sortedGroups = Object.keys(groupedTasks).sort((a, b) => a.localeCompare(b, 'ja'));

            sortedGroups.forEach(groupKey => {
                const tasksInGroup = groupedTasks[groupKey];
                
                const groupHeader = document.createElement('li');
                groupHeader.style.padding = '10px 8px';
                groupHeader.style.backgroundColor = '#f0f0f5';
                groupHeader.style.fontWeight = '600';
                groupHeader.style.marginTop = '10px';
                groupHeader.style.borderRadius = '6px';
                groupHeader.style.display = 'flex';
                groupHeader.style.alignItems = 'center';

                const groupCheckbox = document.createElement('input');
                groupCheckbox.type = 'checkbox';
                groupCheckbox.style.marginRight = '10px';
                groupCheckbox.dataset.groupKey = groupKey;
                groupHeader.appendChild(groupCheckbox);

                const groupLabel = document.createElement('label');
                groupLabel.textContent = groupKey; // この行は変更なし
                groupLabel.style.cursor = 'pointer';
                groupLabel.style.flexGrow = '1'; // この行は変更なし
                groupLabel.onclick = () => groupCheckbox.click();
                groupHeader.appendChild(groupLabel);

                autoTaskList.appendChild(groupHeader);

                const taskUl = document.createElement('ul');
                taskUl.style.listStyle = 'none';
                taskUl.style.paddingLeft = '20px';
                autoTaskList.appendChild(taskUl);

                tasksInGroup.sort((a, b) => (a.keyword || '').localeCompare(b.keyword || '', 'ja'));

                tasksInGroup.forEach(task => {
                    renderTaskItem(task, taskUl, groupKey);
                });

                groupCheckbox.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    const key = e.target.dataset.groupKey; // この行は変更なし
                    taskUl.querySelectorAll(`.auto-task-checkbox[data-group-key="${key}"]`).forEach(cb => { cb.checked = isChecked; });
                });
            });
        } else if (activeSearchType === 'normal') { // HPB通常検索のグループ化を追加
            const groupedTasks = filteredTasks.reduce((acc, task) => {
                const groupKey = task.areaName || 'エリア未設定';
                if (!acc[groupKey]) {
                    acc[groupKey] = [];
                }
                acc[groupKey].push(task);
                return acc;
            }, {});

            const sortedGroups = Object.keys(groupedTasks).sort((a, b) => a.localeCompare(b, 'ja'));

            sortedGroups.forEach(groupKey => {
                const tasksInGroup = groupedTasks[groupKey];
                
                const groupHeader = document.createElement('li');
                groupHeader.style.padding = '10px 8px';
                groupHeader.style.backgroundColor = '#f0f0f5';
                groupHeader.style.fontWeight = '600';
                groupHeader.style.marginTop = '10px';
                groupHeader.style.borderRadius = '6px';
                groupHeader.style.display = 'flex';
                groupHeader.style.alignItems = 'center';

                const groupCheckbox = document.createElement('input');
                groupCheckbox.type = 'checkbox';
                groupCheckbox.style.marginRight = '10px';
                groupCheckbox.dataset.groupKey = groupKey;
                groupHeader.appendChild(groupCheckbox);

                const groupLabel = document.createElement('label');
                groupLabel.textContent = groupKey;
                groupLabel.style.cursor = 'pointer';
                groupLabel.style.flexGrow = '1'; // この行は変更なし
                groupLabel.onclick = () => groupCheckbox.click();
                groupHeader.appendChild(groupLabel);

                autoTaskList.appendChild(groupHeader);

                tasksInGroup.sort((a, b) => (a.serviceKeyword || '').localeCompare(b.serviceKeyword || '', 'ja'));
                
                // --- 修正点1: グループごとの<ul>を作成 ---
                const taskUl = document.createElement('ul');
                taskUl.style.listStyle = 'none';
                taskUl.style.paddingLeft = '0'; // インデントはrenderTaskItem側で調整
                autoTaskList.appendChild(taskUl);

                tasksInGroup.forEach(task => renderTaskItem(task, taskUl, groupKey));

                // --- 修正点2: グループチェックボックスのイベントリスナーを追加 ---
                groupCheckbox.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    const key = e.target.dataset.groupKey;
                    taskUl.querySelectorAll(`.auto-task-checkbox[data-group-key="${key}"]`).forEach(cb => { cb.checked = isChecked; });
                });
            });
        } else if (activeSearchType === 'special') { // HPB特集検索のグループ化を追加
            const groupedTasks = filteredTasks.reduce((acc, task) => {
                // グループキーにはURLを使用し、表示名としてタイトル(featurePageName)またはURLを保持
                const groupKey = task.featurePageUrl;
                const groupDisplayName = task.featurePageName || task.featurePageUrl;
                if (!acc[groupKey]) {
                    acc[groupKey] = { displayName: groupDisplayName, tasks: [] };
                }
                acc[groupKey].tasks.push(task);
                // グループ内で最も新しいタイトルをdisplayNameとして採用
                if (task.featurePageName) {
                    acc[groupKey].displayName = task.featurePageName;
                }
                return acc;
            }, {});

            const sortedGroups = Object.entries(groupedTasks).sort((a, b) => a[1].displayName.localeCompare(b[1].displayName, 'ja'));

            sortedGroups.forEach(([groupKey, groupData]) => {
                const tasksInGroup = groupData.tasks;

                const groupHeader = document.createElement('li');
                groupHeader.style.padding = '10px 8px';
                groupHeader.style.backgroundColor = '#f0f0f5';
                groupHeader.style.fontWeight = '600';
                groupHeader.style.marginTop = '10px';
                groupHeader.style.borderRadius = '6px';
                groupHeader.style.display = 'flex';
                groupHeader.style.alignItems = 'center';

                const groupCheckbox = document.createElement('input');
                groupCheckbox.type = 'checkbox';
                groupCheckbox.style.marginRight = '10px';
                groupCheckbox.dataset.groupKey = groupKey; // グループキーとしてURLを使用
                groupHeader.appendChild(groupCheckbox);

                const groupLabel = document.createElement('label');
                groupLabel.textContent = groupData.displayName; // 表示名を使用
                groupLabel.style.cursor = 'pointer';
                groupLabel.style.flexGrow = '1';
                groupLabel.onclick = () => groupCheckbox.click();
                groupHeader.appendChild(groupLabel);

                autoTaskList.appendChild(groupHeader);

                tasksInGroup.sort((a, b) => (a.salonName || '').localeCompare(b.salonName || '', 'ja'));
                
                const taskUl = document.createElement('ul');
                taskUl.style.listStyle = 'none';
                taskUl.style.paddingLeft = '0';
                autoTaskList.appendChild(taskUl);

                tasksInGroup.forEach(task => renderTaskItem(task, taskUl, groupKey));

                groupCheckbox.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    taskUl.querySelectorAll(`.auto-task-checkbox[data-group-key="${groupKey}"]`).forEach(cb => { cb.checked = isChecked; });
                });
            });
        } else if (activeSearchType === 'seo') { // SEOのグループ化を追加
            const groupedTasks = filteredTasks.reduce((acc, task) => {
                const groupKey = task.url || 'URL未設定';
                if (!acc[groupKey]) {
                    acc[groupKey] = [];
                }
                acc[groupKey].push(task);
                return acc;
            }, {});

            const sortedGroups = Object.keys(groupedTasks).sort((a, b) => a.localeCompare(b, 'ja'));

            sortedGroups.forEach(groupKey => {
                const tasksInGroup = groupedTasks[groupKey];
                
                const groupHeader = document.createElement('li');
                groupHeader.style.padding = '10px 8px';
                groupHeader.style.backgroundColor = '#f0f0f5';
                groupHeader.style.fontWeight = '600';
                groupHeader.style.marginTop = '10px';
                groupHeader.style.borderRadius = '6px';
                groupHeader.style.display = 'flex';
                groupHeader.style.alignItems = 'center';

                const groupCheckbox = document.createElement('input');
                groupCheckbox.type = 'checkbox';
                groupCheckbox.style.marginRight = '10px';
                groupCheckbox.dataset.groupKey = groupKey;
                groupHeader.appendChild(groupCheckbox);

                const groupLabel = document.createElement('label');
                groupLabel.textContent = groupKey;
                groupLabel.style.cursor = 'pointer';
                groupLabel.style.flexGrow = '1';
                groupLabel.onclick = () => groupCheckbox.click();
                groupHeader.appendChild(groupLabel);

                autoTaskList.appendChild(groupHeader);

                tasksInGroup.sort((a, b) => (a.keyword || '').localeCompare(b.keyword || '', 'ja'));
                
                const taskUl = document.createElement('ul');
                taskUl.style.listStyle = 'none';
                taskUl.style.paddingLeft = '0';
                autoTaskList.appendChild(taskUl);

                tasksInGroup.forEach(task => renderTaskItem(task, taskUl, groupKey));

                groupCheckbox.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    taskUl.querySelectorAll(`.auto-task-checkbox[data-group-key="${groupKey}"]`).forEach(cb => { cb.checked = isChecked; });
                });
            });
        } // 以前のelseブロックは、すべての検索タイプがif/else ifで処理されるため到達不能。
          // そのため、このブロックは削除します。
          // もしグループ化しないタスクタイプが将来的に追加される場合は、
          // そのための新しいelse ifブロックを追加する必要があります。
    };

    function renderTaskItem(task, parentElement, groupKey = null) {
        const taskType = task.type || 'normal';

        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '8px 0';
        li.style.borderBottom = '1px solid #eee';
        li.style.wordBreak = 'break-all';

        // グループ化されている場合はインデントを追加
        if (groupKey) {
            li.style.paddingLeft = '20px';
        }

        const taskLabel = document.createElement('label');
        taskLabel.style.display = 'flex';
        taskLabel.style.alignItems = 'center';
        taskLabel.style.flexGrow = '1';
        taskLabel.style.cursor = 'pointer';
        taskLabel.style.marginRight = '10px';
        // グループチェックボックスと連動させるためのイベントを追加
        taskLabel.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') checkbox.click(); });

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('auto-task-checkbox');
        checkbox.value = task.id;
        if (groupKey) {
            checkbox.dataset.groupKey = groupKey;
        }
        checkbox.style.marginRight = '10px';
        
        const taskText = document.createElement('span');
        if (taskType === 'normal') {
            taskText.textContent = `${task.serviceKeyword} - ${task.salonName}`;
        } else if (taskType === 'special') {
            taskText.textContent = `${task.salonName}`; // グループ化されたのでサロン名のみ表示
        } else if (taskType === 'google') {
            taskText.textContent = `${task.keyword} - ${task.salonName}`;
        } else if (taskType === 'seo') {
            taskText.textContent = `${task.keyword} ${task.searchLocation ? `(${task.searchLocation})` : ''}`;
        }

        taskLabel.appendChild(checkbox);
        taskLabel.appendChild(taskText);
        li.appendChild(taskLabel);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = '削除';
        // クラス名を追加して、イベント委譲で捕捉しやすくする
        deleteButton.className = 'button-secondary delete-task-button';
        deleteButton.dataset.taskId = task.id; // data属性にIDを持たせる
        deleteButton.dataset.taskText = taskText.textContent; // 確認メッセージ用にテキストも持たせる
        deleteButton.style.padding = '4px 8px';
        deleteButton.style.fontSize = '12px';
        deleteButton.style.flexShrink = '0';
        li.appendChild(deleteButton);
        parentElement.appendChild(li);
    };

    // --- イベント委譲によるタスク削除 ---
    autoTaskList.addEventListener('click', (event) => {
        const deleteButton = event.target.closest('.delete-task-button');
        if (!deleteButton) return;

        const taskId = deleteButton.dataset.taskId;
        const taskText = deleteButton.dataset.taskText;

        if (confirm(`「${taskText}」を削除しますか？`)) {
            autoTasks = autoTasks.filter(t => t.id !== taskId);
            saveAutoTasks();
            renderAutoTasks();
            fetchAndDisplayAutoHistory();
        }
    });

    addAutoTaskButton.addEventListener('click', () => {
        const activeSearchType = searchTypeToggle.querySelector('.toggle-button.active').dataset.type;
        const salonName = salonNameInput.value.trim();

        let addedTasks = [];
        let existingTasks = [];

        if (activeSearchType === 'normal') {
            // 修正：選択されているoptionのテキストからエリア名を取得するように変更
            const largeArea = largeAreaSelect.selectedIndex > 0 ? largeAreaSelect.options[largeAreaSelect.selectedIndex].value : '';
            const serviceKeywords = keywordInput.value.trim().split(/[\s,、]+/).filter(k => k);

            if (!largeArea) { // 修正：キーワードが空でもエリアさえ選択されていればOKにする
                alert('エリアブロックを入力してください。（キーワードは任意です）');
                return;
            }

            if (!salonName) {
                alert('サロン名を入力してください。');
                return;
            }

            // 修正：選択されているoptionのテキストからエリア名を取得するように変更
            const middleArea = middleAreaSelect.selectedIndex > 0 ? middleAreaSelect.options[middleAreaSelect.selectedIndex].value : '';
            const smallArea = smallAreaSelect.selectedIndex > 0 ? smallAreaSelect.options[smallAreaSelect.selectedIndex].value : '';
            const areaCodes = {};
            if (largeArea) areaCodes.serviceAreaCd = areas[largeArea].code; // 大エリアコード
            if (middleArea) areaCodes.middleAreaCd = areas[largeArea].middleAreas[middleArea].code; // 中エリアコード
            // 小エリアが選択されている場合、そのコードを追加
            if (smallArea) areaCodes.smallAreaCd = areas[largeArea].middleAreas[middleArea].smallAreas[smallArea].code;

            // 表示用のエリア名は、最も詳細なエリア名を使用
            const areaName = smallArea || middleArea || largeArea; 

            // キーワードが空の場合の処理
            if (serviceKeywords.length === 0) {
                serviceKeywords.push(''); // 空のキーワードとして処理を進める
            }

            serviceKeywords.forEach(keyword => {
                const taskId = `${salonName}-${areaName}-${keyword}`;
                if (autoTasks.some(t => t.id === taskId)) {
                    existingTasks.push(keyword);
                } else {
                    autoTasks.push({ id: taskId, type: 'normal', salonName, areaName, areaCodes, serviceKeyword: keyword });
                    addedTasks.push(keyword);
                }
            });
        } else if (activeSearchType === 'special') { // special
            const featureUrl = featurePageUrlInput.value.trim();
            if (!featureUrl) {
                alert('特集ページのURLを入力してください。');
                return;
            }
            if (!salonName) {
                alert('サロン名を入力してください。');
                return;
            }

            const taskId = `${salonName}-${featureUrl}`;
            if (autoTasks.some(t => t.id === taskId)) {
                existingTasks.push(featureUrl);
            } else {
                // featurePageNameは初回計測時にバックエンドで設定される
                autoTasks.push({ id: taskId, type: 'special', salonName, featurePageUrl: featureUrl });
                addedTasks.push(featureUrl);
            }
        } else if (activeSearchType === 'google') { // google
            const searchLocation = document.getElementById('searchLocationInput').value.trim();
            const googleKeyword = document.getElementById('googleKeywordInput').value.trim();
            if (!searchLocation || !googleKeyword) {
                alert('検索地点と検索キーワードを入力してください。');
                return;
            }
            if (!salonName) {
                alert('サロン名を入力してください。');
                return;
            }

            // --- キーワード自動整形機能 ---
            // 検索地点名から「駅」や「市」を取り除く（例: "福山駅" -> "福山"）
            const locationBaseName = searchLocation.replace(/駅|市$/, '').trim();
            let cleanedKeyword = googleKeyword;
            // キーワードが「地名 キーワード」の形式かチェック
            if (locationBaseName && cleanedKeyword.startsWith(locationBaseName)) {
                // 地名部分と、それに続く可能性のあるスペースを削除
                cleanedKeyword = googleKeyword.substring(locationBaseName.length).trim();
                console.log(`キーワードを自動整形しました: "${googleKeyword}" -> "${cleanedKeyword}"`);
            }

            const taskId = `[google]-${salonName}-${searchLocation}-${cleanedKeyword}`;
            if (autoTasks.some(t => t.id === taskId)) {
                existingTasks.push(`[${searchLocation}] ${cleanedKeyword}`);
            } else {
                autoTasks.push({ id: taskId, type: 'google', salonName, searchLocation, keyword: cleanedKeyword });
                addedTasks.push(`[${searchLocation}] ${cleanedKeyword}`);
            }
        } else if (activeSearchType === 'seo') {
            const url = document.getElementById('urlToFindInput').value.trim();
            const keyword = document.getElementById('seoKeywordInput').value.trim();
            const searchLocation = document.getElementById('seoLocationInput').value.trim();

            if (!url || !keyword) {
                alert('計測対象URLと検索キーワードを入力してください。');
                return;
            }
            const taskId = `[seo]-${url}-${keyword}-${searchLocation || ''}`;
            if (autoTasks.some(t => t.id === taskId)) {
                existingTasks.push(`[${url}] ${keyword}`);
            } else {
                autoTasks.push({ id: taskId, type: 'seo', url, keyword, searchLocation: searchLocation || null });
                addedTasks.push(`[${url}] ${keyword}`);
            }
        }

        if (addedTasks.length > 0) {
            saveAutoTasks();
            renderAutoTasks();
            alert(`以下のタスクを自動計測に追加しました:\n- ${addedTasks.join('\n- ')}`);
        }

        if (existingTasks.length > 0) {
            alert(`以下のタスクは既に追加されています:\n- ${existingTasks.join('\n- ')}`);
        }
    });

    selectAllCheckbox.addEventListener('change', (e) => {
        autoTaskList.querySelectorAll('.auto-task-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
        // グループチェックボックスも同期
        const isChecked = e.target.checked;
        autoTaskList.querySelectorAll('input[type="checkbox"][data-group-key]').forEach(groupCb => {
            if (groupCb.checked !== isChecked) {
                groupCb.checked = isChecked;
            }
        });
    });

    manualTriggerButton.addEventListener('click', async () => {
        const selectedCheckboxes = autoTaskList.querySelectorAll('.auto-task-checkbox:checked');
        const selectedTaskIds = new Set(Array.from(selectedCheckboxes).map(cb => cb.value));

        if (selectedTaskIds.size === 0) {
            alert('実行するタスクを少なくとも1つ選択してください。');
            return;
        }

        if (!confirm(`選択した ${selectedTaskIds.size} 件のタスクを今すぐ実行しますか？`)) {
            return;
        }

        // 実行対象のタスクオブジェクトを取得
        const tasksToRun = autoTasks.filter(task => selectedTaskIds.has(task.id));

        setMeasuringState(true); // 計測状態を開始に設定
        manualTriggerButton.textContent = '実行中...';

        // --- ステータス表示の準備 ---
        resultArea.innerHTML = ''; // 結果エリアをクリア
        const overallStatusContainer = document.createElement('div');
        overallStatusContainer.id = 'overallStatus';
        overallStatusContainer.style.padding = '10px';
        overallStatusContainer.style.marginBottom = '15px';
        overallStatusContainer.style.fontWeight = '500';
        resultArea.appendChild(overallStatusContainer);

        overallStatusContainer.textContent = `選択された ${selectedTaskIds.size} 件のタスクを実行します...`;

        // --- 所要時間計測開始 ---
        const startTime = performance.now();
        let timerInterval = null;

        // --- 経過時間表示タイマーを開始 ---
        timerInterval = setInterval(() => {
            const elapsedTotalSeconds = Math.floor((performance.now() - startTime) / 1000);
            const minutes = Math.floor(elapsedTotalSeconds / 60);
            const seconds = elapsedTotalSeconds % 60;
            const durationString = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
            const currentText = overallStatusContainer.textContent;
            // 最後の括弧部分を時間表示で置き換える
            const baseText = currentText.replace(/\s*\([^)]*\)$/, '');
            if (baseText && !baseText.includes('完了')) { // 計測完了メッセージには追記しない
                overallStatusContainer.textContent = `${baseText} (経過時間: ${durationString})`;
            }
        }, 1000);

        // --- 汎用的なストリーム処理関数 ---
        const processStream = (taskIds) => { // この関数は1回だけ呼び出されるように変更
            if (taskIds.length === 0) {
                return Promise.resolve();
            }

            // EventSourceはPOSTリクエストのbodyを直接サポートしないため、fetch APIで代用
            return new Promise(async (resolve, reject) => {
                try {
                    const response = await fetch('/api/run-tasks-manually', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ task_ids: taskIds })
                    });

                    if (!response.body) {
                        throw new Error('Response body is missing');
                    }

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();

                    const processText = ({ done, value }) => {
                        if (done) {
                            resolve();
                            return;
                        }

                        const chunk = decoder.decode(value, { stream: true });
                        // SSEは "data: {...}\n\n" の形式で送られてくるので、それで分割
                        const lines = chunk.split('\n\n');

                        lines.forEach(line => {
                            if (line.startsWith('data: ')) {
                                const jsonData = line.substring(6);
                                if (!jsonData) return;

                                const data = JSON.parse(jsonData);

                                if (data.error) {
                                    const errorContainer = document.createElement('div');
                                    errorContainer.innerHTML = `<p style="color: red;">エラー: ${escapeHtml(data.error)}</p>`;
                                    resultArea.appendChild(errorContainer);
                                    reject(new Error(data.error));
                                    return;
                                }

                                if (data.progress) {
                                    const { current, total, task } = data.progress;

                                    // --- 全体の進捗状況を更新 ---
                                    let taskNameForStatus = '';
                                    if (task.type === 'special') {
                                        taskNameForStatus = task.featurePageName || task.featurePageUrl;
                                    } else if (task.type === 'google') {
                                        taskNameForStatus = `[${task.searchLocation}] ${task.keyword}`;
                                    } else if (task.type === 'seo') {
                                        taskNameForStatus = `[${task.url}] ${task.keyword}`;
                                    } else { // normal or default
                                        taskNameForStatus = `[${task.areaName}] ${task.serviceKeyword}`;
                                    }
                                    
                                    const overallStatusContainer = document.getElementById('overallStatus');
                                    if (overallStatusContainer) {
                                        overallStatusContainer.textContent = `${current} / ${total} 件目: 「${taskNameForStatus}」を計測中... `; // 末尾にスペース
                                    }                        
                                    if (task.type === 'google') {
                                        // MEOの場合
                                        const taskId = task.id;
                                        const fullKeyword = `[${task.searchLocation}] ${task.keyword}`;
                                        const taskContainer = document.createElement('div');
                                        taskContainer.id = `task-container-${taskId}`;
                                        taskContainer.style.borderBottom = '1px solid #e5e5e7';
                                        taskContainer.style.paddingBottom = '15px';
                                        taskContainer.style.marginBottom = '15px';
                                        taskContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${fullKeyword}」</h4><p>計測を開始します...</p>`;
                                        resultArea.appendChild(taskContainer);
                                    } else if (task.type === 'seo') {
                                        // SEOの場合
                                        const taskId = task.id;
                                        const fullKeyword = `[${task.url}] ${task.keyword}`;
                                        const taskContainer = document.createElement('div');
                                        taskContainer.id = `task-container-${taskId}`;
                                        taskContainer.style.borderBottom = '1px solid #e5e5e7';
                                        taskContainer.style.paddingBottom = '15px';
                                        taskContainer.style.marginBottom = '15px';
                                        taskContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${fullKeyword}」</h4><p>計測を開始します...</p>`;
                                        resultArea.appendChild(taskContainer);
                                    } else {
                                        const taskId = task.id;
                                        const fullKeyword = `[${task.areaName}] ${task.serviceKeyword}`;
                                        const taskContainer = document.createElement('div');
                                        taskContainer.id = `task-container-${taskId}`;
                                        taskContainer.style.borderBottom = '1px solid #e5e5e7';
                                        taskContainer.style.paddingBottom = '15px';
                                        taskContainer.style.marginBottom = '15px';
                                        taskContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${fullKeyword}」</h4><p>計測を開始します...</p>`;
                                        resultArea.appendChild(taskContainer);
                                    }
                                }

                                if (data.status) {
                                    // statusイベントは特定のタスクIDに紐付かない場合があるため、最後のコンテナを更新
                                    const lastContainer = resultArea.querySelector('div:last-of-type');
                                    if (lastContainer) {
                                        lastContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${escapeHtml(data.task_name)}」</h4><p>${escapeHtml(data.status)}</p>`;
                                    }
                                }

                                if (data.result) {
                                    const { rank, total_count, task_name, task_id } = data.result;
                                    let taskContainer = document.getElementById(`task-container-${task_id}`);
                                    
                                    // --- 堅牢性の向上: コンテナが見つからない場合は新規作成 ---
                                    if (!taskContainer) {
                                        console.warn(`Task container for ${task_id} not found. Creating a new one.`);
                                        taskContainer = document.createElement('div');
                                        taskContainer.id = `task-container-${task_id}`;
                                        resultArea.appendChild(taskContainer);
                                    }
                                    const totalCountHtml = (total_count !== undefined) ? `<p style="font-size: 14px; color: #6c6c70; margin-bottom: 10px;">検索結果総数: <strong style="color: #1c1c1e;">${total_count}</strong> 件</p>` : '';
                                    
                                    const resultMessageHtml = `<p style="margin: 0; font-size: 18px; font-weight: bold;"><span style="color: #007aff; font-size: 1.3em;">${rank}</span> 位</p>`;
                                    taskContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${escapeHtml(task_name)}」</h4>${totalCountHtml}${resultMessageHtml}`;
                                }

                                if (data.final_status) {
                                    // ストリームの終端なので、ここでループを抜ける
                                    return;
                                }
                            }
                        });
                        // 次のデータを読み込む
                        reader.read().then(processText);
                    };

                    reader.read().then(processText);

                } catch (err) {
                    console.error("EventSource failed:", err);
                    const errorContainer = document.createElement('div');
                    errorContainer.innerHTML = `<p style="color: red;">サーバーとの接続に失敗しました。</p>`; // このメッセージは固定なのでエスケープ不要
                    resultArea.appendChild(errorContainer);
                    reject(err);
                }
            });
        };

        try {
            // --- 修正点: 全てのタスクIDを1つのリクエストにまとめて送信 ---
            const allTaskIds = Array.from(selectedTaskIds);
            const promises = [processStream(allTaskIds)];
            // すべてのストリーム処理が終わるのを待つ
            await Promise.all(promises);
            // --- タイマーを停止 ---
            clearInterval(timerInterval);
            // --- 所要時間計測終了 ---
            const endTime = performance.now();
            const elapsedTotalSeconds = Math.floor((endTime - startTime) / 1000);
            const minutes = Math.floor(elapsedTotalSeconds / 60);
            const seconds = elapsedTotalSeconds % 60;
            const durationString = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
            overallStatusContainer.textContent = `すべての計測が完了しました。（${selectedTaskIds.size}件 / 所要時間: ${durationString}）`;
        } catch (error) {
            console.error('手動実行中にエラーが発生しました:', error);
            const endTime = performance.now();
            const elapsedTotalSeconds = Math.floor((endTime - startTime) / 1000);
            const minutes = Math.floor(elapsedTotalSeconds / 60);
            const seconds = elapsedTotalSeconds % 60;
            const durationString = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
            // --- タイマーを停止 ---
            clearInterval(timerInterval);
            overallStatusContainer.textContent = `計測中にエラーが発生しました。（所要時間: ${durationString}）詳細はコンソールを確認してください。`;
        } finally {
            // 全ての処理が終わったらボタンを元に戻す
            setMeasuringState(false);
            manualTriggerButton.textContent = '選択したタスクを実行';
            fetchAndDisplayAutoHistory(); // グラフを最新の状態に更新
        }
    });

    // --- 表の表示/非表示状態を管理するヘルパー関数 ---
    const HIDDEN_TABLES_STORAGE_KEY = 'hiddenTablesState';

    function getHiddenTablesState() {
        try {
            const state = localStorage.getItem(HIDDEN_TABLES_STORAGE_KEY);
            return state ? JSON.parse(state) : {};
        } catch (e) {
            console.error("Failed to parse hidden tables state:", e);
            return {};
        }
    }

    function saveHiddenTablesState(state) {
        localStorage.setItem(HIDDEN_TABLES_STORAGE_KEY, JSON.stringify(state));
    }

    // --- 全ての表の表示/非表示を切り替える ---
    toggleAllTablesButton.addEventListener('click', () => {
        const allTableContainers = document.querySelectorAll('.sticky-table-container');
        if (allTableContainers.length === 0) return;

        // 現在のボタンの状態で、隠すか表示するかを判断
        const shouldHide = toggleAllTablesButton.textContent === 'すべての表を隠す';
        
        const currentState = getHiddenTablesState();

        document.querySelectorAll('.graph-wrapper').forEach(wrapper => {
            const tableContainer = wrapper.querySelector('.sticky-table-container');
            const groupKey = wrapper.dataset.groupKey;

            if (tableContainer) tableContainer.style.display = shouldHide ? 'none' : '';
            currentState[groupKey] = shouldHide;
        });

        saveHiddenTablesState(currentState);
        toggleAllTablesButton.textContent = shouldHide ? 'すべての表を表示' : 'すべての表を隠す';
    });
    // --- ここまでヘルパー関数 ---

    const fetchAndDisplayAutoHistory = async () => {
        try {
            const response = await fetch(`/api/auto-history?_=${new Date().getTime()}`);
            const historyData = await response.json();

            const autoHistoryContainer = document.getElementById('autoHistoryContainer');
            const autoHistoryGraphs = document.getElementById('autoHistoryGraphs');

            if (!historyData || historyData.length === 0) {
                autoHistoryContainer.style.display = 'none';
                noAutoHistoryMessage.style.display = 'block';
                if (autoHistoryGraphs) autoHistoryGraphs.innerHTML = ''; // データがない場合はコンテナをクリア
                return;
            }

            autoHistoryContainer.style.display = 'block';
            noAutoHistoryMessage.style.display = 'none';

            // グラフを描画する前に、コンテナの中身を一度空にする
            autoHistoryGraphs.innerHTML = '';

            // --- 検索タイプに応じて履歴をフィルタリング＆グループ化 ---
            const activeSearchType = searchTypeToggle.querySelector('.toggle-button.active').dataset.type;
            const filteredHistory = historyData.filter(item => (item.task.type || 'normal') === activeSearchType);

            if (filteredHistory.length === 0) {
                autoHistoryContainer.style.display = 'none';
                noAutoHistoryMessage.style.display = 'block';
                noAutoHistoryMessage.textContent = 'この検索タイプの履歴はありません。';
                return;
            }

            const groupedHistory = filteredHistory.reduce((acc, historyItem) => {
                let groupKey;
                if (activeSearchType === 'normal') {
                    groupKey = `${historyItem.task.areaName} - ${historyItem.task.salonName}`;
                } else if (activeSearchType === 'special') { // special
                    // 特集ページは、ページのタイトルまたはURLのみでグループ化する
                    groupKey = historyItem.task.featurePageName || historyItem.task.featurePageUrl;
                } else if (activeSearchType === 'google') {
                    // MEOは、検索地点とサロン名でグループ化する
                    groupKey = `${historyItem.task.searchLocation} - ${historyItem.task.salonName}`;
                } else if (activeSearchType === 'seo') {
                    groupKey = historyItem.task.url;
                }
                
                if (!acc[groupKey]) { 
                    acc[groupKey] = []; 
                }
                acc[groupKey].push(historyItem);
                return acc;
            }, {});

            // --- グラフの表示順をグループキー（タイトル）のあいうえお順にソート ---
            const sortedGroupedHistory = Object.entries(groupedHistory).sort((a, b) => a[0].localeCompare(b[0], 'ja'));

            // --- 保存された順序でソートするロジックを追加 ---
            const savedOrder = JSON.parse(localStorage.getItem(`graphOrder_${activeSearchType}`) || '[]');
            const sortedWithSavedOrder = Object.entries(groupedHistory).sort((a, b) => {
                const indexA = savedOrder.indexOf(a[0]);
                const indexB = savedOrder.indexOf(b[0]);

                if (indexA !== -1 && indexB !== -1) {
                    return indexA - indexB; // 両方とも保存されていればその順
                } else if (indexA !== -1) {
                    return -1; // Aだけ保存されていればAが先
                } else if (indexB !== -1) {
                    return 1; // Bだけ保存されていればBが先
                }
                return a[0].localeCompare(b[0], 'ja'); // どちらも保存されていなければ名前順
            });

            // --- 全体ボタンの初期状態を設定 ---
            // 1つでも表示されている表があれば「すべて隠す」、すべて隠れていれば「すべて表示」
            const isAnyTableVisible = sortedWithSavedOrder.some(([groupKey]) => {
                const hiddenState = getHiddenTablesState();
                // hiddenStateにキーがない、または値がfalseの場合に表示されていると判断
                return !hiddenState[groupKey];
            });

            if (sortedWithSavedOrder.length > 0) {
                toggleAllTablesButton.style.display = 'inline-flex';
                toggleAllTablesButton.textContent = isAnyTableVisible ? 'すべての表を隠す' : 'すべての表を表示';
            } else {
                toggleAllTablesButton.style.display = 'none';
            }
            // 表の表示状態を読み込む
            const hiddenTablesState = getHiddenTablesState();

            sortedWithSavedOrder.forEach(([groupKey, groupData]) => {
                // --- 特定のサロンをグラフ・表から除外するフィルタリング ---
                const exclusionList = {
                    "広島市中区でまつげパーマが人気のまつげサロン": ["elua 横川店", "elua 緑井店"]
                };

                if (exclusionList[groupKey]) {
                    groupData = groupData.filter(taskData => 
                        !exclusionList[groupKey].includes(taskData.task.salonName)
                    );
                }
                const graphWrapper = document.createElement('div');
                graphWrapper.className = 'graph-wrapper';
                graphWrapper.dataset.groupKey = groupKey;
                graphWrapper.style.position = 'relative'; // グラフのツールチップ表示に必要
                graphWrapper.style.height = 'auto'; // 高さを自動調整に変更
                graphWrapper.style.marginBottom = '40px';

                const headerContainer = document.createElement('div');
                headerContainer.style.display = 'flex';
                headerContainer.style.justifyContent = 'space-between';
                headerContainer.style.alignItems = 'center';
                headerContainer.style.borderBottom = '1px solid #e5e5e7';
                headerContainer.style.paddingBottom = '8px';
                headerContainer.style.marginBottom = '15px';

                const header = document.createElement('h5');
                header.textContent = groupKey;
                header.style.fontSize = '16px';
                header.style.fontWeight = '600';
                header.style.margin = 0; // h5のデフォルトマージンをリセット
                headerContainer.appendChild(header);

                // --- 並び替えボタンを追加 ---
                const controls = document.createElement('div');
                controls.className = 'graph-controls';
                const upButton = document.createElement('button');
                upButton.textContent = '↑';
                upButton.onclick = () => moveGraph(graphWrapper, 'up');
                const downButton = document.createElement('button');
                downButton.textContent = '↓';
                downButton.onclick = () => moveGraph(graphWrapper, 'down');
                
                const excelButton = document.createElement('button');
                excelButton.textContent = 'Excel出力';
                excelButton.className = 'excel-button'; // スタイル適用のためクラス追加
                excelButton.onclick = (e) => exportToExcel(e.target, groupKey, groupData, activeSearchType);

                controls.appendChild(upButton);
                controls.appendChild(downButton);
                controls.appendChild(excelButton);
                headerContainer.appendChild(controls);

                graphWrapper.appendChild(headerContainer);

                const canvasContainer = document.createElement('div'); // canvasを囲むdivを追加
                canvasContainer.style.height = '220px'; // グラフの高さはここで指定

                const canvas = document.createElement('canvas');
                canvasContainer.appendChild(canvas); // canvasをコンテナに入れる
                graphWrapper.appendChild(canvasContainer); // コンテナをラッパーに入れる
                autoHistoryGraphs.appendChild(graphWrapper);

                const allDates = new Set();
                groupData.forEach(task => task.log.forEach(entry => allDates.add(entry.date)));
                const sortedLabels = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
                
                // --- 凡例を「あいうえお順」にソート ---
                groupData.sort((a, b) => {
                    let labelA = '';
                    let labelB = '';
                    if (activeSearchType === 'normal') {
                        labelA = a.task.serviceKeyword;
                        labelB = b.task.serviceKeyword;
                    } else if (activeSearchType === 'google') {
                        labelA = a.task.keyword;
                        labelB = b.task.keyword;
                    } else if (activeSearchType === 'seo') {
                        labelA = a.task.keyword;
                        labelB = b.task.keyword;
                    }
                    return labelA.localeCompare(labelB, 'ja');
                });

                // groupData（タスクのリスト）から、グラフ用のデータセットを作成します
                const datasets = groupData.map((taskData, index) => {
                    // 日付をキーとして、rankとscreenshotを持つオブジェクトをMapに保存
                    const dataMap = new Map(taskData.log.map(entry => [entry.date, { rank: entry.rank, screenshot: entry.screenshot }]));
                    const dataForChart = sortedLabels.map((date, dateIndex) => {
                        const entry = dataMap.get(date);
                        if (entry !== undefined) {
                            // originalRankに加えてscreenshotのパスもrawデータに含める
                            return { x: date, y: convertRankToY(entry.rank), originalRank: entry.rank, screenshot: entry.screenshot };
                        }
                        return { x: date, y: NaN }; // nullの代わりにNaNを使用
                    });

                    let labelText = taskData.task.salonName; // デフォルト
                    if (activeSearchType === 'normal') {
                        labelText = taskData.task.serviceKeyword;
                    } else if (activeSearchType === 'special') {
                        // 特集ページの場合、同じグラフに複数のサロンが表示される可能性があるため、サロン名を表示
                        labelText = taskData.task.salonName;
                    } else if (activeSearchType === 'google') {
                        labelText = taskData.task.keyword;
                    } else if (activeSearchType === 'seo') {
                        labelText = taskData.task.keyword;
                    }

                    return {
                        // ラベルを検索タイプによって変更
                        label: labelText,
                        data: dataForChart,
                        borderColor: CHART_COLORS[index % CHART_COLORS.length],
                        tension: 0.1,
                        spanGaps: true // データがNaNの場合に線を途切れさせる
                    };
                });

                new Chart(canvas, {
                    type: 'line', data: { labels: sortedLabels, datasets },
                    options: {
                        layout: {
                            padding: { top: 0 } // 凡例の高さに応じて自動でパディングが調整されるようにする
                        },
                        maintainAspectRatio: false,
                        parsing: {
                            xAxisKey: 'x',
                            yAxisKey: 'y'
                        },
                        scales: {
                            x: { // x軸の設定を追加
                                ticks: {
                                    callback: function(value, index, ticks) {
                                        const label = this.getLabelForValue(value); // 'YYYY/MM/DD'
                                        const date = new Date(label);
                                        return `${date.getMonth() + 1}/${date.getDate()}`;
                                    }
                                }
                            },
                            y: {
                                type: 'linear', // 線形スケール
                                reverse: false, // Y座標は大きい方が上
                                min: 1.4, // 圏外(y=1.5)の下の余白を調整
                                max: 6.1, // 1位(y=6)の上の余白を狭める
                                ticks: {
                                    callback: function(value) {
                                        switch (value) {
                                            case 6: return '1位';
                                            case 5: return '5位';
                                            case 4: return '20位';
                                            case 3: return '50位';
                                            case 2: return '100位';
                                            case 1.5: return '圏外';
                                            default: return null;
                                        }
                                    }
                                },
                                afterBuildTicks: (axis) => {
                                    axis.ticks = [
                                        { value: 6 }, { value: 5 }, { value: 4 }, { value: 3 }, { value: 2 }, { value: 1.5 }
                                    ];
                                },
                                grid: {
                                    drawBorder: false, // 軸の境界線を非表示にする
                                    color: function(context) {
                                        // '圏外' (y=1) のグリッド線だけを非表示にする
                                        if (context.tick.value === 1.5) {
                                            return 'transparent';
                                        }
                                        return Chart.defaults.borderColor; // 他の線はデフォルト色
                                    }
                                },
                            }
                        },
                        plugins: {
                            legend: {
                                position: 'top',
                                align: 'start'
                            },
                            tooltip: {
                                callbacks: {
                                    title: function(tooltipItems) {
                                        // ツールチップのタイトルも M/D 形式にする
                                        const date = new Date(tooltipItems[0].label);
                                        return `${date.getMonth() + 1}/${date.getDate()}`;
                                    },
                                    label: function(context) {
                                        const rank = context.raw.originalRank;
                                        return `${context.dataset.label}: ${rank === '圏外' ? '圏外' : rank + '位'}`;
                                    }
                                }
                            }
                        }
                    },
                    // --- クリックイベントを追加 ---
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const firstElement = elements[0];
                            const datasetIndex = firstElement.datasetIndex;
                            const dataIndex = firstElement.index;
                            const chartData = event.chart.data.datasets[datasetIndex].data[dataIndex];
                            
                            const screenshotPath = chartData.screenshot;

                            if (screenshotPath) {
                                // 新しいタブでスクリーンショット画像を開く
                                window.open(screenshotPath, '_blank');
                            } else {
                                alert('この計測データにはスクリーンショットがありません。');
                            }
                        }
                    }
                });

                // --- HPB通常検索の場合のみ、表形式の履歴も表示 ---
                if (activeSearchType === 'normal' || activeSearchType === 'special' || activeSearchType === 'google') {
                    const tableContainer = document.createElement('div');
                    tableContainer.className = 'sticky-table-container'; // クラスを適用
                    tableContainer.style.marginTop = '20px';

                    // --- 保存された表示状態を適用 ---
                    const isHidden = hiddenTablesState[groupKey] || false;
                    if (isHidden) tableContainer.style.display = 'none';

                    const table = document.createElement('table');
                    table.className = 'sticky-table'; // クラスを適用
                    table.style.width = '100%';
                    table.style.borderCollapse = 'collapse';
                    table.style.fontSize = '13px';

                    // ヘッダー行
                    const thead = document.createElement('thead');
                    const headerRow = document.createElement('tr');
                    const thKeyword = document.createElement('th');

                            // --- 検索タイプに応じてヘッダーラベルを変更 ---
                            if (activeSearchType === 'special') {
                                thKeyword.textContent = 'サロン名';
                            } else { // normal, google
                                thKeyword.textContent = 'キーワード';
                            }
                            // --- ここまで変更 ---

                    thKeyword.style.padding = '8px';
                    thKeyword.style.border = '1px solid #ddd';
                    thKeyword.style.backgroundColor = '#f8f8f8';
                    thKeyword.style.textAlign = 'left';
                    thKeyword.style.minWidth = '100px';
                    headerRow.appendChild(thKeyword);

                    sortedLabels.forEach(date => {
                        const th = document.createElement('th');
                        const d = new Date(date);
                        th.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
                        th.style.padding = '8px';
                        th.style.border = '1px solid #ddd';
                        th.style.backgroundColor = '#f8f8f8';
                        th.style.minWidth = '50px';
                        headerRow.appendChild(th);
                    });
                    thead.appendChild(headerRow);
                    table.appendChild(thead);

                    // データ行
                    const tbody = document.createElement('tbody');
                    groupData.forEach((taskData, rowIndex) => {
                        const dataMap = new Map(taskData.log.map(entry => [entry.date, { rank: entry.rank, screenshot: entry.screenshot }]));
                        const row = document.createElement('tr');

                        // --- 縞模様のスタイルを適用 ---
                        if (rowIndex % 2 === 1) { // 奇数行に背景色を設定
                            row.style.backgroundColor = '#f0f0f5'; // 固定列の背景色と合わせる
                        }

                        const tdKeyword = document.createElement('td');
                                // --- 検索タイプに応じて行ラベルを変更 ---
                                if (activeSearchType === 'special') {
                                    tdKeyword.textContent = taskData.task.salonName;
                                } else if (activeSearchType === 'google') {
                                    tdKeyword.textContent = taskData.task.keyword;
                                } else { // normal
                                    tdKeyword.textContent = taskData.task.serviceKeyword;
                                }
                                // --- ここまで変更 ---

                        tdKeyword.style.padding = '8px';
                        tdKeyword.style.border = '1px solid #ddd';
                        tdKeyword.style.fontWeight = '500';
                        if (rowIndex % 2 === 1) tdKeyword.style.backgroundColor = '#f0f0f5';
                        row.appendChild(tdKeyword);

                        sortedLabels.forEach((date, index) => {
                            const td = document.createElement('td');
                            const currentEntry = dataMap.get(date);
                            const currentRank = currentEntry ? currentEntry.rank : null;

                            let rankHtml = currentRank !== null ? String(currentRank) : '-';

                            // 2日目以降のデータで、かつ当日のデータがある場合のみ比較
                            if (index > 0 && currentRank !== null) {
                                const prevDate = sortedLabels[index - 1];
                                const prevEntry = dataMap.get(prevDate);
                                const prevRank = prevEntry ? prevEntry.rank : null;

                                const getNumericRank = (rank) => {
                                    if (rank === null || rank === '-') return Infinity; // データなし
                                    if (rank === '圏外' || typeof rank !== 'number') return 101; // 圏外は101位として扱う
                                    return rank;
                                };
                                const numericCurrent = getNumericRank(currentRank);
                                const numericPrev = getNumericRank(prevRank);

                                if (numericPrev !== Infinity) { // 前日のデータがある場合のみ矢印を表示
                                    const diff = numericPrev - numericCurrent;
                                    let color = '#1c1c1e'; // デフォルト色
                                    let fontWeight = 'normal';
                                    let arrow = '';

                                    if (diff >= 5)      { color = '#34c759'; fontWeight = 'bold'; arrow = '↑'; }  // 急上昇
                                    else if (diff > 0)  { color = '#007aff'; arrow = '↗'; }  // 上昇
                                    else if (diff === 0)  { color = '#8e8e93'; arrow = '→'; }  // 横ばい
                                    else if (diff > -5) { color = '#ff9500'; arrow = '↘'; }  // 下降
                                    else                { color = '#ff3b30'; fontWeight = 'bold'; arrow = '↓'; }  // 急下降

                                    if (arrow) {
                                        rankHtml = `<span style="color: ${color}; font-weight: ${fontWeight};">` +
                                                   `<span style="display: inline-block; width: 1.2em; text-align: right; margin-right: 2px;">${arrow}</span>` +
                                                   `${currentRank}` +
                                                   `</span>`;
                                    }
                                }
                            }

                            td.innerHTML = rankHtml;
                            td.style.padding = '8px';
                            td.style.border = '1px solid #ddd';
                            td.style.textAlign = 'center';
                            if (currentEntry && currentEntry.screenshot) {
                                td.style.cursor = 'pointer';
                                td.style.textDecoration = 'underline';
                                td.onclick = () => window.open(currentEntry.screenshot, '_blank');
                            }
                            row.appendChild(td);
                        });
                        tbody.appendChild(row);
                    });
                    table.appendChild(tbody);
                    tableContainer.appendChild(table);
                    graphWrapper.appendChild(tableContainer);
                }
            });
        } catch (error) {
            console.error('自動計測履歴の読み込みに失敗しました:', error);
        }
    };

    // --- グラフ並び替えと順序保存の関数 ---
    function moveGraph(wrapper, direction) {
        const parent = wrapper.parentNode;
        if (direction === 'up') {
            const prevSibling = wrapper.previousElementSibling;
            if (prevSibling) {
                parent.insertBefore(wrapper, prevSibling);
            }
        } else if (direction === 'down') {
            const nextSibling = wrapper.nextElementSibling;
            if (nextSibling) {
                parent.insertBefore(nextSibling, wrapper);
            }
        }
        saveGraphOrder();
    }

    function saveGraphOrder() {
        const activeSearchType = searchTypeToggle.querySelector('.toggle-button.active').dataset.type;
        const wrappers = document.querySelectorAll('#autoHistoryGraphs .graph-wrapper');
        const newOrder = Array.from(wrappers).map(w => w.dataset.groupKey);
        localStorage.setItem(`graphOrder_${activeSearchType}`, JSON.stringify(newOrder));
    }

    // --- ページ読み込み時にタスク一覧の表示状態を復元 ---
    const taskListVisible = localStorage.getItem('taskListVisible');
    if (taskListVisible === 'true') {
        autoTaskListContent.style.display = 'block'; // 明示的に表示がtrueなら表示
        taskListToggleIcon.style.transform = 'rotate(180deg)'; // アイコンも開いた状態に
    } else if (taskListVisible === 'false') { // 明示的に非表示がtrueなら非表示
        autoTaskListContent.style.display = 'none';
        taskListToggleIcon.style.transform = 'rotate(0deg)'; // アイコンは閉じた状態に
    } else { // localStorageに設定がない場合（初回アクセスなど）、デフォルトで表示する
        autoTaskListContent.style.display = 'block';
        taskListToggleIcon.style.transform = 'rotate(180deg)'; // アイコンは開いた状態に
    }
    fetchSchedule();

    // --- 印刷ボタンのイベントリスナー ---
    printButton.addEventListener('click', () => {
        window.print();
    });
    fetchAutoTasks();
    fetchAndDisplayAutoHistory();
}); // End of main DOMContentLoaded listener