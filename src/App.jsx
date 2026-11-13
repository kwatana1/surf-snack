import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, addDoc, updateDoc, arrayUnion, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Wine, Waves, Users, MessageSquare, User, ChevronRight, Send, Loader2, Sparkles, Coffee, MapPin, Compass, Plus, Calendar, Info, CheckCircle2 } from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let app, auth, db, genAI;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
} catch (e) {
  console.error("Firebase/Gemini initialization error", e);
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
          <KarteScreen user={user} initialData={karte} onComplete={(data) => {
            setKarte(data);
            setScreen('main');
          }} />
        )}
        {screen === 'main' && (
          <MainLayout karte={karte} user={user} />
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
          <span>マスターに挨拶する</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

// ==========================================
// Karte Screen
// ==========================================
function KarteScreen({ user, initialData, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nickname: initialData?.nickname || '',
    age: '',
    gender: '',
    homeArea: '東京都',
    homeDetail: '',
    targetPoint: '混雑の少ない穏やかな海ならどこでも',
    customPoint: '',
    blankYears: '',
    physicalLevel: '',
    anxieties: []
  });

  const toggleAnxiety = (val) => {
    setForm(p => ({ ...p, anxieties: p.anxieties.includes(val) ? p.anxieties.filter(a => a !== val) : [...p.anxieties, val].slice(0, 3) }));
  };

  const handleSubmit = async () => {
    if (!form.age || !form.gender || !form.homeArea || !form.targetPoint || !form.blankYears || !form.physicalLevel) {
      alert("必須項目を選択してください。"); return;
    }
    const finalTargetPoint = form.targetPoint === 'その他（直接入力）' ? (form.customPoint || 'その他') : form.targetPoint;
    const dataToSave = { ...form, targetPoint: finalTargetPoint, uid: user.uid, createdAt: serverTimestamp() };
    
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
      <div className="p-6 pt-10 pb-6 bg-stone-900 border-b border-stone-800">
        <h2 className="text-2xl font-bold text-white mb-1">Re-Surf カルテ</h2>
        <p className="text-stone-400 text-xs">ありのままの「今の状態」を教えてください。</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6 pb-24 space-y-7">
        
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
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'スナックに入店する'}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// Main Layout (Bottom Navigation)
// ==========================================
function MainLayout({ karte, user }) {
  const [activeTab, setActiveTab] = useState('lobby'); // lobby, consult, resurf
  const [chatPartner, setChatPartner] = useState(null);

  if (chatPartner) {
    return <ChatScreen karte={karte} partner={chatPartner} onBack={() => setChatPartner(null)} />;
  }

  return (
    <div className="flex-1 flex flex-col bg-stone-950 h-screen relative">
      <div className="flex-1 overflow-y-auto pb-20">
        {activeTab === 'lobby' && <LobbyTab karte={karte} onSelectPartner={setChatPartner} />}
        {activeTab === 'consult' && <ConsultTab karte={karte} />}
        {activeTab === 'resurf' && <ReSurfTab karte={karte} />}
      </div>

      <div className="absolute bottom-0 w-full bg-stone-900/95 backdrop-blur border-t border-stone-800 flex justify-around items-center pb-safe pt-2 px-2 z-50">
        <NavButton active={activeTab==='lobby'} onClick={()=>setActiveTab('lobby')} icon={<Wine className="w-6 h-6 mb-1"/>} label="入店" />
        <NavButton active={activeTab==='consult'} onClick={()=>setActiveTab('consult')} icon={<MessageSquare className="w-6 h-6 mb-1"/>} label="なんでも相談" />
        <NavButton active={activeTab==='resurf'} onClick={()=>setActiveTab('resurf')} icon={<Waves className="w-6 h-6 mb-1"/>} label="Re-Surf" />
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center w-20 py-2 transition-colors ${active ? 'text-teal-400' : 'text-stone-500 hover:text-stone-300'}`}>
      {icon}
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}

// ==========================================
// Tab 1: Lobby
// ==========================================
function LobbyTab({ karte, onSelectPartner }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.nickname && data.nickname !== karte.nickname) {
          fetched.push({ id: doc.id, ...data });
        }
      });
      setUsers(fetched);
    });
    return () => unsubscribe();
  }, [karte.nickname]);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between mb-2 mt-2">
        <h2 className="text-lg font-bold text-white flex items-center">
          <Wine className="w-5 h-5 text-teal-400 mr-2" />
          今夜の相席カウンター
        </h2>
        <span className="text-[10px] bg-stone-800 text-teal-400 px-2 py-1 rounded-full border border-teal-900/50 flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mr-1 animate-pulse" />
          リアルタイム
        </span>
      </div>
      
      {users.length === 0 ? (
        <div className="bg-stone-900 border border-stone-800 p-8 rounded-2xl text-center text-stone-500 text-xs">
          まだ誰もカウンターにいません。<br/>他の端末から登録すると、ここにリアルタイムで表示されます。
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
                <button onClick={() => onSelectPartner(u)} className="bg-teal-900/40 hover:bg-teal-800 border border-teal-500/50 text-teal-100 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center">
                  <span>相席を頼む</span><ChevronRight className="w-3 h-3 ml-0.5" />
                </button>
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
// Tab 2: Consult
// ==========================================
function ConsultTab({ karte }) {
  return <ChatScreen karte={karte} isConsultMode={true} />;
}

// ==========================================
// Tab 3: Re-Surf (企画/予約 - ⭐️参加機能追加版)
// ==========================================
function ReSurfTab({ karte }) {
  const [plans, setPlans] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlan, setNewPlan] = useState({ title: '', date: '', point: '', description: '', capacity: 4 });

  useEffect(() => {
    const q = query(collection(db, 'plans'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = [];
      snapshot.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));
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
        participants: [karte.nickname], // 主催者を最初の参加者として登録
        createdAt: serverTimestamp()
      });
      setIsCreating(false);
      setNewPlan({ title: '', date: '', point: '', description: '', capacity: 4 });
    } catch (e) {
      console.error("Plan creation failed", e);
    }
  };

  const handleJoinPlan = async (planId, participants) => {
    if (participants.includes(karte.nickname)) return; // すでに参加済み
    try {
      const planRef = doc(db, 'plans', planId);
      await updateDoc(planRef, {
        participants: arrayUnion(karte.nickname) // 配列に自分の名前を追加
      });
    } catch (e) {
      console.error("Join failed", e);
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
                <div className="absolute top-0 right-0 bg-stone-800 text-stone-400 text-[9px] px-2 py-1 rounded-bl-lg">
                  主催: {p.hostName} ({p.hostArea})
                </div>
                <h3 className="text-sm font-bold text-white mb-2 pr-16">{p.title}</h3>
                <div className="flex items-center text-[11px] text-teal-300 mb-1.5">
                  <Calendar className="w-3.5 h-3.5 mr-1" /> {p.date}
                </div>
                <div className="flex items-center text-[11px] text-teal-300 mb-3">
                  <MapPin className="w-3.5 h-3.5 mr-1" /> {p.point}
                </div>
                <p className="text-[11px] text-stone-400 bg-stone-950 p-2.5 rounded-lg leading-relaxed mb-3">{p.description}</p>
                
                {/* 参加者リスト */}
                <div className="flex items-center justify-between text-[10px] text-stone-400 mb-3 px-1">
                  <div className="flex items-center space-x-1">
                    <Users className="w-3.5 h-3.5" />
                    <span>参加予定: {p.participants?.join(', ')}</span>
                  </div>
                  <span>あと {spotsLeft} 名</span>
                </div>

                {/* 予約ボタンの条件分岐 */}
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

// ==========================================
// Chat Component
// ==========================================
function ChatScreen({ karte, partner, isConsultMode, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const modelRef = useRef(null);

  useEffect(() => {
    if (!genAI) {
      setMessages([{ role: 'model', text: 'マスターの準備ができていません。APIキーを確認してください。' }]);
      return;
    }

    try {
      let systemPrompt = '';
      let initialGreeting = '';

      if (isConsultMode) {
        systemPrompt = `あなたは「SURF SNACK」という大人のリターンサーファー向けコミュニティのマスターです。サーフィンの道具選び（ボードの浮力、ウェットスーツ）、全国のポイント情報、復帰に向けたトレーニングなど、サーフィンに関する「なんでも相談」に答えてください。
ユーザー: ${karte.nickname} (${karte.age}/${karte.blankYears}ブランク)
スタンス: 専門用語を使いすぎず、おじさんの体力低下に寄り添い、優しく的確にアドバイスする。LINEのように短く。`;
        initialGreeting = `いらっしゃい、${karte.nickname}さん。道具のこと、ポイントのこと、なんでも聞いてよ。${karte.blankYears.split('(')[0]}ぶりだと、今のボードの浮力とかウェットの進化にびっくりするかもね。`;
      } else {
        systemPrompt = `あなたは「SURF SNACK」の気のいいマスターです。
ユーザー: ${karte.nickname} (${karte.homeArea})
相席相手: ${partner.nickname} (${partner.age} / 拠点: ${partner.homeArea} / 悩み: ${partner.anxieties?.join(',')})
スタンス: お互いの悩みや居住エリアに触れながら、2人で海に行く（波待ちコーヒーから始める）ことを自然にアシストする。LINEのように短く。`;
        initialGreeting = `おう、${karte.nickname}。${partner.nickname}（${partner.homeArea}）と相席してみたい？ あいつも「${partner.anxieties?.[0] || 'ブランク'}」で悩んでてさ。マスターが間に入るから、今度一緒に波待ちでもセッティングしようか？`;
      }

      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', systemInstruction: systemPrompt });
      modelRef.current = model.startChat();
      setMessages([{ role: 'model', text: initialGreeting }]);
    } catch (e) {
      console.error(e);
      setMessages([{ role: 'model', text: 'ちょっと裏でグラス洗ってて遅れちゃった。' }]);
    }
  }, [karte, partner, isConsultMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || !modelRef.current) return;
    const textToSend = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setLoading(true);

    try {
      const result = await modelRef.current.sendMessage(textToSend);
      setMessages(prev => [...prev, { role: 'model', text: result.response.text() }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', text: 'ごめん、聞き取れなかった。もう一度言ってくれる？' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-950 absolute inset-0 z-40">
      <header className="p-3.5 bg-stone-900 border-b border-stone-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {!isConsultMode && (
            <button onClick={onBack} className="p-1.5 text-stone-400 hover:text-white rounded-lg bg-stone-800">
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
          )}
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-full bg-teal-900/50 border border-teal-500/30 flex items-center justify-center">
              {isConsultMode ? <Info className="w-4 h-4 text-teal-400" /> : <Coffee className="w-4 h-4 text-teal-400" />}
            </div>
            <div>
              <span className="text-xs font-bold text-white">{isConsultMode ? 'マスターになんでも相談' : '相席セッティング'}</span>
              <p className="text-[10px] text-stone-500">{isConsultMode ? '道具・ポイント・悩み相談' : `相手: ${partner?.nickname}`}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          return (
            <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-md ${isUser ? 'bg-teal-700 text-white rounded-br-sm' : 'bg-stone-800 text-stone-200 border border-stone-700 rounded-bl-sm'}`}>
                {m.text}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-stone-800 border border-stone-700 rounded-2xl px-4 py-3 text-stone-400 text-xs flex items-center space-x-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
              <span>マスターが返事を書いています...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 bg-stone-900 border-t border-stone-800 pb-safe">
        <form onSubmit={handleSend} className="flex space-x-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} disabled={loading} placeholder={isConsultMode ? "浮力のあるボードはどれがいい？" : "マスターにお願いしてみる..."} className="flex-1 bg-stone-950 border border-stone-700 rounded-full px-4 py-3 text-xs text-white focus:outline-none focus:border-teal-500" />
          <button type="submit" disabled={loading || !input.trim()} className="w-11 h-11 rounded-full bg-teal-600 hover:bg-teal-500 disabled:bg-stone-800 text-white flex items-center justify-center flex-shrink-0 shadow-lg">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
