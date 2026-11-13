import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, onSnapshot, addDoc, updateDoc, arrayUnion, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { Wine, Waves, Users, MessageSquare, ChevronRight, Send, Loader2, Sparkles, Compass, MapPin, Plus, Calendar, Info, CheckCircle2, Edit3, Trash2, LogOut } from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase initialization error", e);
}

// --- Gemini API 共通呼び出し関数（gemini-3.8-flash & AQキー直接通信対応版） ---
async function generateMasterReply(systemPrompt, conversationText) {
  const rawKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!rawKey) {
    throw new Error("Vercelの環境変数 VITE_GEMINI_API_KEY が設定されていません");
  }
  const apiKey = rawKey.trim();
  const modelsToTry = ["gemini-3.8-flash", "gemini-2.5-flash"];
  const errors = [];

  for (const modelName of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: conversationText }] }]
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || `HTTP ${response.status}`);
      }
      const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (replyText) return replyText;
      throw new Error("Empty response");
    } catch (err) {
      errors.push(`[${modelName}: ${err.message}]`);
    }
  }
  throw new Error(errors.join(" / "));
}

// --- Data Constants ---
const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

const SURF_POINTS = {
  "おすすめ・こだわりなし": ["混雑の少ない穏やかな海ならどこでも", "まずは波待ちだけでOKな場所"],
  "神奈川（湘南・西湘・三浦）": ["湘南：鵠沼海岸（遠浅・メロー）", "湘南：辻堂海岸（広大・程よい波）", "湘南：茅ヶ崎パーク・チサン", "湘南：由比ヶ浜・材木座（穏やか）", "西湘：酒匂海岸・吉浜", "三浦：三浦海岸・城ヶ島"],
  "千葉北": ["千葉北：太東（ロング・リターン向き）", "千葉北：一宮・サンライズ", "千葉北：片貝海岸", "千葉北：御宿海岸", "千葉北：飯岡・椎名内"],
  "千葉南": ["千葉南：鴨川（マルキ・前原）", "千葉南：和田（白渚・J's前）", "千葉南：千倉海岸", "千葉南：平砂浦（南風かわす）"],
  "茨城・福島": ["茨城：大洗サンビーチ（遠浅で安心）", "茨城：阿字ヶ浦・河原子", "茨城：波崎海岸", "福島：北泉海岸"],
  "静岡・伊豆": ["伊豆：下田・多々戸浜（白砂・メロー）", "伊豆：下田・吉佐美大浜", "静岡：静波海岸（遠浅・リターン向き）", "静岡：御前崎"],
  "愛知・三重（東海）": ["愛知：伊良湖", "三重：国府の浜（伊勢・遠浅）", "三重：市後浜"],
  "和歌山・近畿": ["和歌山：磯ノ浦（関西のメッカ）", "和歌山：南紀（那智・串本）"],
  "四国": ["徳島/高知：生見海岸", "徳島：宍喰海岸", "高知：平野・大岐の浜"],
  "九州・沖縄": ["宮崎：青島海岸（リターン向き）", "宮崎：木崎浜", "宮崎：お倉ヶ浜", "福岡：糸島", "沖縄：スーサイド", "沖縄：砂辺"],
  "北海道・東北・日本海": ["北海道：浜厚真", "宮城：仙台新港", "新潟：五十嵐浜", "福井：三国サンセットビーチ", "鳥取：白兎海岸"]
};

const ALL_KNOWN_POINTS = Object.values(SURF_POINTS).flat();

// ==========================================
// Main App Component
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState('welcome');
  const [karte, setKarte] = useState(null);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const docRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setKarte(docSnap.data());
            setScreen('main');
          } else {
            setScreen('welcome');
          }
        } catch (e) {
          console.error("Firestore fetch error", e);
          setScreen('welcome');
        }
      } else {
        signInAnonymously(auth).catch(console.error);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLeaveSnack = async () => {
    if (!user) return;
    if (!window.confirm("スナックから退店（あなたの待機データを削除）しますか？\n※いつでも再入店できます。")) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid));
      setKarte(null);
      setScreen('welcome');
    } catch (e) {
      console.error("Leave error:", e);
      alert("退店処理に失敗しました。");
    }
  };

  if (!app) {
    return <div className="min-h-screen bg-stone-900 text-white flex items-center justify-center">Firebaseの設定を確認してください（.env）</div>;
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200 font-sans flex justify-center selection:bg-teal-900">
      <div className="w-full max-w-md min-h-screen bg-stone-900 shadow-2xl flex flex-col relative border-x border-stone-800">
        {screen === 'welcome' && (
          <WelcomeScreen onNext={(name) => {
            setKarte({ nickname: name });
            setScreen('karte');
          }} />
        )}
        {screen === 'karte' && (
          <KarteScreen
            user={user}
            initialData={karte}
            onComplete={(data) => {
              setKarte(data);
              setScreen('main');
            }}
            onCancel={karte?.age ? () => setScreen('main') : null}
          />
        )}
        {screen === 'main' && (
          <MainLayout
            karte={karte}
            user={user}
            onEditKarte={() => setScreen('karte')}
            onLeaveSnack={handleLeaveSnack}
          />
        )}
      </div>
    </div>
  );
}

// ==========================================
// Welcome Screen
// ==========================================
function WelcomeScreen({ onNext }) {
  const [nickname, setNickname] = useState('');

  return (
    <div className="p-8 flex-1 flex flex-col justify-center items-center text-center bg-gradient-to-b from-stone-900 to-stone-950">
      <div className="w-20 h-20 bg-stone-800/80 border border-teal-500/30 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-teal-900/20">
        <Waves className="w-10 h-10 text-teal-400" />
      </div>
      <span className="text-[10px] tracking-widest text-orange-400 font-bold uppercase mb-2">
        LINE Authentication Success
      </span>
      <h1 className="text-3xl font-extrabold text-white tracking-widest mb-3">SURF SNACK</h1>
      <p className="text-stone-400 text-xs mb-10 leading-relaxed">
        大人のための海辺の隠れ家。<br />
        社会的肩書を脱いで、海と仲間へもう一度。
      </p>

      <form onSubmit={(e) => { e.preventDefault(); if (nickname.trim()) onNext(nickname.trim()); }} className="w-full space-y-4">
        <div className="text-left">
          <label className="block text-xs text-stone-400 mb-1.5 ml-1 font-medium">海ネーム（本名不可）</label>
          <input type="text" required maxLength={12} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="例: ナミオ、ShonanBoy" className="w-full bg-stone-950 border border-stone-700 rounded-xl px-4 py-3.5 text-white placeholder-stone-600 focus:outline-none focus:border-teal-500 transition-colors" />
        </div>
        <button type="submit" className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center space-x-2">
          <span>入店する</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

// ==========================================
// Karte Screen
// ==========================================
function KarteScreen({ user, initialData, onComplete, onCancel }) {
  const [loading, setLoading] = useState(false);

  const isExistingPoint = !initialData?.targetPoint || ALL_KNOWN_POINTS.includes(initialData.targetPoint);

  const [form, setForm] = useState({
    nickname: initialData?.nickname || '',
    age: initialData?.age || '',
    gender: initialData?.gender || '',
    homeArea: initialData?.homeArea || '東京都',
    homeDetail: initialData?.homeDetail || '',
    targetPoint: isExistingPoint ? (initialData?.targetPoint || '混雑の少ない穏やかな海ならどこでも') : 'その他（直接入力）',
    customPoint: isExistingPoint ? '' : (initialData?.targetPoint || ''),
    blankYears: initialData?.blankYears || '',
    physicalLevel: initialData?.physicalLevel || '',
    anxieties: initialData?.anxieties || []
  });

  const toggleAnxiety = (val) => {
    setForm(p => ({ ...p, anxieties: p.anxieties.includes(val) ? p.anxieties.filter(a => a !== val) : [...p.anxieties, val].slice(0, 3) }));
  };

  const handleSubmit = async () => {
    if (!form.nickname.trim() || !form.age || !form.gender || !form.homeArea || !form.targetPoint || !form.blankYears || !form.physicalLevel) {
      alert("必須項目をすべて選択・入力してください。"); return;
    }
    const finalTargetPoint = form.targetPoint === 'その他（直接入力）' ? (form.customPoint || 'その他') : form.targetPoint;
    const dataToSave = {
      ...form,
      nickname: form.nickname.trim(),
      targetPoint: finalTargetPoint,
      uid: user.uid,
      createdAt: serverTimestamp()
    };
    
    setLoading(true);
    try {
      await setDoc(doc(db, 'users', user.uid), dataToSave);
      onComplete(dataToSave);
    } catch (e) {
      console.error(e);
      alert("エラーが発生しました");
    }
    setLoading(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-stone-950">
      <div className="p-6 pt-10 pb-6 bg-stone-900 border-b border-stone-800 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Re-Surf カルテ</h2>
          <p className="text-stone-400 text-xs">ありのままの「今の状態」を教えてください。</p>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="text-xs text-stone-400 hover:text-white bg-stone-800 px-3 py-1.5 rounded-lg">
            戻る
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-6 pb-24 space-y-7">
        
        <div>
          <label className="text-xs text-teal-400 font-semibold block mb-2">海ネーム（ニックネーム）</label>
          <input
            type="text"
            maxLength={12}
            value={form.nickname}
            onChange={e => setForm({...form, nickname: e.target.value})}
            placeholder="例: ナミオ、ShonanBoy"
            className="w-full bg-stone-900 border border-stone-700 text-white rounded-lg p-3 text-xs focus:border-teal-500"
          />
        </div>

        <div className="flex space-x-4">
          <div className="flex-1">
            <label className="text-xs text-teal-400 font-semibold block mb-2">年代</label>
            <select value={form.age} onChange={e => setForm({...form, age: e.target.value})} className="w-full bg-stone-900 border border-stone-700 text-white rounded-lg p-3 text-xs focus:border-teal-500">
              <option value="">選択</option>
              {['30代','40代','50代','60代以上'].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-teal-400 font-semibold block mb-2">性別</label>
            <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})} className="w-full bg-stone-900 border border-stone-700 text-white rounded-lg p-3 text-xs focus:border-teal-500">
              <option value="">選択</option>
              {['男性','女性','その他'].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-teal-400 font-semibold block mb-2">お住まい（出発地）</label>
          <select value={form.homeArea} onChange={e => setForm({...form, homeArea: e.target.value})} className="w-full bg-stone-900 border border-stone-700 text-white rounded-lg p-3 text-xs focus:border-teal-500 mb-2">
            {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="text" value={form.homeDetail} onChange={e => setForm({...form, homeDetail: e.target.value})} placeholder="詳細 (例: 横浜市青葉区、世田谷区 など)" className="w-full bg-stone-900 border border-stone-700 text-white rounded-lg p-3 text-xs focus:border-teal-500" />
        </div>

        <div>
          <label className="text-xs text-teal-400 font-semibold block mb-2">行きたいサーフポイント</label>
          <select value={form.targetPoint} onChange={e => setForm({...form, targetPoint: e.target.value})} className="w-full bg-stone-900 border border-stone-700 text-white rounded-lg p-3 text-xs focus:border-teal-500">
            {Object.entries(SURF_POINTS).map(([region, points]) => (
              <optgroup key={region} label={region} className="bg-stone-800 text-teal-400">
                {points.map(p => <option key={p} value={p} className="text-white">{p}</option>)}
              </optgroup>
            ))}
            <option value="その他（直接入力）">その他（直接入力）</option>
          </select>
          {form.targetPoint === 'その他（直接入力）' && (
             <input type="text" value={form.customPoint} onChange={e => setForm({...form, customPoint: e.target.value})} placeholder="ポイント名を入力" className="w-full mt-2 bg-stone-900 border border-stone-700 text-white rounded-lg p-3 text-xs focus:border-teal-500" />
          )}
        </div>

        <div>
          <label className="text-xs text-teal-400 font-semibold block mb-2">ブランク年数</label>
          <div className="space-y-2">
            {['1〜3年 (ちょっと足が遠のいている)','3〜5年 (完全にタイミングを失った)','5〜10年 (ボードはオブジェ化)','10年以上 (美しい記憶の中)'].map(opt => (
              <button key={opt} onClick={() => setForm({...form, blankYears: opt})} className={`w-full text-left p-3 rounded-lg border text-xs transition-colors ${form.blankYears === opt ? 'bg-teal-900/40 border-teal-500 text-white' : 'bg-stone-900 border-stone-800 text-stone-400'}`}>{opt}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-teal-400 font-semibold block mb-2">現在の体力・パドル筋</label>
          <div className="space-y-2">
            {['レベル1: 全く運動していない (お腹周りがヤバい)','レベル2: パドル筋はゼロ (ジョギング等はたまに)','レベル3: テイクオフは不安 (ジムで鍛えてはいる)','レベル4: 昔と変わらない (今すぐ突っ込める)'].map(opt => (
              <button key={opt} onClick={() => setForm({...form, physicalLevel: opt})} className={`w-full text-left p-3 rounded-lg border text-xs transition-colors ${form.physicalLevel === opt ? 'bg-teal-900/40 border-teal-500 text-white' : 'bg-stone-900 border-stone-800 text-stone-400'}`}>{opt}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-teal-400 font-semibold block mb-1">海に戻る一番の壁は？ (最大3つ)</label>
          <div className="space-y-2 mt-2">
            {['パドルが進まない・立てない気がする','翌日の仕事への影響(筋肉痛・怪我)が怖い','ローカルサーファーの目が怖い','ダサい自分を見られるのが恥ずかしい','一緒に行く仲間がいない','手持ちの道具が今の体型に合わない'].map(opt => {
              const sel = form.anxieties.includes(opt);
              return (
                <button key={opt} onClick={() => toggleAnxiety(opt)} className={`w-full text-left p-3 rounded-lg border text-xs flex items-center justify-between transition-colors ${sel ? 'bg-teal-900/40 border-teal-500 text-white' : 'bg-stone-900 border-stone-800 text-stone-400'}`}>
                  <span>{opt}</span>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ml-2 ${sel ? 'border-teal-400 bg-teal-500' : 'border-stone-600'}`}>
                    {sel && <div className="w-2 h-2 bg-stone-950 rounded-sm" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={handleSubmit} disabled={loading} className="w-full mt-4 bg-teal-600 hover:bg-teal-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex justify-center">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (onCancel ? 'カルテを更新する' : 'スナックに入店する')}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// Main Layout (Bottom Navigation)
// ==========================================
function MainLayout({ karte, user, onEditKarte, onLeaveSnack }) {
  const [activeTab, setActiveTab] = useState('lobby');
  const [chatPartner, setChatPartner] = useState(null);

  if (chatPartner) {
    return <AisekiGroupChatScreen karte={karte} partner={chatPartner} onBack={() => setChatPartner(null)} />;
  }

  return (
    <div className="flex-1 flex flex-col bg-stone-950 h-screen overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'lobby' && (
          <div className="flex-1 overflow-y-auto">
            <LobbyTab
              karte={karte}
              onSelectPartner={setChatPartner}
              onEditKarte={onEditKarte}
              onLeaveSnack={onLeaveSnack}
            />
          </div>
        )}
        {activeTab === 'consult' && (
          <ConsultTab karte={karte} />
        )}
        {activeTab === 'resurf' && (
          <div className="flex-1 overflow-y-auto">
            <ReSurfTab karte={karte} />
          </div>
        )}
      </div>

      <div className="w-full bg-stone-900/95 backdrop-blur border-t border-stone-800 flex justify-around items-center py-2 px-2 z-50 flex-shrink-0">
        <NavButton active={activeTab==='lobby'} onClick={()=>setActiveTab('lobby')} icon={<Wine className="w-6 h-6 mb-1"/>} label="入店" />
        <NavButton active={activeTab==='consult'} onClick={()=>setActiveTab('consult')} icon={<MessageSquare className="w-6 h-6 mb-1"/>} label="なんでも相談" />
        <NavButton active={activeTab==='resurf'} onClick={()=>setActiveTab('resurf')} icon={<Waves className="w-6 h-6 mb-1"/>} label="Re-Surf" />
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center w-20 py-1.5 transition-colors ${active ? 'text-teal-400' : 'text-stone-500 hover:text-stone-300'}`}>
      {icon}
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}

// ==========================================
// Tab 1: Lobby
// ==========================================
function LobbyTab({ karte, onSelectPartner, onEditKarte, onLeaveSnack }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.nickname && data.nickname !== karte.nickname) {
          fetched.push({ id: docSnap.id, ...data });
        }
      });
      setUsers(fetched);
    });
    return () => unsubscribe();
  }, [karte.nickname]);

  const handleDeleteMember = async (memberId, memberName) => {
    if (!window.confirm(`待機メンバー「${memberName}」さんをリストから削除しますか？`)) return;
    try {
      await deleteDoc(doc(db, 'users', memberId));
    } catch (e) {
      console.error("Delete member error:", e);
      alert("削除に失敗しました。");
    }
  };

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between mt-2">
        <h2 className="text-lg font-bold text-white flex items-center">
          <Wine className="w-5 h-5 text-teal-400 mr-2" />
          今夜の相席カウンター
        </h2>
        <span className="text-[10px] bg-stone-800 text-teal-400 px-2 py-1 rounded-full border border-teal-900/50 flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mr-1 animate-pulse" />
          リアルタイム
        </span>
      </div>

      <div className="bg-stone-900/90 border border-stone-700 p-3.5 rounded-2xl shadow-md">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] bg-teal-900/60 text-teal-300 px-2 py-0.5 rounded font-bold border border-teal-500/30">
              あなた
            </span>
            <span className="text-sm font-bold text-white">{karte.nickname}</span>
            <span className="text-[10px] text-stone-400">({karte.age} / {karte.homeArea})</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={onEditKarte}
              className="text-[10px] bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-600 px-2.5 py-1.5 rounded-lg flex items-center space-x-1 transition-colors"
            >
              <Edit3 className="w-3 h-3 text-teal-400" />
              <span>カルテ変更</span>
            </button>
            <button
              onClick={onLeaveSnack}
              title="退店する（自分のデータを削除）"
              className="text-[10px] bg-stone-800 hover:bg-red-950/60 text-stone-400 hover:text-red-300 border border-stone-700 px-2 py-1.5 rounded-lg flex items-center space-x-1 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              <span>退店</span>
            </button>
          </div>
        </div>
        <div className="text-[10px] text-stone-400 flex items-center">
          <Compass className="w-3 h-3 mr-1 text-teal-500 flex-shrink-0" />
          <span className="truncate">希望: {karte.targetPoint}</span>
        </div>
      </div>
      
      <div className="bg-gradient-to-r from-teal-950/70 to-stone-900 border border-teal-500/40 p-4 rounded-2xl shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-[10px] bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded font-bold">全員参加・LINEグループ形式</span>
            <h3 className="text-sm font-bold text-white mt-1.5">オープン相席テーブル（全体トーク）</h3>
            <p className="text-[11px] text-stone-400 mt-0.5">店内のメンバー全員で自由に話せるテーブルです</p>
          </div>
          <button
            onClick={() => onSelectPartner({ id: 'open_lounge', nickname: '店内メンバー全員', isGroup: true, homeArea: '全国', anxieties: ['仲間探し'] })}
            className="bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold px-3.5 py-2.5 rounded-xl transition-colors flex items-center flex-shrink-0 shadow-md"
          >
            <span>参加する</span><ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </button>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="bg-stone-900 border border-stone-800 p-8 rounded-2xl text-center text-stone-500 text-xs">
          まだ他のメンバーがカウンターにいません。<br/>上の「オープン相席テーブル」に入るか、別端末から登録してみてください。
        </div>
      ) : (
        <div className="space-y-3">
          {users.map(u => (
            <div key={u.id} className="bg-stone-900 border border-stone-800 p-4 rounded-2xl shadow-lg">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center">
                    {u.nickname} <span className="ml-2 text-[10px] text-stone-400 font-normal">{u.age} / {u.gender}</span>
                  </h3>
                  <p className="text-[11px] text-orange-300 mt-1 font-medium">ブランク: {u.blankYears?.split('(')[0]}</p>
                </div>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => onSelectPartner(u)}
                    className="bg-teal-900/40 hover:bg-teal-800 border border-teal-500/50 text-teal-100 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center"
                  >
                    <span>相席を頼む</span><ChevronRight className="w-3 h-3 ml-0.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteMember(u.id, u.nickname)}
                    title="この待機メンバーを削除"
                    className="p-1.5 text-stone-500 hover:text-red-400 hover:bg-stone-800 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="bg-stone-950 p-2.5 rounded-xl mb-3 text-[10px] space-y-1.5 border border-stone-800">
                <div className="flex items-center text-stone-300">
                  <MapPin className="w-3 h-3 mr-1.5 text-teal-500 flex-shrink-0" />
                  <span>拠点: <strong className="text-white">{u.homeArea} {u.homeDetail}</strong></span>
                </div>
                <div className="flex items-start text-stone-300">
                  <Compass className="w-3 h-3 mr-1.5 text-teal-500 flex-shrink-0 mt-0.5" />
                  <span>希望: <strong className="text-white">{u.targetPoint}</strong></span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {u.anxieties?.map(anx => (
                  <span key={anx} className="bg-stone-800 text-stone-400 text-[9px] px-2 py-0.5 rounded-md">#{anx.slice(0, 12)}..</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Tab 2: Consult (なんでも相談)
// ==========================================
function ConsultTab({ karte }) {
  const [messages, setMessages] = useState([
    {
      role: 'model',
      text: `いらっしゃい、${karte.nickname}さん。道具のこと（今の浮力のあるボードやウェットスーツ）、ポイントのこと、体力の不安でもなんでも聞いてよ。${karte.blankYears ? karte.blankYears.split('(')[0] + 'ぶりだと、' : ''}最近のギアの進化にはびっくりするかもね！`
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');
    const updatedMessages = [...messages, { role: 'user', text: userText }];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const systemPrompt = `あなたは「SURF SNACK」という大人のリターンサーファー向けスナックのマスターです。
サーフィンの道具選び（ミッドレングスやソフトボード等の浮力、ウェットスーツ）、全国のポイント情報、復帰に向けたトレーニングやストレッチなど、サーフィンに関する「なんでも相談」に答えてください。
相談者: ${karte.nickname} (年代:${karte.age} / 拠点:${karte.homeArea} / ブランク:${karte.blankYears} / 体力:${karte.physicalLevel} / 不安:${karte.anxieties?.join(',')})
スタンス: 専門用語を使いすぎず、ブランクや体力低下に優しく寄り添い、具体的で前向きになるアドバイスを返してください。LINEの返信のように親しみやすく、3〜5文程度で簡潔に答えてください。`;

      const historyText = updatedMessages
        .map(m => `${m.role === 'user' ? karte.nickname : 'マスター'}: ${m.text}`)
        .join('\n');

      const reply = await generateMasterReply(
        systemPrompt,
        `これまでの会話:\n${historyText}\n\n最後の${karte.nickname}の発言に対して、マスターとして返答してください:`
      );
      setMessages(prev => [...prev, { role: 'model', text: reply }]);
    } catch (err) {
      console.error("Consult Gemini API Error:", err);
      setMessages(prev => [
        ...prev,
        { role: 'model', text: `ごめん、通信エラーが出ちゃった！（原因: ${err.message}）` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-950 overflow-hidden">
      <header className="p-3.5 bg-stone-900 border-b border-stone-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-full bg-teal-900/50 border border-teal-500/30 flex items-center justify-center">
            <Info className="w-4 h-4 text-teal-400" />
          </div>
          <div>
            <span className="text-xs font-bold text-white">マスターになんでも相談</span>
            <p className="text-[10px] text-stone-400">道具選び・ポイント・体力の悩みなどAIマスターが回答</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          return (
            <div key={idx} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] text-stone-500 mb-1 px-1">
                {isUser ? karte.nickname : '🍸 マスター (AI)'}
              </span>
              <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-md whitespace-pre-wrap ${isUser ? 'bg-teal-700 text-white rounded-br-sm' : 'bg-stone-800 text-stone-200 border border-stone-700 rounded-bl-sm'}`}>
                {m.text}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-stone-800 border border-stone-700 rounded-2xl px-4 py-3 text-stone-400 text-xs flex items-center space-x-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
              <span>マスターが考えています...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 bg-stone-900 border-t border-stone-800 flex-shrink-0">
        <form onSubmit={handleSend} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
            placeholder="例：ブランク10年でも乗れる浮力のあるボードは？"
            className="flex-1 bg-stone-950 border border-stone-700 rounded-full px-4 py-3 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-11 h-11 rounded-full bg-teal-600 hover:bg-teal-500 disabled:bg-stone-800 text-white flex items-center justify-center flex-shrink-0 shadow-lg transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 相席セッティング (LINEグループ形式 + ファシリテーターAIマスター)
// ==========================================
function AisekiGroupChatScreen({ karte, partner, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const roomId = partner.isGroup
    ? 'open_lounge'
    : [karte.nickname, partner.nickname].sort().join('__');

  useEffect(() => {
    const msgRef = collection(db, 'aiseki_rooms', roomId, 'messages');
    const q = query(msgRef, orderBy('createdAt', 'asc'), limit(100));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const fetched = [];
      snapshot.forEach(d => fetched.push({ id: d.id, ...d.data() }));
      setMessages(fetched);

      if (snapshot.empty) {
        const introText = partner.isGroup
          ? `いらっしゃい！ここは店内のメンバー全員で自由に話せる相席テーブルだよ。まずは気軽に自己紹介や、どこの海に行きたいか話してみて！（マスターは会話を見守りながら時々つなぐね）`
          : `おう、${karte.nickname}さん、${partner.nickname}さん、相席テーブルへようこそ！お互いに「${partner.anxieties?.[0] || '久しぶりの海'}」っていう共通点もあるし、まずは気軽にメッセージを送ってみてよ。俺は横でグラスを磨きながら、会話をつなぐ役に徹するからね！`;

        try {
          await addDoc(msgRef, {
            sender: 'マスター',
            isMaster: true,
            text: introText,
            createdAt: serverTimestamp()
          });
        } catch (e) {
          console.error("Initial greeting error:", e);
        }
      }
    });

    return () => unsubscribe();
  }, [roomId, karte.nickname, partner]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (e, forceMaster = false) => {
    if (e) e.preventDefault();
    if (!forceMaster && !input.trim()) return;

    const msgRef = collection(db, 'aiseki_rooms', roomId, 'messages');
    let latestUserText = input.trim();

    if (!forceMaster) {
      setInput('');
      await addDoc(msgRef, {
        sender: karte.nickname,
        senderArea: karte.homeArea,
        isMaster: false,
        text: latestUserText,
        createdAt: serverTimestamp()
      });
    }

    const humanMessages = messages.filter(m => !m.isMaster);
    const shouldMasterFacilitate =
      forceMaster ||
      latestUserText.includes('マスター') ||
      latestUserText.includes('？') ||
      latestUserText.includes('?') ||
      humanMessages.length <= 1 ||
      humanMessages.length % 2 === 0;

    if (shouldMasterFacilitate) {
      setLoading(true);
      try {
        const recentHistory = [...messages.slice(-8), ...(latestUserText ? [{ sender: karte.nickname, text: latestUserText }] : [])]
          .map(m => `${m.sender}: ${m.text}`)
          .join('\n');

        const facilitatorPrompt = `あなたは湘南・海辺のスナック「SURF SNACK」のマスター（AIファシリテーター）です。
ここはLINEグループのようにメンバー同士（${karte.nickname} [${karte.homeArea} / 希望:${karte.targetPoint}] と ${partner.nickname} [${partner.homeArea || ''} / 希望:${partner.targetPoint || ''}] など）が自由に会話する相席トークルームです。

【あなたの重要な役割】
・あなたは会話の主役ではありません。メンバー同士が仲良くなり、一緒に海（まずは波待ちコーヒーなど）に行きたくなるように「会話をつなぐファシリテーター（仲介役）」に徹してください。
・片方のメンバーだけに答えるのではなく、「〇〇さんはどう？」「2人とも〇〇エリアならあそこはどう？」と、他のメンバーが返信しやすくなるパス出しをしてください。
・2〜3文で短く、温かいスナックのマスター口調で発言してください。`;

        const reply = await generateMasterReply(
          facilitatorPrompt,
          `直近のグループトーク履歴:\n${recentHistory}\n\nこの流れを受けて、メンバー同士の会話が弾むような一言（相槌や話題のパス）をお願いします:`
        );

        await addDoc(msgRef, {
          sender: 'マスター',
          isMaster: true,
          text: reply,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Facilitator AI Error:", err);
        await addDoc(msgRef, {
          sender: 'マスター',
          isMaster: true,
          text: `ごめん、通信エラーが出ちゃった！（原因: ${err.message}）`,
          createdAt: serverTimestamp()
        });
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-stone-950 overflow-hidden">
      <header className="p-3.5 bg-stone-900 border-b border-stone-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="p-1.5 text-stone-400 hover:text-white rounded-lg bg-stone-800">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-full bg-teal-900/50 border border-teal-500/30 flex items-center justify-center">
              <Users className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <span className="text-xs font-bold text-white">
                {partner.isGroup ? 'オープン相席テーブル' : `${partner.nickname} との相席テーブル`}
              </span>
              <p className="text-[10px] text-teal-400">
                参加メンバー: {karte.nickname}・{partner.nickname}・マスター(仲介)
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => handleSend(null, true)}
          disabled={loading}
          className="text-[10px] bg-stone-800 hover:bg-stone-700 text-orange-300 border border-orange-500/30 px-2.5 py-1.5 rounded-lg flex items-center space-x-1 flex-shrink-0"
        >
          <Sparkles className="w-3 h-3" />
          <span>マスターにパス</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, idx) => {
          const isMe = m.sender === karte.nickname && !m.isMaster;
          const isMaster = m.isMaster;

          return (
            <div key={m.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <span className={`text-[10px] mb-1 px-1 font-medium ${isMaster ? 'text-orange-400' : 'text-stone-400'}`}>
                {isMaster ? '🍸 マスター（会話つなぎ役）' : `${m.sender}${m.senderArea ? ` (${m.senderArea})` : ''}`}
              </span>
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-md whitespace-pre-wrap ${
                  isMe
                    ? 'bg-teal-700 text-white rounded-br-sm'
                    : isMaster
                    ? 'bg-stone-900/90 text-orange-100 border border-orange-500/30 rounded-bl-sm'
                    : 'bg-stone-800 text-white border border-stone-700 rounded-bl-sm'
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-stone-900 border border-orange-500/30 rounded-2xl px-4 py-2.5 text-orange-300 text-xs flex items-center space-x-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>マスターが会話をつないでいます...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 bg-stone-900 border-t border-stone-800 flex-shrink-0">
        <form onSubmit={(e) => handleSend(e, false)} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="みんなにメッセージを送る（例：今度湘南で波待ちしませんか？）"
            className="flex-1 bg-stone-950 border border-stone-700 rounded-full px-4 py-3 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="w-11 h-11 rounded-full bg-teal-600 hover:bg-teal-500 disabled:bg-stone-800 text-white flex items-center justify-center flex-shrink-0 shadow-lg transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// Tab 3: Re-Surf (企画/予約/削除)
// ==========================================
function ReSurfTab({ karte }) {
  const [plans, setPlans] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlan, setNewPlan] = useState({ title: '', date: '', point: '', description: '', capacity: 4 });

  useEffect(() => {
    const q = query(collection(db, 'plans'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = [];
      snapshot.forEach(docSnap => fetched.push({ id: docSnap.id, ...docSnap.data() }));
      setPlans(fetched);
    });
    return () => unsubscribe();
  }, []);

  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (!newPlan.title || !newPlan.date) return;
    try {
      await addDoc(collection(db, 'plans'), {
        ...newPlan,
        hostName: karte.nickname,
        hostArea: karte.homeArea,
        participants: [karte.nickname],
        createdAt: serverTimestamp()
      });
      setIsCreating(false);
      setNewPlan({ title: '', date: '', point: '', description: '', capacity: 4 });
    } catch (e) {
      console.error("Plan creation failed", e);
    }
  };

  const handleJoinPlan = async (planId, participants) => {
    if (participants.includes(karte.nickname)) return;
    try {
      const planRef = doc(db, 'plans', planId);
      await updateDoc(planRef, {
        participants: arrayUnion(karte.nickname)
      });
    } catch (e) {
      console.error("Join failed", e);
    }
  };

  const handleDeletePlan = async (planId, planTitle) => {
    if (!window.confirm(`企画「${planTitle}」を削除しますか？`)) return;
    try {
      await deleteDoc(doc(db, 'plans', planId));
    } catch (e) {
      console.error("Delete plan failed", e);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between mb-4 mt-2">
        <h2 className="text-lg font-bold text-white flex items-center">
          <Waves className="w-5 h-5 text-teal-400 mr-2" />
          週末のリトリート
        </h2>
        <button onClick={() => setIsCreating(!isCreating)} className="bg-teal-600 text-white text-xs px-3 py-1.5 rounded-lg flex items-center shadow-lg">
          <Plus className="w-3.5 h-3.5 mr-1" /> 企画する
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreatePlan} className="bg-stone-900 border border-teal-900 p-4 rounded-2xl mb-6 shadow-lg">
          <h3 className="text-sm font-bold text-white mb-3">新しいツアーを企画</h3>
          <div className="space-y-3">
            <input type="text" required value={newPlan.title} onChange={e=>setNewPlan({...newPlan, title: e.target.value})} placeholder="企画名 (例: 湘南波待ちコーヒー部)" className="w-full bg-stone-950 border border-stone-700 rounded-lg p-2.5 text-xs text-white" />
            <div className="flex space-x-2">
              <input type="date" required value={newPlan.date} onChange={e=>setNewPlan({...newPlan, date: e.target.value})} className="w-1/2 bg-stone-950 border border-stone-700 rounded-lg p-2.5 text-xs text-white" />
              <input type="text" required value={newPlan.point} onChange={e=>setNewPlan({...newPlan, point: e.target.value})} placeholder="場所 (鵠沼海岸など)" className="w-1/2 bg-stone-950 border border-stone-700 rounded-lg p-2.5 text-xs text-white" />
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-xs text-stone-400 flex-shrink-0">募集人数:</label>
              <input type="number" min="2" max="10" required value={newPlan.capacity} onChange={e=>setNewPlan({...newPlan, capacity: parseInt(e.target.value)})} className="w-20 bg-stone-950 border border-stone-700 rounded-lg p-2.5 text-xs text-white" />
            </div>
            <textarea required value={newPlan.description} onChange={e=>setNewPlan({...newPlan, description: e.target.value})} placeholder="詳細 (ブランク10年以上歓迎！相乗りも相談しましょう)" className="w-full bg-stone-950 border border-stone-700 rounded-lg p-2.5 text-xs text-white h-20" />
            <div className="flex justify-end space-x-2">
              <button type="button" onClick={()=>setIsCreating(false)} className="px-4 py-2 text-xs text-stone-400">キャンセル</button>
              <button type="submit" className="bg-teal-600 text-white px-4 py-2 text-xs rounded-lg font-bold">公開する</button>
            </div>
          </div>
        </form>
      )}

      {plans.length === 0 ? (
        <div className="bg-stone-900 border border-stone-800 p-8 rounded-2xl text-center text-stone-500 text-xs">
          現在予定されているツアーはありません。<br/>右上のボタンから企画してみましょう。
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map(p => {
            const isJoined = p.participants?.includes(karte.nickname);
            const isFull = p.participants?.length >= (p.capacity || 4);
            const spotsLeft = (p.capacity || 4) - (p.participants?.length || 0);

            return (
              <div key={p.id} className="bg-stone-900 border border-stone-800 p-4 rounded-2xl relative overflow-hidden shadow-lg">
                <div className="absolute top-0 right-0 bg-stone-800 text-stone-400 text-[9px] px-2 py-1 rounded-bl-lg flex items-center space-x-2">
                  <span>主催: {p.hostName} ({p.hostArea})</span>
                  <button
                    onClick={() => handleDeletePlan(p.id, p.title)}
                    title="企画を削除"
                    className="text-stone-500 hover:text-red-400 ml-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <h3 className="text-sm font-bold text-white mb-2 pr-24">{p.title}</h3>
                <div className="flex items-center text-[11px] text-teal-300 mb-1.5">
                  <Calendar className="w-3.5 h-3.5 mr-1" /> {p.date}
                </div>
                <div className="flex items-center text-[11px] text-teal-300 mb-3">
                  <MapPin className="w-3.5 h-3.5 mr-1" /> {p.point}
                </div>
                <p className="text-[11px] text-stone-400 bg-stone-950 p-2.5 rounded-lg leading-relaxed mb-3">{p.description}</p>
                
                <div className="flex items-center justify-between text-[10px] text-stone-400 mb-3 px-1">
                  <div className="flex items-center space-x-1">
                    <Users className="w-3.5 h-3.5" />
                    <span>参加予定: {p.participants?.join(', ')}</span>
                  </div>
                  <span>あと {spotsLeft} 名</span>
                </div>

                {isJoined ? (
                  <div className="w-full bg-teal-900/30 border border-teal-500/50 text-teal-400 text-xs font-bold py-2.5 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 mr-1.5" /> 参加予約済み
                  </div>
                ) : isFull ? (
                  <div className="w-full bg-stone-800 text-stone-500 text-xs font-bold py-2.5 rounded-lg flex items-center justify-center">
                    満員御礼
                  </div>
                ) : (
                  <button onClick={() => handleJoinPlan(p.id, p.participants || [])} className="w-full bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold py-2.5 rounded-lg transition-colors">
                    参加を予約する
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}