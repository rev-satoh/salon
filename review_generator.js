/**
 * フォームの質問を動的に生成する関数
 * @param {Array} questions - 質問オブジェクトの配列
 * @param {HTMLElement} formContainer - フォームを挿入するコンテナ要素
 */
function buildForm(questions, formContainer) {
    questions.forEach((q, index) => {
        const group = document.createElement('div');
        group.className = 'form-group';

        const label = document.createElement('label');
        label.htmlFor = q.id; // ラベルと特定の入力要素を関連付けるため、IDはそのまま
        label.textContent = `${index + 1}. ${q.label}`; // ラベルテキストに番号を追加
        group.appendChild(label);

        if (q.type === 'radio' || q.type === 'checkbox') {
            const optionGroup = document.createElement('div');
            optionGroup.className = q.type === 'radio' ? 'radio-group' : 'checkbox-group';
            optionGroup.id = q.id;

            q.options.forEach((option, index) => {
                const inputId = `${q.id}-${index}`;
                const input = document.createElement('input');
                input.type = q.type;
                input.name = q.id;
                input.id = inputId;
                input.value = option;

                const optionLabel = document.createElement('label');
                optionLabel.htmlFor = inputId;
                optionLabel.textContent = option;

                optionGroup.appendChild(input);
                optionGroup.appendChild(optionLabel);
            });
            group.appendChild(optionGroup);
        } else if (q.type === 'text') {
            const input = document.createElement('input');
            input.type = 'text';
            input.id = q.id;
            input.name = q.id;
            input.placeholder = q.placeholder || '';
            group.appendChild(input);
        } else if (q.type === 'slider') {
            const sliderContainer = document.createElement('div');
            sliderContainer.className = 'slider-container';

            const input = document.createElement('input');
            input.type = 'range';
            input.id = q.id;
            input.name = q.id;
            input.min = q.min || 100;
            input.max = q.max || 400;
            input.step = q.step || 50;
            input.value = q.defaultValue || 250;

            const valueDisplay = document.createElement('span');
            valueDisplay.className = 'slider-value';
            valueDisplay.textContent = `半角${input.value}文字`;
            input.oninput = () => { valueDisplay.textContent = `半角${input.value}文字`; };

            sliderContainer.appendChild(input);
            sliderContainer.appendChild(valueDisplay);
            group.appendChild(sliderContainer);
        }
        formContainer.appendChild(group);
    });
}

/**
 * フォームからデータを収集する関数
 * @param {Array} questions - 質問オブジェクトの配列
 * @returns {Object} - 収集したデータ
 */
function collectFormData(questions) {
    const data = {};
    questions.forEach(q => {
        if (q.type === 'radio') {
            const selected = document.querySelector(`input[name="${q.id}"]:checked`);
            data[q.id] = selected ? selected.value : '';
        } else if (q.type === 'checkbox') {
            const selected = document.querySelectorAll(`input[name="${q.id}"]:checked`);
            data[q.id] = Array.from(selected).map(cb => cb.value);
        } else if (q.type === 'text') {
            data[q.id] = document.getElementById(q.id).value.trim();
        } else if (q.type === 'slider') {
            data[q.id] = document.getElementById(q.id).value;
        }
    });
    return data;
}

document.addEventListener('DOMContentLoaded', () => {
    const main = document.querySelector('main');
    const generateButton = document.getElementById('generateButton');
    const resultContainer = document.getElementById('resultContainer');
    const reviewResult = document.getElementById('reviewResult');
    const formErrorMessage = document.getElementById('form-error-message');
    const resultNotice = document.getElementById('result-notice');
    const resultErrorMessage = document.getElementById('result-error-message');

    // --- APIエンドポイントの設定 ---
    // 本番環境のURL（RenderでデプロイしたバックエンドサーバーのURL）
    const API_BASE_URL_PROD = 'https://kuchikomi-api.onrender.com'; // ★★★ 必ずご自身のURLに書き換えてください！ ★★★
    // 開発環境のURL
    const API_BASE_URL_DEV = 'http://localhost:5001';
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const apiEndpoint = (isDevelopment ? API_BASE_URL_DEV : API_BASE_URL_PROD) + '/generate-review';

    /**
     * テキストエリアの高さを内容に応じて自動調整する関数
     * @param {HTMLTextAreaElement} textarea - 対象のテキストエリア
     */
    function autoResizeTextarea(textarea) {
        textarea.style.height = 'auto'; // 一旦高さをリセットしてscrollHeightを正しく計算
        textarea.style.height = (textarea.scrollHeight) + 'px'; // scrollHeightを使って高さを設定
    }

    // 読み取り専用テキストエリアがフォーカスされたら、即座にフォーカスを外す
    reviewResult.addEventListener('focus', (event) => {
        event.target.blur();
    });

    /**
     * フォームのエラーメッセージを表示する
     * @param {string} message 表示するメッセージ
     */
    function showFormError(message) {
        formErrorMessage.textContent = message;
        formErrorMessage.style.display = 'block';
    }

    function hideFormError() {
        formErrorMessage.style.display = 'none';
    }

    // --- ページの初期化処理 ---
    // URLのハッシュ（#）部分から設定IDを取得する方式に変更
    // これによりGitHub Pagesのようなサブディレクトリ環境でも正しく動作する
    const hash = window.location.hash; // 例: #/ksl-h
    const type = hash.startsWith('#/') ? hash.substring(2) : ''; // 先頭の "#/" を取り除く

    // typeパラメータがない場合はエラーメッセージを表示して処理を中断
    if (!type) {
        main.innerHTML = `<div class="card"><p>エラー: 店舗が指定されていません。URLを /店舗ID の形式で指定してください。</p></div>`;
        return;
    }

    const currentConfig = configs[type];

    if (!currentConfig) {
        main.innerHTML = `<div class="card"><p>エラー: 指定された店舗ID「${type}」の設定が見つかりません。URLが正しいか確認してください。</p></div>`;
        return; // 設定がなければここで処理を終了
    }

    // ページタイトルと見出しを設定
    document.title = currentConfig.pageTitle;
    main.querySelector('p').textContent = currentConfig.description;

    // フォームを動的に構築
    const formContainer = document.getElementById('reviewForm');
    buildForm(currentConfig.questions, formContainer);

    // ボタンと結果のタイトルを設定
    generateButton.textContent = currentConfig.submitButtonText;
    resultContainer.querySelector('h3').textContent = currentConfig.resultTitle;

    generateButton.addEventListener('click', async () => {
        // 新しい操作の開始時に、前回のエラーメッセージを隠す
        hideFormError();
        resultErrorMessage.style.display = 'none';

        const formData = collectFormData(currentConfig.questions);

        // バックエンドに送信する基本データを作成
        const requestData = {
            formData: formData
        };

        // AIへの役割指示を動的に組み立てる
        let dynamicPromptContext = currentConfig.promptContext;
        const additionalInstructions = [];

        let randomStoreName = '';
        // 店名が設定されている場合、ランダムに選択
        if (currentConfig.storeNames && currentConfig.storeNames.length > 0) {
            randomStoreName = currentConfig.storeNames[Math.floor(Math.random() * currentConfig.storeNames.length)];
            additionalInstructions.push(`- **店名の使用**: 文章のどこかで ${randomStoreName} という店名を自然な形で一度だけ使用してください。`);
        }

        // 地名とキーワードのリストが設定されている場合、ランダムに選択
        if (currentConfig.locations && currentConfig.locations.length > 0 &&
            currentConfig.keywords && currentConfig.keywords.length > 0) {

            // 選択された店名に地名が含まれている場合、その地名を候補から除外する
            let availableLocations = currentConfig.locations;
            if (randomStoreName) {
                // 店名に含まれない地名だけをフィルタリング
                availableLocations = currentConfig.locations.filter(loc => !randomStoreName.includes(loc));
            }
            
            // もしフィルタリングの結果、利用可能な地名がなくなってしまったら、元のリストを使いAIの判断に任せる
            if (availableLocations.length === 0) {
                availableLocations = currentConfig.locations;
            }

            // 利用可能な地名リストからランダムに1つ選択
            const randomLocation = availableLocations[Math.floor(Math.random() * availableLocations.length)];

            // キーワードリストをシャッフルし、先頭から1つまたは2つ取得（50%の確率で数を変える）
            const shuffledKeywords = [...currentConfig.keywords].sort(() => 0.5 - Math.random());
            const keywordCount = Math.random() < 0.5 ? 1 : 2;
            const randomKeywords = shuffledKeywords.slice(0, keywordCount);

            // AIへの追加指示を作成（より自然な表現を促すように変更）
            additionalInstructions.push(`- **地名とキーワードの活用**: 文章のどこかに ${randomLocation} という地名と、${randomKeywords.join('や')} といったキーワードを、それぞれ最低1回は含めてください。ただし、いかにも宣伝のような不自然な文章にならないよう、あくまで顧客自身の言葉として自然に聞こえるように工夫してください。`);
        }

        if (additionalInstructions.length > 0) {
            dynamicPromptContext += "\n\n" + additionalInstructions.join('\n');
        }
        requestData.promptContext = dynamicPromptContext;

        // 選択・入力された項目の数をカウント
        let answerCount = 0;
        // スライダーは常に値を持つため、単純な値の数ではなく、
        // 質問設定(currentConfig.questions)を元にカウントする
        currentConfig.questions.forEach(q => {
            // スライダーはユーザーの能動的な選択ではないため、カウントから除外
            if (q.type === 'slider') {
                return; // この質問はスキップして次へ
            }

            const value = formData[q.id];
            if (value) { // 値が存在する場合のみカウント
                if (Array.isArray(value)) {
                    // チェックボックスの場合、選択された数だけカウント
                    answerCount += value.length;
                } else {
                    // ラジオボタンやテキスト入力の場合、1としてカウント
                    answerCount++;
                }
            }
        });

        if (answerCount < 4) {
            showFormError('4つ以上の項目を選択・入力してください。');
            return; // 4つ未満の場合は処理を中断
        }

        // ボタンを無効化し、ローディング表示
        generateButton.disabled = true;
        generateButton.textContent = 'AIが生成中です...';
        resultContainer.style.display = 'none'; // 前回の結果を隠す

        try {
            // バックエンドのAPIにリクエストを送信
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData),
            });

            if (!response.ok) {
                // サーバーからの詳細なエラーメッセージを取得試行
                let errorMessage = `サーバーエラー: ${response.status} (${response.statusText})`;
                try {
                    const errorResult = await response.json();
                    if (errorResult && errorResult.error) {
                        errorMessage = errorResult.error; // サーバーからの詳細エラーで上書き
                    }
                } catch (e) {
                    // レスポンスがJSONでない場合は何もしない
                }
                throw new Error(errorMessage);
            }

            const result = await response.json();

            if (result.review) {
                // 結果を表示
                const reviewText = result.review.trim();
                reviewResult.value = reviewText;
                resultContainer.style.display = 'block';
                resultNotice.style.display = 'block';
                autoResizeTextarea(reviewResult); // テキスト量に応じて高さを調整

                // --- ボタンの動的生成 ---
                const resultActionsDiv = document.querySelector('.result-actions');
                resultActionsDiv.innerHTML = ''; // 既存のボタンをクリア

                // 1. 「クリップボードにコピー」ボタンを作成
                const newCopyButton = document.createElement('button');
                newCopyButton.type = 'button';
                newCopyButton.className = 'button-secondary';
                newCopyButton.textContent = 'クリップボードにコピー';

                // 2. コピーボタンのクリックイベントを設定
                newCopyButton.onclick = () => {
                    navigator.clipboard.writeText(result.review.trim()).then(() => {
                        // コピー成功時の処理
                        newCopyButton.textContent = 'コピーしました！';
                        newCopyButton.disabled = true;
                        newCopyButton.classList.add('copied');

                        // 3. 口コミ投稿用のリンクボタンを作成して表示
                        // 設定ファイルにURLがあればボタンを生成
                        if (currentConfig.reviewPostUrl) {
                            const postLink = document.createElement('a');
                            postLink.className = 'button-primary';
                            postLink.target = '_blank';
                            postLink.textContent = '投稿画面に移動する';
                            postLink.href = currentConfig.reviewPostUrl;
                            resultActionsDiv.appendChild(postLink);
                        }

                    }).catch(err => {
                        console.error('クリップボードへのコピーに失敗しました:', err);
                        resultErrorMessage.textContent = 'コピーに失敗しました。お手数ですが、テキストを選択して手動でコピーしてください。';
                        resultErrorMessage.style.display = 'block';
                    });
                };
                resultActionsDiv.appendChild(newCopyButton);

            } else if (result.error) {
                throw new Error(result.error);
            } else {
                throw new Error('AIからの応答が予期しない形式です。');
            }

        } catch (error) {
            console.error('お声の生成に失敗しました:', error.message);
            reviewResult.value = `エラーが発生しました:\n\n${error.message}`;
            resultContainer.style.display = 'block';
            resultNotice.style.display = 'none';
            autoResizeTextarea(reviewResult); // エラー表示でも高さを調整
        } finally {
            // ボタンを元に戻す
            generateButton.disabled = false;
            generateButton.textContent = currentConfig.submitButtonText || '作成する';
        }
    });

});