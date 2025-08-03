const configs = {
  // --- サロン向け設定 ---
  salon: {
    typeName: "サロン",
    pageTitle: "サロン向け お客様の声 自動作成ツール",
    mainTitle: "サロン向け お客様の声 自動作成ツール",
    description: "選んでいくだけで、簡単にお客様の声(案)を作成できます。",
    submitButtonText: "お声を作成する",
    resultTitle: "生成されたお客様の声(案)",
    promptContext: "あなたは、これからお店を探す人の役に立つ、具体的で魅力的なレビューを書くのが得意な顧客です。以下の点を意識して文章を作成してください。\n\n- **検索で見つかりやすく**: 他の人が「〇〇（地名） まつ毛パーマ」のように検索することを想定し、アンケート結果にあるサービス名やお店の立地に関する情報（例：「交通の便が良い」）を、具体的で魅力的な表現で文章に含めてください。\n- **体験の具体化**: 「満足」や「丁寧だった」という言葉だけでなく、アンケート結果の「特に良かった点」などを元に、なぜそう感じたのかが伝わるような、生き生きとした文章を作成してください。", // AIへの役割指示
    storeNames: ['ケイトステージラッシュ広島八丁堀店', 'KATE stage LASH', 'ケイトステージラッシュ'], // 例: ['Eyelash Salon Bijou', 'ビジューさん', 'Bijou']
    locations: ['広島', '広島市', '八丁堀', 'バスセンター近く', '福屋近く'],
    reviewPostUrl: 'https://g.page/r/CTsbt_6yNcWAEBM/review', // 口コミ投稿ページのURL
    keywords: ['まつぱ', 'まつ毛', 'まつげ', '眉毛', 'マツパ', 'まつ毛パーマ', 'まつげパーマ', 'アイラッシュ', 'アイブロウ', 'パリジェンヌラッシュ', 'ハリウッドブロウ'],
    questions: [
      { id: 'visitType', label: 'ご来店は初めてですか？', type: 'radio', options: ['初来店', '再来店'] },
      { id: 'service', label: '受けた施術は何ですか？（複数選択可）', type: 'checkbox', options: ['まつ毛パーマ', '眉毛パーマ', '眉毛WAX'] },
      { id: 'satisfaction', label: '仕上がりの満足度はいかがでしたか？', type: 'radio', options: ['とても満足', '満足', '普通', '不満'] },
      { id: 'atmosphere', label: 'お店の雰囲気はどうでしたか？（複数選択可）', type: 'checkbox', options: ['とてもリラックスできた', '清潔感があった', 'おしゃれだった', '静かで落ち着いていた', '高級感があった', '駐車場が便利', '交通の便が良い'] },
      { id: 'staff', label: '接客態度はいかがでしたか？（複数選択可）', type: 'checkbox', options: ['とても丁寧だった', 'カウンセリングが親切だった', '気さくに話してくれた', '知識が豊富で頼りになった', '提案が的確だった'] },
      { id: 'tone', label: 'お声のトーンを選択してください', type: 'radio', options: ['丁寧', 'カジュアル', '感謝を伝える', '具体的・分析的'] },
      { id: 'textLength', label: 'お声の文字数', type: 'slider', min: 100, max: 400, step: 50, defaultValue: 250 },
      { id: 'goodPoint', label: '特に良かった点を教えてください（任意）', type: 'text', placeholder: '例：こちらの要望を細かく聞いてくれた、施術がスピーディーだった' },
      { id: 'badPoint', label: '悪かった点・改善点があれば教えて下さい（任意）', type: 'text', placeholder: '例：待ち時間が少し長かった、室内の温度が少し寒かった' },
    ]
  },

  // --- レストラン向け設定（例） ---
  restaurant: {
    typeName: "レストラン",
    pageTitle: "レストラン向け お客様の声 自動作成ツール",
    mainTitle: "レストラン向け お客様の声 自動作成ツール",
    description: "選んでいくだけで、簡単にお客様の声(案)を作成できます。",
    submitButtonText: "感想を作成する",
    resultTitle: "生成されたお客様の声(案)",
    promptContext: "あなたは、これからお店を探す人の役に立つ、具体的で魅力的なレビューを書くのが得意な顧客です。以下の点を意識して文章を作成してください。\n\n- **検索で見つかりやすく**: 他の人が「〇〇（地名） 記念日 ディナー」のように検索することを想定し、アンケート結果にある利用シーンやお店の立地に関する情報（例：「景色が良い」）を、具体的で魅力的な表現で文章に含めてください。\n- **体験の具体化**: 「美味しかった」や「雰囲気が良かった」という言葉だけでなく、アンケート結果の「特に良かった料理」などを元に、なぜそう感じたのかが伝わるような、五感を刺激する文章を作成してください。", // AIへの役割指示
    reviewPostUrl: 'https://www.google.com/maps/search/', // 口コミ投稿ページのURL（要設定）
    questions: [
      { id: 'visitType', label: 'ご来店は初めてですか？', type: 'radio', options: ['初来店', '再来店'] },
      { id: 'occasion', label: 'どのような目的で利用しましたか？', type: 'radio', options: ['ランチ', 'ディナー', '記念日', '友人・知人と'] },
      { id: 'foodSatisfaction', label: '料理の満足度はいかがでしたか？', type: 'radio', options: ['とても満足', '満足', '普通', '不満'] },
      { id: 'atmosphere', label: 'お店の雰囲気はどうでしたか？（複数選択可）', type: 'checkbox', options: ['おしゃれだった', '落ち着いた雰囲気', '活気があった', '景色が良かった', '個室が良かった', '駐車場が便利', '交通の便が良い'] },
      { id: 'staff', label: '接客態度はいかがでしたか？（複数選択可）', type: 'checkbox', options: ['とても丁寧だった', '料理の説明が詳しかった', 'ドリンクの提案が良かった', '笑顔が素敵だった'] },
      { id: 'costPerformance', label: 'コストパフォーマンスはどうでしたか？', type: 'radio', options: ['非常に良い', '良い', '普通', '少し高い'] },
      { id: 'tone', label: '感想のトーンを選択してください', type: 'radio', options: ['丁寧', 'カジュアル', 'グルメレポート風', '感謝を伝える'] },
      { id: 'textLength', label: 'お声の文字数', type: 'slider', min: 100, max: 400, step: 50, defaultValue: 250 },
      { id: 'goodPoint', label: '特に良かった料理や点を教えてください（任意）', type: 'text', placeholder: '例：前菜のカルパッチョが新鮮だった、記念日プレートが嬉しかった' },
      { id: 'badPoint', label: '改善点があれば教えて下さい（任意）', type: 'text', placeholder: '例：料理が出てくるのが少し遅かった' },
    ]
  },

  // --- 買取専門店向け設定 ---
  purchase_store: {
    typeName: "買取専門店",
    pageTitle: "買取専門店向け お客様の声 自動作成ツール",
    mainTitle: "買取専門店向け お客様の声 自動作成ツール",
    description: "選んでいくだけで、簡単にお客様の声(案)を作成できます。",
    submitButtonText: "お声を作成する",
    resultTitle: "生成されたお客様の声(案)",
    promptContext: "あなたは、これからお店を探す人の役に立つ、具体的で魅力的なレビューを書くのが得意な顧客です。以下の点を意識して文章を作成してください。\n\n- **検索で見つかりやすく**: 他の人が「〇〇（地名） ブランド品 買取」のように検索することを想定し、アンケート結果にある売却品目やお店の立地に関する情報（例：「駐車場が便利」）を、具体的で魅力的な表現で文章に含めてください。\n- **体験の具体化**: 「満足」や「丁寧だった」という言葉だけでなく、アンケート結果の「特に良かった点」などを元に、なぜそう感じたのかが伝わるような、信頼感が伝わる文章を作成してください。", // AIへの役割指示
    reviewPostUrl: 'https://www.google.com/maps/search/', // 口コミ投稿ページのURL（要設定）
    questions: [
      { id: 'visitType', label: 'ご来店は初めてですか？', type: 'radio', options: ['初来店', '再来店'] },
      { id: 'soldItems', label: '売却したお品物は何ですか？（複数選択可）', type: 'checkbox', options: ['ブランド品', 'バッグ', '財布', '時計', '貴金属', '金', 'プラチナ', 'ジュエリー', '指輪', 'ネックレス', 'カメラ', 'お酒', '骨董品', '切手', '古銭', 'テレカ', 'スマホ', '金券', '株主優待券', 'その他'] },
      { id: 'assessmentSatisfaction', label: '査定額の満足度はいかがでしたか？', type: 'radio', options: ['とても満足', '満足', '普通', '不満'] },
      { id: 'staff', label: 'スタッフの対応はどうでしたか？（複数選択可）', type: 'checkbox', options: ['説明が丁寧だった', '査定がスピーディーだった', '親しみやすかった', '知識が豊富だった', '安心して任せられた'] },
      { id: 'storeAtmosphere', label: 'お店の雰囲気はどうでしたか？（複数選択可）', type: 'checkbox', options: ['入りやすかった', '清潔感があった', 'プライバシーに配慮されていた', '落ち着いた雰囲気だった', '駐車場が便利', '交通の便が良い'] },
      { id: 'tone', label: 'お声のトーンを選択してください', type: 'radio', options: ['丁寧', 'カジュアル', '感謝を伝える', '具体的・分析的'] },
      { id: 'textLength', label: 'お声の文字数', type: 'slider', min: 100, max: 400, step: 50, defaultValue: 250 },
      { id: 'goodPoint', label: '特に良かった点を教えてください（任意）', type: 'text', placeholder: '例：思ったより高く買い取ってもらえた、待ち時間が短かった' },
      { id: 'badPoint', label: '改善点があれば教えて下さい（任意）', type: 'text', placeholder: '例：駐車場が分かりにくかった' },
    ]
  },
  // 他の業態もここに追加できます
};

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
      valueDisplay.textContent = `${input.value}文字`;
      input.oninput = () => { valueDisplay.textContent = `${input.value}文字`; };

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

/**
 * フォームの送信を処理し、バックエンドAPIを呼び出す関数
 * @param {Event} event - フォーム送信イベント
 * @param {Object} config - 使用する設定オブジェクト (例: configs.salon)
 * @param {string} apiUrl - バックエンドAPIのURL
 */
async function handleFormSubmit(event, config, apiUrl) {
  event.preventDefault(); // フォームのデフォルト送信をキャンセル

  const submitButton = document.getElementById('submit-button');
  const resultDiv = document.getElementById('result');
  const generatedTextP = document.getElementById('generated-text');
  // ボタンを配置するためのコンテナを取得
  const resultActionsDiv = document.getElementById('result-actions');

  // ボタンを無効化し、ローディング表示
  submitButton.disabled = true;
  submitButton.textContent = '作成中...';
  resultDiv.style.display = 'none';
  generatedTextP.textContent = '';

  // 以前の結果（ボタンなど）が残っている場合があるのでクリアする
  if (resultActionsDiv) resultActionsDiv.innerHTML = '';

  try {
    // フォームデータを収集
    const formData = collectFormData(config.questions);

    // バックエンドAPIに送信
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        formData: formData,
        context: config.promptContext // AIへの指示文も送信
      }),
    });

    if (!response.ok) {
      // APIからのエラーメッセージをより詳細に取得する
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`APIエラー: ${response.statusText} - ${errorData.error || '詳細不明'}`);
    }

    const data = await response.json();

    // 結果を表示
    generatedTextP.textContent = data.review;

    // --- ここからがボタン生成ロジックです ---
    if (resultActionsDiv) {
      // 1. 「クリップボードにコピー」ボタンを作成 (左側)
      const copyButton = document.createElement('button');
      copyButton.id = 'copy-button';
      copyButton.className = 'button-secondary'; // CSSでスタイルを定義します
      copyButton.textContent = 'クリップボードにコピー';

      // 2. コピーボタンのクリックイベントを設定
      copyButton.onclick = () => {
        navigator.clipboard.writeText(data.review).then(() => {
          // コピー成功時の処理
          copyButton.textContent = 'コピーしました！';
          copyButton.disabled = true;

          // 3. 「GBPに移動する」リンクボタンを作成して表示 (右側)
          if (!document.getElementById('gbp-link-button')) {
            const gbpLink = document.createElement('a');
            gbpLink.id = 'gbp-link-button';
            gbpLink.href = 'https://www.google.com/business/'; // デモURL
            gbpLink.textContent = 'GBPに移動する';
            gbpLink.className = 'button-primary'; // CSSでスタイルを定義します
            gbpLink.target = '_blank'; // 新しいタブで開く
            resultActionsDiv.appendChild(gbpLink);
          }
        }).catch(err => {
          console.error('クリップボードへのコピーに失敗しました:', err);
          alert('コピーに失敗しました。');
        });
      };
      resultActionsDiv.appendChild(copyButton);
    }
    resultDiv.style.display = 'block';

  } catch (error) {
    console.error('レビュー生成中にエラーが発生しました:', error);
    generatedTextP.textContent = `エラーが発生しました。しばらくしてからもう一度お試しください。(${error.message})`;
    resultDiv.style.display = 'block';
  } finally {
    // ボタンを再度有効化
    submitButton.disabled = false;
    submitButton.textContent = config.submitButtonText;
  }
}