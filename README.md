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
├── Code.gs             # GAS 後端（處理試算表讀寫、Gemini API 請求與即時匯率快取）
├── index.html          # 前端 Web App 主程式（HTML5 + Tailwind CDN + Chart.js + JavaScript 邏輯）
├── 記帳本.xlsx          # 初始 Google 試算表範本（含系統設定分頁、科目分類與欄位格式）
├── .gitignore          # Git 忽略檔案清單
└── README.md           # 本說明文件
```

> [!NOTE]
> 專案根目錄下的 `package.json`、`vite.config.ts` 與 `/src` 資料夾為腳手架初始化的遺留檔案。若您只使用純前端 CDN 模式與 GAS 部署，可直接將其忽略或移除。

---

## 💻 本地端測試步驟 (Local Offline Testing)

本系統具備 **Dual-State Parity（雙環境適配模式）**。在本地瀏覽器開啟時，系統會自動切換為 **Mock 測試模式**，所有的資料讀寫與設定都會儲存於瀏覽器的 `localStorage` 中，並模擬異步網路延遲，提供完全離線的測試體驗。

1. **取得程式碼**：確保本地有 `index.html`。
2. **啟動本機伺服器**（推薦）：
   - 使用 VS Code 的 **Live Server** 插件開啟 `index.html`。
   - 或者在終端機執行：`npx serve .` 或 `npm run dev`。
3. **直接開啟**：亦可直接用滑鼠雙擊 `index.html` 以瀏覽器開啟。
4. **載入範例資料**：進入網頁後，點選側邊欄的 **「帳戶與分類設定」**，滑到下方點選 **「匯入 60 筆範例資料」**，即可立刻體驗儀表板的強大功能！

---

## ☁️ Google Apps Script (GAS) 雲端部署教學

當您準備將記帳本上線並與 Google 試算表實時同步時，請按照以下步驟部署：

### 步驟 1：建立並設定 Google 試算表
1. 開啟 [Google 試算表](https://sheets.google.com/)，建立一份全新的試算表，命名為「**我的多幣別 AI 智慧記帳本**」。
2. 使用 Excel 開啟本專案中的 `記帳本.xlsx`，將裡面的工作表內容（包括 `記帳資料` 與 `系統設定` 兩個分頁）完整複製並貼上到你的 Google 試算表中。

### 步驟 2：開啟 Apps Script 編輯器
1. 在試算表上方選單，點選 **「擴充功能」 > 「Apps Script」**。
2. 將左上角的專案名稱重新命名為「**Google Sheets AI 記帳系統**」。

### 步驟 3：貼上專案程式碼
1. **後端邏輯 (`Code.gs`)**：
   - 點選左側的 `程式碼.gs`（或 `Code.gs`），清空內容，將本專案中的 [`Code.gs`](./Code.gs) 內容完整複製並貼上，按下 `Ctrl+S` (或 `Cmd+S`) 儲存。
2. **前端網頁 (`index.html`)**：
   - 點選左側「檔案」旁的 **「+」** 按鈕，選擇 **「HTML」**。
   - 將該檔案命名為 **`index`**（系統會建立 `index.html`）。
   - 清空其預設內容，將本專案中的 [`index.html`](./index.html) 內容完整複製並貼上，按下 `Ctrl+S` 儲存。

### 步驟 4：設定 Gemini API Key
1. 前往 [Google AI Studio](https://aistudio.google.com/) 免費申請一個 **Gemini API Key**。
2. 回到 Apps Script 編輯器，點選左側齒輪圖示的 **「專案設定」**。
3. 滑動到最下方的 **「指令碼屬性」**，點選 **「新增指令碼屬性」**：
   - **屬性 (Property)**: `GEMINI_API_KEY`
   - **值 (Value)**: `你的_GEMINI_API_KEY_字串`
4. 點選 **「儲存指令碼屬性」**。

### 步驟 5：發布 Web App
1. 點選右上角的 **「部署」 > 「新增部署作業」**。
2. 點選「選取類型」齒輪圖示，選擇 **「網頁應用程式」**。
3. 進行以下設定：
   - **說明**：`v1.0.0`
   - **執行身分**：`我 (您的 Google 帳號)`
   - **誰可以存取**：`僅限我自己` (若要與家人共用可設定為「任何人」)
4. 點選 **「部署」**。首次部署時，Google 會要求授權存取您的雲端硬碟與試算表，請點選 **「授予存取權」** 並允許。
5. 部署成功後，複製畫面上的 **「網頁應用程式網址」**。這就是您的專屬個人記帳網址！

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
* **後端邏輯/API 閘道**：Google Apps Script (GAS)
* **AI 核心引擎**：Gemini 3.5 Flash / Pro (透過 API 進行多模態解析)

---

## 📄 開源授權 (License)

本專案基於 [MIT License](LICENSE) 授權開源。您可以自由複製、修改、發布或用於個人及商業用途。
