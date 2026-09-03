# 📊 Google Sheets 多幣別 AI 智慧記帳系統 (GAS + HTML5)

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](https://opensource.org/licenses/MIT)
[![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-4285F4?logo=google&logoColor=white)](https://developers.google.com/apps-script)
[![Gemini AI](https://img.shields.io/badge/Gemini%20AI-8E75B2?logo=google-gemini&logoColor=white)](https://ai.google.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

這是一套基於 **Google 試算表 (Google Sheets)** 與 **Google Apps Script (GAS)** 的現代化開源多幣別記帳系統。結合了 **Gemini 3.5 AI 自然語言與多模態解析**（支援發票相片、語音、文字記帳）、**即時匯率自動折算**與**動態財務分析儀表板**。

專案內建**本地離線 Mock 測試環境**，即使不部署至 Google 雲端，也能在瀏覽器中直接進行零設定的離線測試與體驗。

---

## ✨ 核心特色亮點 (Key Features)

- 🤖 **Gemini 3.5 多模態智慧記帳**：
  - **自然語言記帳**：直接打字（例：「中午跟同事吃鼎泰豐花 850，用 LINE Pay 付款」），AI 自動解析日期、時間、付款帳戶、金額、分類與備註。
  - **多模態辨識**：支援上傳發票、收據相片或螢幕截圖，AI 自動提取消費明細與金額。
  - **語音記帳**：支援錄製語音，透過語音輸入快速解析記帳資訊。
  - **防重複寫入安全鎖**：寫入時自動啟用載入狀態與防連點機制，避免網路延遲造成重複記帳。
- 📈 **視覺化財務儀表板**：
  - **資產總覽**：即時呈現總資產、總負債、當月總收入、當月總支出及淨現金流。
  - **動態圖表 (Chart.js)**：三大分析圖表（支出分類佔比圓餅圖、各帳戶餘額柱狀圖、每日收支走勢圖）。
  - **進階多維度篩選**：支援年份、月份、日期範圍、帳戶、分類、幣別與全文關鍵字搜尋。
- 💱 **即時多幣別匯率自動折算**：
  - 支援 TWD, JPY, USD, EUR, KRW, CNY, GBP, HKD, SGD, THB 等主流幣別。
  - 串接即時外匯 API，並具備 Google Apps Script CacheService 智慧快取機制，保障 API 呼叫效率。
- ⚙️ **高度自訂設定與雙向持久化**：
  - 支援自訂帳戶清單與消費分類，可隨時於介面中新增/刪除，並同步儲存至 Google 試算表或本地的 `localStorage`。
- 📋 **內建 60 筆開源範本資料庫**：
  - 一鍵匯入 60 筆涵蓋食衣住行、轉帳、初始資產與多幣別交易的標準範例，方便開箱即用與測試。
- 📥 **CSV 批次匯入與匯出**：
  - 支援匯出標準 UTF-8 附帶 BOM 的 CSV 檔案，與 Excel 及其他記帳軟體完美相容。

---

## 📁 專案目錄結構 (Project Structure)

本專案採用**輕量、專注且易於維護**的結構。由於本系統為無伺服器 (Serverless) 的前端單網頁應用程式 (SPA)，我們移除了繁瑣的建置工具，保持程式碼的高可讀性：

```text
gemledger-26/
├── Code.gs                 # GAS 後端（處理試算表讀寫、Gemini API 請求、503 Fallback 與匯率快取）
├── index.html              # 前端 Web App 主程式（HTML5 + Tailwind CDN + Chart.js + ApiService 適配器）
├── appsscript.json         # Google Apps Script 專案資訊資訊清單 (Manifest)
├── .claspignore            # Clasp 同步白名單（防止上傳敏感檔或非 GAS 程式碼）
├── .clasp.json.example     # Clasp 本地專案設定範本
├── package.json            # 本地開發與 Clasp CLI 指令管理
├── 記帳本.xlsx              # 初始 Google 試算表範本（含系統設定分頁、科目分類與欄位格式）
├── .gitignore              # Git 敏感憑證與隱私防護清單
└── README.md               # 專案技術手冊與架構說明
```

---

## 💻 本地端測試與開發工作流 (Local Workflow)

本系統具備 **Dual-State Parity（雙環境適配模式）**。在本地瀏覽器開啟時，系統會自動切換為 **Mock 測試模式**，所有的資料讀寫與設定都會儲存於瀏覽器的 `localStorage` 中，並模擬異步網路延遲，提供完全離線的測試體驗。

### 1. 本地預覽伺服器
專案已內建本地開發服務指令，可在本機進行零設定的前端熱重載與除錯：
```bash
# 啟動本地靜態預覽伺服器 (Port 4173)
npm run dev

# 或使用 npx serve
npx serve . -l 4173
```
開啟瀏覽器訪問 `http://localhost:4173/` 即可立即體驗。點選側邊欄的 **「帳戶與分類設定」**，滑到下方點選 **「匯入 60 筆範例資料」**，即可檢視完整圖表分析與 AI 記帳功能。

---

## ⚡ Google Apps Script (GAS) CLI 本地開發與 Clasp 部署流程

本專案全面支援 Google 官方的 [@google/clasp](https://github.com/google/clasp) 工具鏈，讓工程師能在本地 IDE（如 VS Code / Cursor）中撰寫程式碼、享有 Git 版本控制，並一鍵同步至 Google Apps Script 雲端。

### 步驟 1：安裝與登入 Clasp
```bash
# 透過 npm 安裝相依項（包含 @google/clasp 與 @types/google-apps-script）
npm install

# 登入您的 Google 帳號
npm run login
# 或執行：npx clasp login
```
> [!TIP]
> 首次使用 clasp 前，請至 [Google Apps Script 使用者設定](https://script.google.com/home/usersettings) 開啟 **「Google Apps Script API」** 開關（切換為 ON）。

### 步驟 2：綁定 Google Apps Script 專案
若您已在 Google 試算表中建立了 Apps Script 專案：
1. 複製該專案的 **Script ID**（可於 Apps Script 編輯器的「專案設定」齒輪中找到）。
2. 建立 `.clasp.json`（可複製 `.clasp.json.example`）：
   ```json
   {
     "scriptId": "你的_APPS_SCRIPT_ID",
     "rootDir": "."
   }
   ```
3. 或是直接在終端機執行複製專案：
   ```bash
   npx clasp clone "你的_APPS_SCRIPT_ID"
   ```

### 步驟 3：推送與同步程式碼 (Push / Pull)
專案已配置精確的 [`.claspignore`](./.claspignore)，在執行 push 時**只會上傳 `Code.gs`、`index.html` 與 `appsscript.json`**，自動徹底過濾 `node_modules`、`.git`、`記帳本.xlsx`、`package.json` 等非 GAS 檔案。

```bash
# 將本地修改推送至 Google Apps Script
npm run push

# 從 Google Apps Script 拉取最新雲端版本
npm run pull

# 在瀏覽器中快速開啟該 Apps Script 專案
npm run open
```

### 步驟 4：發布為 Web App 部署作業
```bash
# 建立新的部署版本
npm run deploy

# 查詢目前的部屬清單
npm run deployments
```

---

## 🤖 Gemini API 呼叫規範與架構 (AI Integration Spec)

### 1. 模型規範 (Model Freezing)
- **固定模型**：`gemini-3.5-flash-lite`（本專案嚴格遵循模型版本鎖定原則，不得擅自更動端點或模型名稱）。
- **請求端點**：
  ```http
  POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key={GEMINI_API_KEY}
  ```
- **生成參數 (GenerationConfig)**：
  - `responseMimeType`: `"application/json"`（強制要求結構化 JSON 回應）
  - `temperature`: `0.1`（低溫取樣確保欄位識別穩定精準）

### 2. 資料結構規範 (JSON Output Schema)
AI 回應經由 System Prompt 引導輸出為嚴格的 JSON 格式：
```json
{
  "reply": "解析成功！請核對以下記帳明細：",
  "transactions": [
    {
      "name": "鼎泰豐小籠包",
      "amount": -850,
      "currency": "TWD",
      "category": "食",
      "account": "LINE Pay",
      "date": "2026-09-03",
      "time": "12:30",
      "note": "與同事聚餐"
    }
  ]
}
```

### 3. 金額正負號判定準則 (Sign Rules)
- **支出（Money Out）**：所有消費、購物、付款、聚餐、交通、帳單、手續費等，金額**一律為負數**（例：`-150`）。
- **收入（Money In）**：薪資、投資獲利、股息/配息、退款、代墊款歸還、紅包禮金等，金額**一律為正數**（例：`5000`）。
- **動態帳戶與分類對齊**：GAS 後端在生成 Prompt 時，會動態注入「系統設定」工作表內的自訂科目與帳戶清單，使 AI 精準匹配現有分類。

---

## 🛡️ 自動化錯誤處理與 503 Fallback 容錯策略 (Fault Tolerance)

在雲端環境中，外部 API 可能因網路波動、配額限制或伺服器負載出現短暫異常。為確保記帳系統高可用性，本專案在 [`Code.gs`](./Code.gs) 實作了雙層防護網：

### 1. 指數退避重試演算法 (Exponential Backoff with Full Jitter)
當呼叫 Gemini API 或即時匯率 API 遇到下列狀態碼時，系統會自動啟動重試機制：
- **觸發條件**：HTTP `503` (Service Unavailable)、`429` (Rate Limit / Quota Exceeded)、`500`、`502`、`504` 或網路連線逾時中斷。
- **略過重試**：HTTP `400` (格式錯誤)、`401/403` (API Key 無效或權限不足) 直接終止重試並回報。
- **重試延遲公式**：
  $$\text{Delay} = \min\left(8000\text{ms},\, 1000\text{ms} \times 2^{\text{attempt}} + \text{random}(0, 500\text{ms})\right)$$
- 最多進行 **3 次重試**，藉由隨機抖動 (Jitter) 避免伺服器驚群效應 (Thundering Herd)。

### 2. 503 伺服器過載後端規則型備援解析器 (Rule-based Fallback Parser)
若 3 次重試後 Gemini 雲端仍處於 503 伺服器過載或斷線狀態，系統會啟動 **Fallback 備援降級策略**：
1. **純文字輸入**：
   - 自動切換至後端規則解析引擎 `fallbackParseTransaction()`。
   - 使用正規表達式提取金額數字，並比對「收入/薪資/獎金/配息」關鍵字判定正負號。
   - 與使用者在試算表設定的帳戶與分類進行關聯比對（支援交通、餐飲、衣飾、居住等智慧詞性推論）。
   - 帶入當前時區時間，立即生成結構化交易紀錄草稿。
   - 介面提示：`⚠️ Gemini API 雲端伺服器目前過載 (503 Service Unavailable)。系統已自動啟動【規則備援引擎】解析記帳草稿，請核對明細無誤後即可寫入：`
2. **多模態影像 / 語音輸入**：
   - 由於 503 狀態下雲端多模態模型無法運算，系統將提供友善的降級指引訊息，建議使用者稍候重試或改以文字速記，避免畫面空白或卡死。

---

## 🔒 安全防護與敏感憑證隔離規範 (Security & Privacy)

為了保護開發者個人隱私與防止雲端憑證外洩，本專案實施嚴格的安全隔離策略：

1. **`.gitignore` 憑證與個人資料防護**：
   - **Apps Script 憑證**：排除 `.clasp.json` 與全域認證檔 `.clasprc.json`。
   - **GCP 密鑰與金鑰**：排除 `*credential*.json`、`*secret*.json`、`service_account*.json`、`*.pem`、`*.key`。
   - **個人財務試算表**：排除所有 `*.xlsx`、`*.xls`、`*.csv` 實體檔案，僅以白名單保留乾淨範本 `!記帳本.xlsx`。
   - **本地環境檔與暫存**：排除 `.env*`、`.cache/`、`node_modules/`、`*.log`。
2. **API 金鑰安全儲存**：
   - 嚴格禁止將 Gemini API Key 硬編碼於原始碼中。
   - API Key 僅能儲存於 Google Apps Script 的 **指令碼屬性 (`PropertiesService.getScriptProperties()`)** 中，不會隨著前端網頁原始碼傳播。

---

## ☁️ 手動網頁介面部署教學 (Manual Setup via Browser)

若您不打算使用命令列工具，亦可透過瀏覽器手動部署：

### 步驟 1：建立並設定 Google 試算表
1. 開啟 [Google 試算表](https://sheets.google.com/)，建立一份全新的試算表，命名為「**我的多幣別 AI 智慧記帳本**」。
2. 使用 Excel 開啟本專案中的 `記帳本.xlsx`，將裡面的工作表內容（包括 `記帳資料` 與 `系統設定` 兩個分頁）完整複製並貼上到你的 Google 試算表中。

### 步驟 2：開啟 Apps Script 編輯器
1. 在試算表上方選單，點選 **「擴充功能」 > 「Apps Script」**。
2. 將左上角的專案名稱重新命名為「**Google Sheets AI 記帳系統**」。

### 步驟 3：貼上專案程式碼
1. **後端邏輯 (`Code.gs`)**：清空內容，貼上本專案中的 [`Code.gs`](./Code.gs)。
2. **前端網頁 (`index.html`)**：新增名為 **`index`** 的 HTML 檔，貼上本專案中的 [`index.html`](./index.html)。

### 步驟 4：設定 Gemini API Key
1. 前往 [Google AI Studio](https://aistudio.google.com/) 免費申請一個 **Gemini API Key**。
2. 在 Apps Script 編輯器點選左側齒輪 **「專案設定」**。
3. 新增指令碼屬性：`GEMINI_API_KEY` = `你的_GEMINI_API_KEY_字串`。

### 步驟 5：發布 Web App
1. 點選 **「部署」 > 「新增部署作業」**，類型選擇 **「網頁應用程式」**。
2. 存取權限設定為 **「僅限我自己」**，點選部署並完成授權即可獲得記帳專屬網址！

---

## 🗃️ 試算表資料結構規範 (Data Schema)

為確保 AI 解析與資料處理正確無誤，請勿更動工作表名稱與預設的欄位順序：

### 1. 工作表：「記帳資料」
| 欄位 | 欄位名稱 | 範例值 | 說明 |
| :---: | :--- | :--- | :--- |
| **A** | 日期 | `2026-08-19` | 標準 `YYYY-MM-DD` 格式 |
| **B** | 時間 | `12:30` | `HH:mm` 24小時制格式 |
| **C** | 帳戶 | `LINE Pay` | 扣款或收入之帳戶（須與系統設定一致） |
| **D** | 項目名稱 | `全家超商咖啡` | 交易項目名稱 |
| **E** | 分類 | `食` | 交易類別（須與系統設定一致） |
| **F** | 幣別 | `TWD` | 原始幣別（TWD, JPY, USD 等） |
| **G** | 金額 | `-85` | 支出請輸入負數 (例如 `-85`)，收入請輸入正數 |
| **H** | 備註 | `美式咖啡大杯` | 額外補充資訊 |

### 2. 工作表：「系統設定」
* **A 欄 (帳戶列表)**：現金、LINE Pay、郵局、LINE Bank、信用卡等。
* **B 欄 (分類列表)**：食、衣、住、行、育、樂、醫療/雜項、投資、收入、內部轉帳、初始資產等。

---

## 🛠️ 技術棧清單 (Tech Stack)

* **前端架構**：Vanilla HTML5 + Modern JavaScript (ES6+)
* **樣式/UI 設計**：Tailwind CSS (透過 CDN 載入)
* **圖表引擎**：Chart.js (互動式響應圖表)
* **圖示庫**：Lucide Icons (向量圖示)
* **後端資料庫**：Google Sheets (Google 試算表)
* **後端邏輯/API 閘道**：Google Apps Script (GAS V8 Engine)
* **本機部署與版本控制工具**：Google Clasp CLI (`@google/clasp`)
* **AI 核心引擎**：Gemini 3.5 Flash Lite (`gemini-3.5-flash-lite`)
* **外匯資料**：ExchangeRate-API (結合 GAS ScriptCache 雙層快取)

---

## 📄 開源授權 (License)

本專案基於 [MIT License](LICENSE) 授權開源。您可以自由複製、修改、發布或用於個人及商業用途。

