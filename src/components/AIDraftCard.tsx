import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getAccountMeta, getCategoryMeta, HUD_RADIUS } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { HudReticle, MONO_FONT } from './ui/HudReticle';
import { SpringPressable } from './ui/SpringPressable';
import {
  AIParsedDraft,
  CurrencyCode,
  ExchangeRates,
  SUPPORTED_CURRENCIES,
} from '../types/ledger';
import { convertCurrency, formatMoney } from '../utils/currency';
import { isValidCalendarDate, isValidClockTime } from '../utils/dateTime';

export interface AIDraftCardProps {
  draft: AIParsedDraft;
  index: number;
  baseCurrency: CurrencyCode;
  exchangeRates: ExchangeRates;
  categories: string[];
  accounts: string[];
  isFallback?: boolean;
  fallbackReason?: string;
  modelUsed?: string;
  isSubmitting?: boolean;
  isSaved?: boolean;
  onUpdateDraft: (updated: AIParsedDraft) => void;
  onConfirm: (draft: AIParsedDraft) => void;
}

const FALLBACK_REASON_LABELS: Record<string, string> = {
  KEY_MISSING: '未設定 API Key',
  SIMULATE_503: '已開啟 503 離線模擬',
  AUTH_INVALID_KEY: 'API Key 無效或無權限',
  RATE_LIMIT_429: '額度或請求頻率達上限 (429)',
  TIMEOUT: '連線逾時',
  NETWORK_ERROR: '網路連線異常',
  BAD_REQUEST_400: '請求格式異常 (400)',
  PARSE_ERROR: 'AI 回應解析異常',
  SERVER_503: 'Gemini 伺服器忙碌 (503)',
  '503_SERVICE_UNAVAILABLE': '雲端服務暫時無法使用 (503)',
};

function formatFallbackReason(reason?: string): string {
  const clean = (reason || '').trim();
  if (!clean) return '';
  return FALLBACK_REASON_LABELS[clean] ?? clean;
}

export function AIDraftCard({
  draft,
  index,
  baseCurrency,
  exchangeRates,
  categories,
  accounts,
  isFallback = false,
  fallbackReason,
  modelUsed,
  isSubmitting = false,
  isSaved = false,
  onUpdateDraft,
  onConfirm,
}: AIDraftCardProps) {
  const { colors } = useAppTheme();
  const [isEditing, setIsEditing] = useState(false);

  // Local editing buffers while inline fine-tuning is open
  const [editName, setEditName] = useState(draft.name);
  const [editAmountText, setEditAmountText] = useState(String(Math.abs(draft.amount)));
  const [editIsExpense, setEditIsExpense] = useState(draft.amount <= 0);
  const [editCurrency, setEditCurrency] = useState<string>(draft.currency || baseCurrency);
  const [editCategory, setEditCategory] = useState(draft.category);
  const [editAccount, setEditAccount] = useState(draft.account);
  const [editDate, setEditDate] = useState(draft.date || '');
  const [editTime, setEditTime] = useState(draft.time || '');
  const [editNote, setEditNote] = useState(draft.note || '');
  const [editError, setEditError] = useState<string | null>(null);

  const isExpense = draft.amount <= 0;
  const catMeta = getCategoryMeta(draft.category);
  const accMeta = getAccountMeta(draft.account);

  const convertedAmount = useMemo(
    () => convertCurrency(draft.amount, draft.currency || baseCurrency, baseCurrency, exchangeRates),
    [baseCurrency, draft.amount, draft.currency, exchangeRates],
  );

  const showConverted =
    (draft.currency || baseCurrency).toUpperCase() !== baseCurrency.toUpperCase();

  const openEditor = () => {
    if (isSaved || isSubmitting) return;
    setEditName(draft.name);
    setEditAmountText(Math.abs(draft.amount) > 0 ? String(Math.abs(draft.amount)) : '');
    setEditIsExpense(draft.amount <= 0);
    setEditCurrency(draft.currency || baseCurrency);
    setEditCategory(draft.category);
    setEditAccount(draft.account);
    setEditDate(draft.date || '');
    setEditTime(draft.time || '');
    setEditNote(draft.note || '');
    setEditError(null);
    setIsEditing(true);
    console.log(`[AIDraftCard/openEditor] Open - Index:${index}, Name:${draft.name}`);
  };

  const applyEdit = (): AIParsedDraft | null => {
    const cleanAmtStr = editAmountText.trim().replace(/,/g, '');
    if (!/^\d+(?:\.\d+)?$/.test(cleanAmtStr)) {
      setEditError('請輸入有效金額（僅限正數與單一小數點）');
      return null;
    }
    const parsedNum = Number(cleanAmtStr);
    if (!Number.isFinite(parsedNum) || parsedNum <= 0) {
      setEditError('請輸入大於 0 的有效金額');
      return null;
    }
    const cleanDate = editDate.trim();
    const cleanTime = editTime.trim();
    if (!isValidCalendarDate(cleanDate) || !isValidClockTime(cleanTime)) {
      setEditError('請輸入有效日期 (YYYY-MM-DD) 與時間 (HH:mm)');
      return null;
    }

    const signedAmount = editIsExpense ? -parsedNum : parsedNum;
    const updated: AIParsedDraft = {
      ...draft,
      name: editName.trim() || draft.name || '消費項目',
      amount: signedAmount,
      currency: editCurrency,
      category: editCategory,
      account: editAccount,
      date: cleanDate,
      time: cleanTime,
      note: editNote.trim(),
    };
    console.log(
      `[AIDraftCard/applyEdit] SaveDraft - Index:${index}, Name:${updated.name}, Amt:${updated.amount} ${updated.currency}, Date:${updated.date} ${updated.time}`,
    );
    setEditError(null);
    onUpdateDraft(updated);
    setIsEditing(false);
    return updated;
  };

  const handleConfirm = () => {
    if (isSubmitting || isSaved) return;
    if (isEditing) {
      const updated = applyEdit();
      if (!updated) return;
      console.log(
        `[AIDraftCard/handleConfirm] SubmitEdited - Index:${index}, Name:${updated.name}, Amt:${updated.amount} ${updated.currency}`,
      );
      onConfirm(updated);
      return;
    }
    if (!Number.isFinite(draft.amount) || draft.amount === 0) {
      openEditor();
      setEditError('請輸入大於 0 的有效金額後再寫入');
      return;
    }
    if (!isValidCalendarDate((draft.date || '').trim()) || !isValidClockTime((draft.time || '').trim())) {
      openEditor();
      setEditError('請確認有效日期 (YYYY-MM-DD) 與時間 (HH:mm)');
      return;
    }
    console.log(
      `[AIDraftCard/handleConfirm] Submit - Index:${index}, Name:${draft.name}, Amt:${draft.amount} ${draft.currency}`,
    );
    onConfirm(draft);
  };

  const amountColor = isExpense ? colors.expense : colors.income;
  const amountPrefix = isExpense ? '' : '+';
  const fallbackLabel = formatFallbackReason(fallbackReason);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isSaved ? colors.income : colors.primary,
        },
      ]}
    >
      <HudReticle variant={isFallback ? 'accent' : 'primary'} />

      {/* Top Meta Badges Row */}
      <View style={styles.topRow}>
        <Text
          style={[
            styles.draftIndex,
            { color: isSaved ? colors.income : colors.primary },
          ]}
        >
          {isSaved ? '已寫入帳本' : `待確認草稿 #${index + 1}`}
        </Text>

        {isFallback ? (
          <View
            style={[
              styles.engineBadge,
              { backgroundColor: colors.warningBg, borderColor: colors.warning },
            ]}
          >
            <AlertTriangle size={12} color={colors.warning} />
            <Text style={[styles.engineBadgeText, { color: colors.warning }]} numberOfLines={2}>
              離線降級{fallbackLabel ? ` · ${fallbackLabel}` : ''}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.engineBadge,
              { backgroundColor: colors.accentBg, borderColor: colors.accent },
            ]}
          >
            <Sparkles size={12} color={colors.accent} />
            <Text style={[styles.engineBadgeText, { color: colors.accent }]}>
              {modelUsed || 'gemini-3.5-flash-lite'}
            </Text>
          </View>
        )}
      </View>

      {/* Main Summary Row */}
      <View style={styles.summaryRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={2}>
            {draft.name || '未命名明細'}
          </Text>
          <View style={styles.badgesRow}>
            <View
              style={[
                styles.pill,
                { backgroundColor: catMeta.bgColor, borderColor: catMeta.color },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: catMeta.color }]} />
              <Text style={[styles.pillText, { color: catMeta.color }]}>{draft.category}</Text>
            </View>
            <View
              style={[
                styles.pill,
                { backgroundColor: accMeta.bgColor, borderColor: accMeta.color },
              ]}
            >
              <Text style={[styles.pillText, { color: accMeta.color }]}>{draft.account}</Text>
            </View>
          </View>
        </View>

        <View style={styles.amountBlock}>
          <Text style={[styles.amountText, { color: amountColor }]}>
            {amountPrefix}
            {formatMoney(draft.amount, draft.currency)}
          </Text>
          <Text style={[styles.currencyTag, { color: colors.textMuted }]}>{draft.currency}</Text>
          {showConverted ? (
            <Text style={[styles.convertedText, { color: colors.textSecondary }]}>
              ≈ {formatMoney(convertedAmount, baseCurrency)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Date / Time / Note */}
      <View style={[styles.metaRow, { borderTopColor: colors.divider }]}>
        <View style={styles.metaItem}>
          <Calendar size={12} color={colors.textMuted} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>{draft.date}</Text>
        </View>
        <View style={styles.metaItem}>
          <Clock size={12} color={colors.textMuted} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>{draft.time}</Text>
        </View>
        {draft.note ? (
          <Text style={[styles.noteText, { color: colors.textMuted }]} numberOfLines={1}>
            · {draft.note}
          </Text>
        ) : null}
      </View>

      {/* Expandable Inline Fine-Tuning Mode */}
      {isEditing ? (
        <View style={[styles.editBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={styles.editHeader}>
            <Text style={[styles.editTitle, { color: colors.primary }]}>微調明細內容</Text>
            <SpringPressable
              pressedScale={0.92}
              onPress={() => {
                setEditError(null);
                setIsEditing(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="關閉微調"
              style={styles.iconBtn}
            >
              <X size={16} color={colors.textMuted} />
            </SpringPressable>
          </View>

          {editError ? (
            <View
              style={[
                styles.editErrorBox,
                { backgroundColor: colors.expenseBg, borderColor: colors.expense },
              ]}
            >
              <AlertTriangle size={14} color={colors.expense} />
              <Text style={[styles.editErrorText, { color: colors.expense }]}>{editError}</Text>
            </View>
          ) : null}

          {/* Expense / Income Toggle */}
          <View style={styles.typeToggleRow}>
            <SpringPressable
              pressedScale={0.95}
              haptic="selection"
              onPress={() => setEditIsExpense(true)}
              style={[
                styles.typeBtn,
                {
                  backgroundColor: editIsExpense ? colors.expenseBg : colors.surface,
                  borderColor: editIsExpense ? colors.expense : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  { color: editIsExpense ? colors.expense : colors.textSecondary },
                ]}
              >
                支出 (−)
              </Text>
            </SpringPressable>
            <SpringPressable
              pressedScale={0.95}
              haptic="selection"
              onPress={() => setEditIsExpense(false)}
              style={[
                styles.typeBtn,
                {
                  backgroundColor: !editIsExpense ? colors.incomeBg : colors.surface,
                  borderColor: !editIsExpense ? colors.income : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  { color: !editIsExpense ? colors.income : colors.textSecondary },
                ]}
              >
                收入 (+)
              </Text>
            </SpringPressable>
          </View>

          {/* Name & Amount */}
          <View style={styles.inputRow}>
            <View style={styles.inputHalf}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>品項名稱</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder="品項名稱"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.input,
                  { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
                ]}
              />
            </View>
            <View style={styles.inputAmountBox}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>金額</Text>
              <TextInput
                value={editAmountText}
                onChangeText={(t) => {
                  setEditAmountText(t);
                  if (editError) setEditError(null);
                }}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.input,
                  styles.amountInput,
                  { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
                ]}
              />
            </View>
          </View>

          {/* Date & Time */}
          <View style={styles.inputRow}>
            <View style={styles.inputHalf}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>日期</Text>
              <TextInput
                value={editDate}
                onChangeText={(t) => {
                  setEditDate(t);
                  if (editError) setEditError(null);
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.input,
                  styles.tabularInput,
                  { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
                ]}
              />
            </View>
            <View style={styles.inputAmountBox}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>時間</Text>
              <TextInput
                value={editTime}
                onChangeText={(t) => {
                  setEditTime(t);
                  if (editError) setEditError(null);
                }}
                placeholder="HH:mm"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.input,
                  styles.tabularInput,
                  { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
                ]}
              />
            </View>
          </View>

          {/* Currency Chips */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>幣別</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {SUPPORTED_CURRENCIES.map((cur) => {
              const selected = editCurrency === cur;
              return (
                <SpringPressable
                  key={cur}
                  pressedScale={0.95}
                  haptic="selection"
                  onPress={() => setEditCurrency(cur)}
                  style={[
                    styles.selectChip,
                    {
                      backgroundColor: selected ? colors.primary : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.selectChipText,
                      styles.monoChipText,
                      { color: selected ? colors.onPrimary : colors.chipText },
                    ]}
                  >
                    {cur}
                  </Text>
                </SpringPressable>
              );
            })}
          </ScrollView>

          {/* Category Chips */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>分類</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {categories.map((cat) => {
              const selected = editCategory === cat;
              const meta = getCategoryMeta(cat);
              return (
                <SpringPressable
                  key={cat}
                  pressedScale={0.95}
                  haptic="selection"
                  onPress={() => setEditCategory(cat)}
                  style={[
                    styles.selectChip,
                    {
                      backgroundColor: selected ? meta.bgColor : colors.surface,
                      borderColor: selected ? meta.color : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.selectChipText, { color: selected ? meta.color : colors.chipText }]}>
                    {cat}
                  </Text>
                </SpringPressable>
              );
            })}
          </ScrollView>

          {/* Account Chips */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>帳戶</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {accounts.map((acc) => {
              const selected = editAccount === acc;
              const meta = getAccountMeta(acc);
              return (
                <SpringPressable
                  key={acc}
                  pressedScale={0.95}
                  haptic="selection"
                  onPress={() => setEditAccount(acc)}
                  style={[
                    styles.selectChip,
                    {
                      backgroundColor: selected ? meta.bgColor : colors.surface,
                      borderColor: selected ? meta.color : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.selectChipText, { color: selected ? meta.color : colors.chipText }]}>
                    {acc}
                  </Text>
                </SpringPressable>
              );
            })}
          </ScrollView>

          {/* Note Input */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>備註</Text>
          <TextInput
            value={editNote}
            onChangeText={setEditNote}
            placeholder="選填備註..."
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
            ]}
          />

          <SpringPressable
            pressedScale={0.95}
            haptic="light"
            onPress={applyEdit}
            style={[styles.applyEditBtn, { backgroundColor: colors.primary }]}
          >
            <Check size={16} color={colors.onPrimary} />
            <Text style={[styles.applyEditText, { color: colors.onPrimary }]}>套用微調</Text>
          </SpringPressable>
        </View>
      ) : null}

      {/* Card Action Footer */}
      <View style={styles.actionsRow}>
        {!isSaved ? (
          <SpringPressable
            disabled={isSubmitting}
            pressedScale={0.95}
            haptic="light"
            onPress={() => (isEditing ? applyEdit() : openEditor())}
            style={[
              styles.secondaryBtn,
              {
                backgroundColor: colors.chipBg,
                borderColor: colors.border,
                opacity: isSubmitting ? 0.5 : 1,
              },
            ]}
          >
            <Pencil size={14} color={colors.textSecondary} />
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
              {isEditing ? '完成微調' : '微調'}
            </Text>
          </SpringPressable>
        ) : null}

        <SpringPressable
          disabled={isSubmitting || isSaved}
          pressedScale={0.95}
          haptic="light"
          onPress={handleConfirm}
          style={[
            styles.confirmBtn,
            {
              backgroundColor: isSaved ? colors.incomeBg : colors.primary,
              borderColor: isSaved ? colors.income : colors.primary,
              opacity: isSubmitting ? 0.7 : 1,
            },
          ]}
        >
          {isSubmitting ? (
            <>
              <ActivityIndicator size="small" color={colors.onPrimary} />
              <Text style={[styles.confirmBtnText, { color: colors.onPrimary }]}>寫入中...</Text>
            </>
          ) : isSaved ? (
            <>
              <CheckCircle2 size={16} color={colors.income} />
              <Text style={[styles.confirmBtnText, { color: colors.income }]}>已寫入帳本</Text>
            </>
          ) : (
            <>
              <Check size={16} color={colors.onPrimary} />
              <Text style={[styles.confirmBtnText, { color: colors.onPrimary }]}>確認寫入</Text>
            </>
          )}
        </SpringPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  draftIndex: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  engineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: '72%',
  },
  engineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    flexShrink: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    gap: 6,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  amountBlock: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  currencyTag: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: MONO_FONT,
    marginTop: 1,
  },
  convertedText: {
    fontSize: 12,
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  noteText: {
    flex: 1,
    fontSize: 12,
  },
  editBox: {
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editTitle: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  editErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
  },
  editErrorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  tabularInput: {
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  iconBtn: {
    padding: 4,
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputHalf: {
    flex: 1.4,
    gap: 4,
  },
  inputAmountBox: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    marginTop: 2,
  },
  input: {
    height: 38,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  amountInput: {
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    fontWeight: '700',
  },
  chipScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  selectChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  selectChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  monoChipText: {
    fontFamily: MONO_FONT,
    fontWeight: '700',
  },
  applyEditBtn: {
    marginTop: 4,
    height: 36,
    borderRadius: HUD_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  applyEditText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: MONO_FONT,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
});
