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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getAccountMeta, getCategoryMeta } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import {
  AIParsedDraft,
  CurrencyCode,
  ExchangeRates,
  SUPPORTED_CURRENCIES,
} from '../types/ledger';
import { convertCurrency, formatMoney } from '../utils/currency';

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
  const [editNote, setEditNote] = useState(draft.note || '');

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
    setEditAmountText(String(Math.abs(draft.amount) || ''));
    setEditIsExpense(draft.amount <= 0);
    setEditCurrency(draft.currency || baseCurrency);
    setEditCategory(draft.category);
    setEditAccount(draft.account);
    setEditNote(draft.note || '');
    setIsEditing(true);
    console.log(`[AIDraftCard/openEditor] Open - Index:${index}, Name:${draft.name}`);
  };

  const applyEdit = () => {
    const parsedNum = Math.abs(parseFloat(editAmountText.replace(/[^0-9.]/g, '')) || 0);
    const signedAmount = editIsExpense ? -parsedNum : parsedNum;
    const updated: AIParsedDraft = {
      ...draft,
      name: editName.trim() || draft.name || '消費項目',
      amount: signedAmount,
      currency: editCurrency,
      category: editCategory,
      account: editAccount,
      note: editNote.trim(),
    };
    console.log(
      `[AIDraftCard/applyEdit] SaveDraft - Index:${index}, Name:${updated.name}, Amt:${updated.amount} ${updated.currency}`,
    );
    onUpdateDraft(updated);
    setIsEditing(false);
  };

  const handleConfirm = () => {
    if (isSubmitting || isSaved) return;
    if (isEditing) {
      applyEdit();
      return;
    }
    console.log(
      `[AIDraftCard/handleConfirm] Submit - Index:${index}, Name:${draft.name}, Amt:${draft.amount} ${draft.currency}`,
    );
    onConfirm(draft);
  };

  const amountColor = isExpense ? colors.expense : colors.income;
  const amountPrefix = isExpense ? '' : '+';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isSaved ? colors.income : colors.cardBorder,
        },
      ]}
    >
      {/* Top Meta Badges Row */}
      <View style={styles.topRow}>
        <Text style={[styles.draftIndex, { color: colors.textMuted }]}>
          明細 #{index + 1}
        </Text>

        {isFallback ? (
          <View style={[styles.engineBadge, { backgroundColor: colors.warningBg }]}>
            <AlertTriangle size={12} color={colors.warning} />
            <Text style={[styles.engineBadgeText, { color: colors.warning }]}>
              503 離線規則引擎{fallbackReason ? ` · ${fallbackReason}` : ''}
            </Text>
          </View>
        ) : (
          <View style={[styles.engineBadge, { backgroundColor: colors.primaryLight }]}>
            <Sparkles size={12} color={colors.primary} />
            <Text style={[styles.engineBadgeText, { color: colors.primary }]}>
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
            <View style={[styles.pill, { backgroundColor: catMeta.bgColor }]}>
              <View style={[styles.dot, { backgroundColor: catMeta.color }]} />
              <Text style={[styles.pillText, { color: catMeta.color }]}>{draft.category}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: accMeta.bgColor }]}>
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
            <Text style={[styles.editTitle, { color: colors.text }]}>微調明細內容</Text>
            <Pressable
              onPress={() => setIsEditing(false)}
              style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Expense / Income Toggle */}
          <View style={styles.typeToggleRow}>
            <Pressable
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
            </Pressable>
            <Pressable
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
            </Pressable>
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
                onChangeText={setEditAmountText}
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

          {/* Currency Chips */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>幣別</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {SUPPORTED_CURRENCIES.map((cur) => {
              const selected = editCurrency === cur;
              return (
                <Pressable
                  key={cur}
                  onPress={() => setEditCurrency(cur)}
                  style={[
                    styles.selectChip,
                    {
                      backgroundColor: selected ? colors.primary : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.selectChipText, { color: selected ? '#FFFFFF' : colors.chipText }]}>
                    {cur}
                  </Text>
                </Pressable>
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
                <Pressable
                  key={cat}
                  onPress={() => setEditCategory(cat)}
                  style={[
                    styles.selectChip,
                    {
                      backgroundColor: selected ? meta.color : colors.surface,
                      borderColor: selected ? meta.color : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.selectChipText, { color: selected ? '#FFFFFF' : colors.chipText }]}>
                    {cat}
                  </Text>
                </Pressable>
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
                <Pressable
                  key={acc}
                  onPress={() => setEditAccount(acc)}
                  style={[
                    styles.selectChip,
                    {
                      backgroundColor: selected ? meta.color : colors.surface,
                      borderColor: selected ? meta.color : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.selectChipText, { color: selected ? '#FFFFFF' : colors.chipText }]}>
                    {acc}
                  </Text>
                </Pressable>
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

          <Pressable
            onPress={applyEdit}
            style={({ pressed }) => [
              styles.applyEditBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Check size={16} color="#FFFFFF" />
            <Text style={styles.applyEditText}>套用微調</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Card Action Footer */}
      <View style={styles.actionsRow}>
        {!isSaved ? (
          <Pressable
            disabled={isSubmitting}
            onPress={() => (isEditing ? applyEdit() : openEditor())}
            style={({ pressed }) => [
              styles.secondaryBtn,
              {
                backgroundColor: colors.chipBg,
                borderColor: colors.border,
                opacity: isSubmitting ? 0.5 : pressed ? 0.75 : 1,
              },
            ]}
          >
            <Pencil size={14} color={colors.textSecondary} />
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
              {isEditing ? '完成微調' : '微調'}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          disabled={isSubmitting || isSaved}
          onPress={handleConfirm}
          style={({ pressed }) => [
            styles.confirmBtn,
            {
              backgroundColor: isSaved ? colors.incomeBg : colors.primary,
              borderColor: isSaved ? colors.income : colors.primary,
              opacity: isSubmitting ? 0.7 : pressed && !isSaved ? 0.85 : 1,
            },
          ]}
        >
          {isSubmitting ? (
            <>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.confirmBtnText}>寫入中...</Text>
            </>
          ) : isSaved ? (
            <>
              <CheckCircle2 size={16} color={colors.income} />
              <Text style={[styles.confirmBtnText, { color: colors.income }]}>已寫入帳本</Text>
            </>
          ) : (
            <>
              <Check size={16} color="#FFFFFF" />
              <Text style={styles.confirmBtnText}>確認寫入</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
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
    fontWeight: '600',
  },
  engineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    maxWidth: '78%',
  },
  engineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
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
    paddingVertical: 4,
    borderRadius: 8,
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
    fontVariant: ['tabular-nums'],
  },
  currencyTag: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  convertedText: {
    fontSize: 12,
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
    fontVariant: ['tabular-nums'],
  },
  noteText: {
    flex: 1,
    fontSize: 12,
  },
  editBox: {
    borderRadius: 12,
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
    fontSize: 13,
    fontWeight: '700',
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
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '700',
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
    fontWeight: '600',
    marginTop: 2,
  },
  input: {
    height: 38,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  amountInput: {
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
    borderRadius: 999,
    borderWidth: 1,
  },
  selectChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  applyEditBtn: {
    marginTop: 4,
    height: 36,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  applyEditText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
