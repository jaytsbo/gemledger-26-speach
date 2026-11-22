import { AlertTriangle, CheckCircle2, Layers } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CalculatorKeypad,
  evaluateArithmeticExpression,
  formatNumericExpression,
} from '../CalculatorKeypad';
import { HudReticle, MONO_FONT } from '../ui/HudReticle';
import { SpringPressable } from '../ui/SpringPressable';
import { useLedgerStore } from '../../store/useLedgerStore';
import { getAccountMeta, getCategoryMeta, HUD_RADIUS } from '../../theme/colors';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  CurrencyCode,
  SUPPORTED_CURRENCIES,
  Transaction,
  TransactionInput,
} from '../../types/ledger';
import {
  CURRENCY_LABELS,
  convertCurrency,
  formatMoney,
  getCurrencySymbol,
} from '../../utils/currency';
import { getLocalDateStr, getLocalTimeStr } from '../../utils/dateTime';
import {
  buildManualTransferInputs,
  triggerHapticSuccess,
  validateManualFields,
} from './quickAddHelpers';

export interface ManualBookkeepViewProps {
  editId?: string;
  editingTransaction?: Transaction;
  isActive: boolean;
  onCloseModal: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function ManualBookkeepView({
  editId,
  editingTransaction,
  isActive,
  onCloseModal,
  onDirtyChange,
}: ManualBookkeepViewProps) {
  const { colors } = useAppTheme();
  const {
    settings,
    exchangeRates,
    baseCurrency,
    initialized,
    addTransaction,
    batchAddTransactions,
    updateTransaction,
  } = useLedgerStore();

  const [isExpense, setIsExpense] = useState(true);
  const [expression, setExpression] = useState('0');
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency || 'TWD');
  const [category, setCategory] = useState<string>(settings.categories[0] || '食');
  const [account, setAccount] = useState<string>(settings.accounts[0] || '現金');
  const [toAccount, setToAccount] = useState<string>(
    () => settings.accounts[1] || settings.accounts[0] || '現金',
  );
  const [itemName, setItemName] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => getLocalDateStr());
  const [time, setTime] = useState(() => getLocalTimeStr());
  const [continuousMode, setContinuousMode] = useState(false);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isTextInputFocused, setIsTextInputFocused] = useState(false);
  const [isSystemKeyboardOpen, setIsSystemKeyboardOpen] = useState(false);

  const isMountedRef = useRef(true);
  const isSubmittingManualRef = useRef(false);
  const didHydrateEditRef = useRef<string | null>(null);
  const manualScrollRef = useRef<ScrollView | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIsActiveRef = useRef(isActive);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsSystemKeyboardOpen(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsSystemKeyboardOpen(false));

    let cleanupVisualViewport: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.visualViewport) {
      const vv = window.visualViewport;
      const baseHeight = window.innerHeight;
      const onResize = () => {
        const diff = baseHeight - vv.height;
        setIsSystemKeyboardOpen(diff > 120);
      };
      vv.addEventListener('resize', onResize);
      cleanupVisualViewport = () => vv.removeEventListener('resize', onResize);
    }

    return () => {
      showSub.remove();
      hideSub.remove();
      cleanupVisualViewport?.();
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isActive && prevIsActiveRef.current) {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      setIsTextInputFocused(false);
      Keyboard.dismiss();
    }
    prevIsActiveRef.current = isActive;
  }, [isActive]);

  const handleManualInputFocus = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setIsTextInputFocused(true);
    setTimeout(() => {
      manualScrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
  }, []);

  const handleManualInputBlur = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      setIsTextInputFocused(false);
    }, 80);
  }, []);

  const handleDismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
    setIsTextInputFocused(false);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null;
      active?.blur?.();
    }
  }, []);

  const hideCalculatorKeypad = isTextInputFocused || isSystemKeyboardOpen;

  // Hydrate form when editing an existing transaction
  useEffect(() => {
    if (!editId || !editingTransaction) return;
    if (didHydrateEditRef.current === editId) return;

    didHydrateEditRef.current = editId;
    const absAmt = Math.abs(Number(editingTransaction.amount) || 0);
    setIsExpense(editingTransaction.amount <= 0);
    setExpression(absAmt > 0 ? formatNumericExpression(absAmt, 4) : '0');
    setCurrency((editingTransaction.currency || baseCurrency) as CurrencyCode);
    setCategory(editingTransaction.category || settings.categories[0] || '食');
    setAccount(editingTransaction.account || settings.accounts[0] || '現金');
    setItemName(editingTransaction.name || '');
    setNote(editingTransaction.note || '');
    setDate(editingTransaction.date || getLocalDateStr());
    setTime(editingTransaction.time || getLocalTimeStr());
    console.log(
      `[QuickAdd/hydrateEdit] Loaded - ID:${editId}, Name:${editingTransaction.name}, Amt:${editingTransaction.amount}`,
    );
  }, [baseCurrency, editId, editingTransaction, settings.accounts, settings.categories]);

  const evaluatedAmount = useMemo(
    () => Math.max(0, evaluateArithmeticExpression(expression)),
    [expression],
  );

  const isTransferCreate = category === '內部轉帳' && !editingTransaction && !editId;
  const isTransferEdit = Boolean(editingTransaction || editId) && category === '內部轉帳';
  const isMissingEditTarget = Boolean(editId && !editingTransaction);

  const isManualDirty = useMemo(() => {
    if (editId) {
      if (!editingTransaction) return false;
      const origAbs = Math.abs(Number(editingTransaction.amount) || 0);
      const origExpr = origAbs > 0 ? formatNumericExpression(origAbs, 4) : '0';
      const origIsExpense = editingTransaction.amount <= 0;
      return (
        isExpense !== origIsExpense ||
        expression !== origExpr ||
        itemName.trim() !== (editingTransaction.name || '').trim() ||
        note.trim() !== (editingTransaction.note || '').trim() ||
        currency !== ((editingTransaction.currency || baseCurrency) as CurrencyCode) ||
        category !== (editingTransaction.category || settings.categories[0] || '食') ||
        account !== (editingTransaction.account || settings.accounts[0] || '現金') ||
        date.trim() !== (editingTransaction.date || '') ||
        time.trim() !== (editingTransaction.time || '')
      );
    }

    return (
      evaluatedAmount > 0 ||
      expression !== '0' ||
      itemName.trim() !== '' ||
      note.trim() !== ''
    );
  }, [
    account,
    baseCurrency,
    category,
    currency,
    date,
    editId,
    editingTransaction,
    evaluatedAmount,
    expression,
    isExpense,
    itemName,
    note,
    settings.accounts,
    settings.categories,
    time,
  ]);

  useEffect(() => {
    onDirtyChange(isManualDirty);
  }, [isManualDirty, onDirtyChange]);

  const hasArithmeticOperator = useMemo(
    () => /[+-]/.test(expression.slice(1)),
    [expression],
  );

  const convertedBaseAmount = useMemo(
    () => convertCurrency(evaluatedAmount, currency, baseCurrency, exchangeRates),
    [baseCurrency, currency, evaluatedAmount, exchangeRates],
  );

  const handleExpressionChange = useCallback((nextExpr: string) => {
    setExpression(nextExpr);
    setErrorBanner(null);
  }, []);

  const handleSaveManual = async () => {
    if (isSubmittingManualRef.current || isSubmittingManual) return;
    if (editId && !editingTransaction) {
      const msg = initialized
        ? '找不到要編輯的交易紀錄（可能已被刪除），無法更新'
        : '帳本資料仍在載入中，請稍候再試';
      console.warn(`[QuickAdd/handleSaveManual] Blocked - MissingEditTarget:${editId}`);
      setFeedbackBanner(null);
      setErrorBanner(msg);
      return;
    }
    const check = validateManualFields({
      expression,
      date,
      time,
      isTransferCreate,
      account,
      toAccount,
    });
    if (check.error) {
      console.warn(`[QuickAdd/handleSaveManual] ValidationFailed - ${check.error}`);
      setFeedbackBanner(null);
      setErrorBanner(check.error);
      return;
    }

    const { finalAmount, cleanDate, cleanTime } = check;
    const signedAmount = isExpense ? -finalAmount : finalAmount;
    const cleanName = itemName.trim() || category || (isExpense ? '一般支出' : '一般收入');
    const payload: TransactionInput = {
      date: cleanDate,
      time: cleanTime,
      account,
      name: cleanName,
      category,
      currency,
      amount: signedAmount,
      note: note.trim(),
    };

    isSubmittingManualRef.current = true;
    setIsSubmittingManual(true);
    setErrorBanner(null);
    setFeedbackBanner(null);

    try {
      if (editingTransaction) {
        const hasValidEditId =
          editingTransaction.id !== undefined &&
          editingTransaction.id !== null &&
          String(editingTransaction.id).trim() !== '';
        const targetId = hasValidEditId ? editingTransaction.id : editingTransaction.rowNumber!;
        console.log(
          `[QuickAdd/handleSaveManual] Update - Target:${targetId}, Name:${payload.name}, Amt:${payload.amount}`,
        );
        await updateTransaction(targetId, payload);
        triggerHapticSuccess();
        onCloseModal();
        return;
      }

      if (isTransferCreate) {
        const pair = buildManualTransferInputs({
          date: cleanDate,
          time: cleanTime,
          account,
          toAccount,
          itemName,
          currency,
          amount: finalAmount,
          note: note.trim(),
        });
        console.log(
          `[QuickAdd/handleSaveManual] TransferCreate - From:${account}, To:${toAccount}, Amt:${finalAmount} ${currency}`,
        );
        await batchAddTransactions(pair);
      } else {
        console.log(
          `[QuickAdd/handleSaveManual] Create - Name:${payload.name}, Amt:${payload.amount} ${payload.currency}, Continuous:${continuousMode}`,
        );
        await addTransaction(payload);
      }
      triggerHapticSuccess();

      if (continuousMode) {
        setExpression('0');
        setItemName('');
        setNote('');
        setTime(getLocalTimeStr());
        setFeedbackBanner(
          isTransferCreate
            ? `✓ 已建立內部轉帳 ${account} → ${toAccount} ${formatMoney(finalAmount, currency)}，請繼續記下一筆`
            : `✓ 已寫入「${cleanName}」${formatMoney(signedAmount, currency)}，請繼續記下一筆`,
        );
      } else {
        onCloseModal();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '儲存失敗，請稍後再試';
      console.warn('[QuickAdd/handleSaveManual] Error -', msg);
      setErrorBanner(msg);
    } finally {
      isSubmittingManualRef.current = false;
      if (isMountedRef.current) {
        setIsSubmittingManual(false);
      }
    }
  };

  return (
    <View style={styles.flex1}>
      <ScrollView
        ref={manualScrollRef}
        style={styles.flex1}
        contentContainerStyle={styles.manualContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Status / Error Feedback */}
        {feedbackBanner ? (
          <View
            style={[
              styles.banner,
              { backgroundColor: colors.incomeBg, borderColor: colors.income },
            ]}
          >
            <CheckCircle2 size={16} color={colors.income} />
            <Text style={[styles.bannerText, { color: colors.income }]}>{feedbackBanner}</Text>
          </View>
        ) : null}

        {errorBanner ? (
          <View
            style={[
              styles.banner,
              { backgroundColor: colors.expenseBg, borderColor: colors.expense },
            ]}
          >
            <AlertTriangle size={16} color={colors.expense} />
            <Text style={[styles.bannerText, { color: colors.expense }]}>{errorBanner}</Text>
          </View>
        ) : null}

        {isMissingEditTarget ? (
          <View
            style={[
              styles.banner,
              {
                backgroundColor: initialized ? colors.expenseBg : colors.primaryLight,
                borderColor: initialized ? colors.expense : colors.primary,
              },
            ]}
          >
            <AlertTriangle size={16} color={initialized ? colors.expense : colors.primary} />
            <Text
              style={[
                styles.bannerText,
                { color: initialized ? colors.expense : colors.primary },
              ]}
            >
              {initialized
                ? '找不到要編輯的交易紀錄（可能已被刪除），無法更新。'
                : '正在載入交易明細...'}
            </Text>
          </View>
        ) : null}

        {isTransferEdit && !isMissingEditTarget ? (
          <View
            style={[
              styles.banner,
              { backgroundColor: colors.warningBg, borderColor: colors.warning },
            ]}
          >
            <AlertTriangle size={16} color={colors.warning} />
            <Text style={[styles.bannerText, { color: colors.warning }]}>
              正在編輯單筆內部轉帳紀錄，僅會修改此筆帳戶與金額，不會自動連動更新另一側轉帳紀錄。
            </Text>
          </View>
        ) : null}

        {/* Expense / Income Toggle + Amount Hero */}
        <View
          style={[
            styles.amountCard,
            {
              backgroundColor: colors.card,
              borderColor: isTransferCreate ? colors.primary : colors.cardBorder,
            },
          ]}
        >
          <HudReticle variant="primary" />

          {isTransferCreate ? (
            <View
              style={[
                styles.transferNoticePill,
                { backgroundColor: colors.primaryBg, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.flowBtnText, { color: colors.primary }]}>
                內部轉帳：{account} → {toAccount}
              </Text>
            </View>
          ) : (
            <View style={styles.flowToggleRow}>
              <SpringPressable
                pressedScale={0.95}
                haptic="selection"
                onPress={() => setIsExpense(true)}
                style={[
                  styles.flowBtn,
                  {
                    backgroundColor: isExpense ? colors.expenseBg : colors.inputBg,
                    borderColor: isExpense ? colors.expense : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.flowBtnText,
                    { color: isExpense ? colors.expense : colors.textSecondary },
                  ]}
                >
                  支出 (−)
                </Text>
              </SpringPressable>

              <SpringPressable
                pressedScale={0.95}
                haptic="selection"
                onPress={() => setIsExpense(false)}
                style={[
                  styles.flowBtn,
                  {
                    backgroundColor: !isExpense ? colors.incomeBg : colors.inputBg,
                    borderColor: !isExpense ? colors.income : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.flowBtnText,
                    { color: !isExpense ? colors.income : colors.textSecondary },
                  ]}
                >
                  收入 (+)
                </Text>
              </SpringPressable>
            </View>
          )}

          <View style={styles.amountDisplayRow}>
            <Text
              style={[
                styles.amountCurrencyPrefix,
                {
                  color: isTransferCreate
                    ? colors.primary
                    : isExpense
                      ? colors.expense
                      : colors.income,
                },
              ]}
            >
              {isTransferCreate ? '⇄' : isExpense ? '−' : '+'} {getCurrencySymbol(currency)}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                styles.amountDisplayText,
                {
                  color: isTransferCreate
                    ? colors.primary
                    : isExpense
                      ? colors.expense
                      : colors.income,
                },
              ]}
            >
              {expression}
            </Text>
          </View>

          {hasArithmeticOperator ? (
            <Text style={[styles.evaluatedPreview, { color: colors.textSecondary }]}>
              計算結果 = {formatMoney(evaluatedAmount, currency)}
            </Text>
          ) : null}

          {/* Real-time Converted Base Currency Preview Bar */}
          <View
            style={[
              styles.fxPreviewBar,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.fxPreviewLabel, { color: colors.textSecondary }]}>
              {currency === baseCurrency
                ? `基準幣別 · ${CURRENCY_LABELS[currency] || currency}`
                : `即時換算 · ${baseCurrency}`}
            </Text>
            <Text style={[styles.fxPreviewValue, { color: colors.text }]}>
              {currency === baseCurrency
                ? formatMoney(evaluatedAmount, baseCurrency)
                : `≈ ${formatMoney(isTransferCreate ? convertedBaseAmount : isExpense ? -convertedBaseAmount : convertedBaseAmount, baseCurrency)}`}
            </Text>
          </View>
        </View>

        {/* 11-Currency Horizontal Selector */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>幣別</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
          >
            {SUPPORTED_CURRENCIES.map((cur) => {
              const selected = currency === cur;
              return (
                <SpringPressable
                  key={cur}
                  pressedScale={0.95}
                  haptic="selection"
                  onPress={() => setCurrency(cur)}
                  style={[
                    styles.chipPill,
                    {
                      backgroundColor: selected ? colors.primary : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipPillText,
                      styles.monoChipText,
                      { color: selected ? colors.onPrimary : colors.text },
                    ]}
                  >
                    {cur} {getCurrencySymbol(cur)}
                  </Text>
                </SpringPressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Category Chips */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>分類</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
          >
            {settings.categories.map((cat) => {
              const selected = category === cat;
              const meta = getCategoryMeta(cat);
              return (
                <SpringPressable
                  key={cat}
                  pressedScale={0.95}
                  haptic="selection"
                  onPress={() => {
                    setCategory(cat);
                    setErrorBanner(null);
                    if (
                      cat === '內部轉帳' &&
                      !editingTransaction &&
                      !editId &&
                      toAccount === account
                    ) {
                      const altAcc = settings.accounts.find((a) => a !== account);
                      if (altAcc) setToAccount(altAcc);
                    }
                  }}
                  style={[
                    styles.chipPill,
                    {
                      backgroundColor: selected ? meta.bgColor : colors.card,
                      borderColor: selected ? meta.color : colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.chipDot,
                      { backgroundColor: meta.color },
                    ]}
                  />
                  <Text
                    style={[
                      styles.chipPillText,
                      { color: selected ? meta.color : colors.text },
                    ]}
                  >
                    {cat}
                  </Text>
                </SpringPressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Account Chips */}
        {[
          { label: '帳戶', selectedAcc: account, onSelect: setAccount, visible: true },
          {
            label: '轉入帳戶',
            selectedAcc: toAccount,
            onSelect: setToAccount,
            visible: category === '內部轉帳' && !editingTransaction && !editId,
          },
        ]
          .filter((sec) => sec.visible)
          .map((sec) => (
            <View key={sec.label} style={styles.sectionBlock}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                {sec.label}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalList}
              >
                {settings.accounts.map((acc) => {
                  const selected = sec.selectedAcc === acc;
                  const meta = getAccountMeta(acc);
                  return (
                    <SpringPressable
                      key={acc}
                      pressedScale={0.95}
                      haptic="selection"
                      onPress={() => {
                        sec.onSelect(acc);
                        setErrorBanner(null);
                      }}
                      style={[
                        styles.chipPill,
                        {
                          backgroundColor: selected ? meta.bgColor : colors.card,
                          borderColor: selected ? meta.color : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipPillText,
                          { color: selected ? meta.color : colors.text },
                        ]}
                      >
                        {acc}
                      </Text>
                    </SpringPressable>
                  );
                })}
              </ScrollView>
            </View>
          ))}

        {/* Item Name, Note, Date & Time */}
        <View
          style={[
            styles.formCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.formRow}>
            <View style={styles.flex1}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>品項名稱</Text>
              <TextInput
                value={itemName}
                onChangeText={setItemName}
                onFocus={handleManualInputFocus}
                onBlur={handleManualInputBlur}
                placeholder={`例如：${category}消費`}
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>備註</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                onFocus={handleManualInputFocus}
                onBlur={handleManualInputBlur}
                placeholder="選填備註..."
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={styles.flex1}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>日期</Text>
              <TextInput
                value={date}
                onChangeText={setDate}
                onFocus={handleManualInputFocus}
                onBlur={handleManualInputBlur}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.textInput,
                  styles.tabularInput,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />
            </View>
            <View style={styles.timeInputWrap}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>時間</Text>
              <TextInput
                value={time}
                onChangeText={setTime}
                onFocus={handleManualInputFocus}
                onBlur={handleManualInputBlur}
                placeholder="HH:mm"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.textInput,
                  styles.tabularInput,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />
            </View>
            <SpringPressable
              pressedScale={0.94}
              haptic="light"
              onPress={() => {
                setDate(getLocalDateStr());
                setTime(getLocalTimeStr());
              }}
              style={[
                styles.nowBtn,
                { backgroundColor: colors.primaryBg, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.nowBtnText, { color: colors.primary }]}>現在</Text>
            </SpringPressable>
          </View>

          {!editingTransaction && !editId ? (
            <View style={[styles.continuousRow, { borderTopColor: colors.divider }]}>
              <View style={styles.continuousLabelWrap}>
                <Layers size={15} color={colors.primary} />
                <View>
                  <Text style={[styles.continuousTitle, { color: colors.text }]}>連續記帳</Text>
                  <Text style={[styles.continuousSub, { color: colors.textMuted }]}>
                    儲存後保持視窗開啟以快速輸入下一筆
                  </Text>
                </View>
              </View>
              <Switch
                value={continuousMode}
                onValueChange={setContinuousMode}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Bottom Docked Submit + Calculator Keypad (auto-hides keypad when typing) */}
      <View style={{ backgroundColor: colors.surface }}>
        <View
          style={[
            styles.submitBar,
            {
              borderTopColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            },
          ]}
        >
          {hideCalculatorKeypad ? (
            <SpringPressable
              pressedScale={0.94}
              haptic="light"
              onPress={handleDismissKeyboard}
              style={[
                styles.nowBtn,
                {
                  height: 46,
                  paddingHorizontal: 12,
                  justifyContent: 'center',
                  backgroundColor: colors.chipBg,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.nowBtnText, { color: colors.textSecondary }]}>計算機</Text>
            </SpringPressable>
          ) : null}
          <SpringPressable
            disabled={isSubmittingManual || isMissingEditTarget}
            pressedScale={0.96}
            haptic="light"
            onPress={handleSaveManual}
            style={[
              styles.submitBtn,
              {
                flex: 1,
                backgroundColor: isTransferCreate
                  ? colors.primary
                  : isExpense
                    ? colors.expense
                    : colors.income,
                borderColor: isTransferCreate
                  ? colors.primary
                  : isExpense
                    ? colors.expense
                    : colors.income,
                opacity: isSubmittingManual || isMissingEditTarget ? 0.55 : 1,
              },
            ]}
          >
            {isSubmittingManual ? (
              <ActivityIndicator
                size="small"
                color={isTransferCreate || !isExpense ? colors.onPrimary : '#FFFFFF'}
              />
            ) : (
              <Text
                style={[
                  styles.submitBtnText,
                  { color: isTransferCreate || !isExpense ? colors.onPrimary : '#FFFFFF' },
                ]}
              >
                {editingTransaction || editId
                  ? '更新這筆交易'
                  : isTransferCreate
                    ? `儲存轉帳 ${formatMoney(evaluatedAmount, currency)}`
                    : isExpense
                      ? `儲存支出 ${formatMoney(evaluatedAmount, currency)}`
                      : `儲存收入 +${formatMoney(evaluatedAmount, currency)}`}
              </Text>
            )}
          </SpringPressable>
        </View>

        {!hideCalculatorKeypad ? (
          <CalculatorKeypad
            expression={expression}
            onExpressionChange={handleExpressionChange}
            disabled={isSubmittingManual || isMissingEditTarget}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  manualContent: {
    padding: 14,
    gap: 12,
    paddingBottom: 18,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  amountCard: {
    position: 'relative',
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  hudReadoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hudReadoutTag: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    letterSpacing: 0.4,
  },
  flowToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  flowBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
  },
  flowBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  transferNoticePill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
  },
  amountDisplayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: 6,
    paddingVertical: 4,
  },
  amountCurrencyPrefix: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  amountDisplayText: {
    fontSize: 38,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  evaluatedPreview: {
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  fxPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  fxPreviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: MONO_FONT,
  },
  fxPreviewValue: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  sectionBlock: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    paddingHorizontal: 2,
  },
  horizontalList: {
    gap: 8,
    paddingVertical: 2,
  },
  chipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  monoChipText: {
    fontFamily: MONO_FONT,
    fontWeight: '700',
  },
  formCard: {
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    marginBottom: 4,
  },
  textInput: {
    height: 38,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  tabularInput: {
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  timeInputWrap: {
    width: 82,
  },
  nowBtn: {
    height: 38,
    paddingHorizontal: 10,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowBtnText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  continuousRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  continuousLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  continuousTitle: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  continuousSub: {
    fontSize: 11,
  },
  submitBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: 1,
  },
  submitBtn: {
    height: 46,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
});
