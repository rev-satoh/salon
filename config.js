/**
 * アプリケーションの静的な設定値を管理します。
 */

// グラフで使用する色のリスト
export const CHART_COLORS = [
    '#007aff', '#34c759', '#ff9500', '#ff3b30', '#5856d6', 
    '#ff2d55', '#af52de', '#5ac8fa', '#ffcc00', '#8e8e93',
    '#4cd964', '#ff453a', '#bf5af2', '#a2845e', '#00a0a0',
    '#e58a00', '#0059b3', '#d9006c', '#63a95e', '#a6a6a6'
];

// HPBの内部コードを含むエリアデータ
export const areas = {
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