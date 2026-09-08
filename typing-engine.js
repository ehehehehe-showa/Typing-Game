/* ==========================================
   typing-engine.js — ローマ字判定エンジン
   DOM操作・ゲーム状態への依存を一切含まない、純粋なロジックのみ。
   「残りのかな文字列」を渡すと「次に入力すべきローマ字候補」を返す。
   将来、入力方式を変える/単体テストを書く際もこのファイルだけで完結する。
========================================== */

const romajiMap = { 'あ':['a'], 'い':['i'], 'う':['u','wu','whu'], 'え':['e'], 'お':['o'], 'か':['ka','ca'], 'き':['ki'], 'く':['ku','cu','qu'], 'け':['ke','ce'], 'こ':['ko','co'], 'さ':['sa'], 'し':['shi','si','ci'], 'す':['su'], 'せ':['se','ce'], 'そ':['so'], 'た':['ta'], 'ち':['chi','ti'], 'つ':['tsu','tu'], 'て':['te'], 'と':['to'], 'な':['na'], 'に':['ni'], 'ぬ':['nu'], 'ね':['ne'], 'の':['no'], 'は':['ha'], 'ひ':['hi'], 'ふ':['fu','hu'], 'へ':['he'], 'ほ':['ho'], 'ま':['ma'], 'み':['mi'], 'む':['mu'], 'め':['me'], 'も':['mo'], 'や':['ya'], 'ゆ':['yu'], 'よ':['yo'], 'ら':['ra'], 'り':['ri'], 'る':['ru'], 'れ':['re'], 'ろ':['ro'], 'わ':['wa'], 'を':['wo'], 'ん':['nn','xn'], 'が':['ga'], 'ぎ':['gi'], 'ぐ':['gu'], 'げ':['ge'], 'ご':['go'], 'ざ':['za'], 'じ':['ji','zi'], 'ず':['zu'], 'ぜ':['ze'], 'ぞ':['zo'], 'だ':['da'], 'ぢ':['di'], 'づ':['du'], 'で':['de'], 'ど':['do'], 'ば':['ba'], 'び':['bi'], 'ぶ':['bu'], 'べ':['be'], 'ぼ':['bo'], 'ぱ':['pa'], 'ぴ':['pi'], 'ぷ':['pu'], 'ぺ':['pe'], 'ぽ':['po'], 'きゃ':['kya'], 'きゅ':['kyu'], 'きょ':['kyo'], 'しゃ':['sha','sya'], 'しゅ':['shu','syu'], 'しょ':['sho','syo'], 'ちゃ':['cha','tya','cya'], 'ちゅ':['chu','tyu','cyu'], 'ちょ':['cho','tyo','cyo'], 'にゃ':['nya'], 'にゅ':['nyu'], 'にょ':['nyo'], 'ひゃ':['hya'], 'ひゅ':['hyu'], 'ひょ':['hyo'], 'みゃ':['mya'], 'みゅ':['myu'], 'みょ':['myo'], 'りゃ':['rya'], 'りゅ':['ryu'], 'りょ':['ryo'], 'ぎゃ':['gya'], 'ぎゅ':['gyu'], 'ぎょ':['gyo'], 'じゃ':['ja','zya','jya'], 'じゅ':['ju','zyu','jyu'], 'じょ':['jo','zyo','jyo'], 'びゃ':['bya'], 'びゅ':['byu'], 'びょ':['byo'], 'ぴゃ':['pya'], 'ぴゅ':['pyu'], 'ぴょ':['pyo'], 'ふぁ':['fa'], 'ふぃ':['fi'], 'ふぇ':['fe'], 'ふぉ':['fo'], 'ぁ':['xa','la'], 'ぃ':['xi','li'], 'ぅ':['xu','lu'], 'ぇ':['xe','le'], 'ぉ':['xo','lo'], 'ゃ':['xya','lya'], 'ゅ':['xyu','lyu'], 'ょ':['xyo','lyo'], 'っ':['xtsu','ltsu'], 'ー':['-'], '、':[','], '。':['.'] };

// 残りのかな文字列(str)から、次に入力すべきローマ字の候補一覧を返す。
// 促音「っ」・撥音「ん」のショートカット判定もここで行う。
function getBlockOptions(str) {
    let options = []; if (!str) return options;
    if (str.length >= 2 && romajiMap[str.substring(0,2)]) romajiMap[str.substring(0,2)].forEach(r => options.push({ romaji: r, kana: str.substring(0,2), len: 2 }));
    if (romajiMap[str[0]]) romajiMap[str[0]].forEach(r => options.push({ romaji: r, kana: str[0], len: 1 }));
    if (str[0] === 'っ' && str.length >= 2) { getBlockOptions(str.substring(1)).forEach(opt => { if (!['a','i','u','e','o','n'].includes(opt.romaji[0])) options.push({ romaji: opt.romaji[0], kana: 'っ', len: 1 }); }); }
    if (str[0] === 'ん' && str.length >= 2) { const nextOpts = getBlockOptions(str.substring(1)); const nfc = nextOpts[0]?.romaji[0] || 'a'; if (!['a','i','u','e','o','n','y'].includes(nfc)) options.push({ romaji: 'n', kana: 'ん', len: 1 }); }
    if (options.length === 0) options.push({ romaji: str[0], kana: str[0], len: 1 });
    const map = new Map(); options.forEach(o => { if(!map.has(o.romaji)) map.set(o.romaji, o); });
    return Array.from(map.values());
}
