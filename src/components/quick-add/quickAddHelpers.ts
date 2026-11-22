import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { evaluateArithmeticExpression } from '../CalculatorKeypad';
import { SegmentOption } from '../ui/SpringSegmentedControl';
import { AiChatMessage, CurrencyCode, TransactionInput } from '../../types/ledger';
import { isValidCalendarDate, isValidClockTime } from '../../utils/dateTime';

export type ModalMode = 'manual' | 'ai';

export const MODE_SEGMENT_OPTIONS: SegmentOption<ModalMode>[] = [
  { value: 'manual', label: '⚡ 極速記帳' },
  { value: 'ai', label: '✨ AI 智慧記帳' },
];

export interface AttachedImage {
  uri: string;
  base64: string;
  mimeType: string;
}

export const WELCOME_AI_MESSAGE: AiChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: '您好！我是 Gemini 3.5 AI 智慧記帳助理。\n直接輸入消費描述、點選範例，或上傳收據照片，解析後即可微調並一鍵寫入帳本！',
};

export const MAX_VOICE_SECONDS = 60;

export const QUICK_AI_PROMPTS = [
  '🍜 東京拉麵 1080 JPY 現金',
  '💰 接案收入 35000 元 永豐銀行',
  '☕ 星巴克拿鐵 155 LINE Pay',
  '🚇 捷運通勤 35 悠遊卡',
];

export function formatDuration(totalSec: number): string {
  const safeSec = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safeSec / 60);
  const secs = safeSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function triggerHapticSuccess(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function triggerHapticLight(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function validateManualFields(params: {
  expression: string;
  date: string;
  time: string;
  isTransferCreate: boolean;
  account: string;
  toAccount: string;
}): { error?: string; finalAmount: number; cleanDate: string; cleanTime: string } {
  const finalAmount = Math.max(0, evaluateArithmeticExpression(params.expression));
  if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
    return { error: '請輸入大於 0 的有效金額', finalAmount: 0, cleanDate: '', cleanTime: '' };
  }
  const cleanDate = params.date.trim();
  const cleanTime = params.time.trim();
  if (!isValidCalendarDate(cleanDate) || !isValidClockTime(cleanTime)) {
    return {
      error: '請輸入有效日期 (YYYY-MM-DD) 與時間 (HH:mm)',
      finalAmount,
      cleanDate,
      cleanTime,
    };
  }
  if (params.isTransferCreate && params.toAccount === params.account) {
    return { error: '轉出與轉入帳戶不可相同', finalAmount, cleanDate, cleanTime };
  }
  return { finalAmount, cleanDate, cleanTime };
}

export function buildManualTransferInputs(params: {
  date: string;
  time: string;
  account: string;
  toAccount: string;
  itemName: string;
  currency: CurrencyCode;
  amount: number;
  note: string;
}): TransactionInput[] {
  const customName = params.itemName.trim();
  return [
    {
      date: params.date,
      time: params.time,
      account: params.account,
      name: customName || '轉帳至' + params.toAccount,
      category: '內部轉帳',
      currency: params.currency,
      amount: -params.amount,
      note: params.note,
    },
    {
      date: params.date,
      time: params.time,
      account: params.toAccount,
      name: customName || '從' + params.account + '轉入',
      category: '內部轉帳',
      currency: params.currency,
      amount: params.amount,
      note: params.note,
    },
  ];
}
