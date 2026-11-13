# SURF SNACK Web App Prototype (完成版)

事業構想大学院のリサーチ・実証テスト用に設計された、リターンサーファー専用デジタルスナックのプロトタイプです。

## 完成版の主要機能
1. **完全リアルタイム相席カウンター**
   - 誰かがログイン（カルテ登録）すると、リロードなしで全員の画面に出現します。
2. **なんでも相談AIマスター（Gemini）**
   - 道具の悩みからポイント選びまで、コンプレックスをイジりながら優しくアドバイス。
3. **Re-Surf（企画・予約機能）**
   - ユーザー自身がツアーを企画可能（募集人数を設定）。
   - 「参加を予約する」ボタンを押すと、即座に参加者リスト（海ネーム）に追加され、全員の画面に同期されます。
   - 定員に達すると自動で「満員御礼」に切り替わります。

## デプロイとテストの手順（Vercel ＋ Firebase）

### 1. Vercelの環境変数設定
Vercelへデプロイする際、以下の環境変数を設定してください。
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_GEMINI_API_KEY`

### 2. Firebaseの設定（重要！）
リアルタイム通信と予約更新を動作させるため、Firebaseコンソールで以下の2つを必ず設定してください。

**① 匿名認証のON**
Authentication > Sign-in method から「匿名 (Anonymous)」を有効にしてください。

**② Firestoreルールの設定（テスト用オープン）**
Firestore Database > ルール タブを開き、以下のコードに書き換えて「公開」をクリックしてください。
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      // プロトタイプテストのため、誰でも読み書き可能に設定
      allow read, write: if true;
    }
  }
}
```
