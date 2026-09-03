---
trigger: always_on
---

- Model Freezing: NEVER modify, upgrade, downgrade, or change hardcoded Gemini API model names (e.g., `gemini-3.5-flash-lite`,`gemini-3.5-flash`,`gemini-3.6-flash`) or endpoints unless explicitly instructed.
- Adapter Pattern Enforcement: All UI elements, event listeners, and business logic MUST interact strictly through the global `ApiService`. NEVER write `google.script.run` directly in UI code or component logic. NEVER scatter `if (isGasEnv)` checks across event listeners or UI handlers.
- Environment Detection: `const isGasEnv = typeof google !== 'undefined' && Boolean(google?.script?.run);` must only be evaluated once inside the `ApiService` abstraction.
- Dual-State Parity: Every method on `ApiService` must implement two branches returning identical Promise signatures: (1) GAS (`isGasEnv === true`): Calls `google.script.run.withSuccessHandler().withFailureHandler()`. (2) Local (`isGasEnv === false`): Interacts with `localStorage` (keys: `MOCK_SHEET_DATA`, `MOCK_CUSTOM_SETTINGS`) with mocked async latency. Local mode must auto-seed default transactions/settings if storage is empty, enabling full zero-config offline testing.