import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Trash2 } from 'lucide-react-native';
import { LedgerIcon } from '@/components/LedgerIcon';
import { useLedgerStore } from '@/store/useLedgerStore';
import { getAccountMeta, getCategoryMeta } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';
import { CurrencyCode, ExchangeRates, Transaction } from '@/types/ledger';
import { EXCLUDED_FLOW_CATEGORIES } from '@/utils/analytics';
import { convertCurrency, formatMoney } from '@/utils/currency';

interface TransactionCardProps {
  transaction: Transaction;
  baseCurrency: CurrencyCode | string;
  exchangeRates?: ExchangeRates;
  showDate?: boolean;
}

export function TransactionCard({
  transaction,
  baseCurrency,
  exchangeRates,
  showDate = false,
}: TransactionCardProps) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const deleteTransaction = useLedgerStore((s) => s.deleteTransaction);

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const catMeta = getCategoryMeta(transaction.category);
  const accMeta = getAccountMeta(transaction.account);

  const txCurrency = (transaction.currency || 'TWD').toUpperCase();
  const targetCurrency = (baseCurrency || 'TWD').toUpperCase();
  const isSameCurrency = txCurrency === targetCurrency;

  const convertedAmount = convertCurrency(
    transaction.amount,
    txCurrency,
    targetCurrency,
    exchangeRates,
  );

  const isPositive = transaction.amount > 0;
  const isNeutralCategory = EXCLUDED_FLOW_CATEGORIES.has(
    (transaction.category || '').trim(),
  );

  const amountColor = isNeutralCategory
    ? colors.textSecondary
    : isPositive
      ? colors.income
      : colors.expense;

  const formattedOrig = `${isPositive ? '+' : ''}${formatMoney(
    transaction.amount,
    txCurrency,
    true,
  )}`;
  const formattedConverted = `≈ ${isPositive ? '+' : ''}${formatMoney(
    convertedAmount,
    targetCurrency,
    true,
  )}`;

  const handlePressCard = () => {
    const targetId = String(transaction.id ?? transaction.rowNumber ?? '');
    console.log(`[TransactionCard/openEdit] Tap - ID:${targetId}, Name:${transaction.name}`);
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    router.push({
      pathname: '/quick-add',
      params: { editId: targetId },
    });
  };

  const handleRequestDelete = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setConfirmVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (isDeleting) return;
    const targetId = transaction.id ?? transaction.rowNumber;
    if (targetId === undefined || targetId === null) return;

    setIsDeleting(true);
    console.log(`[TransactionCard/delete] Confirm - Target:${targetId}, Name:${transaction.name}`);
    try {
      await deleteTransaction(targetId);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setConfirmVisible(false);
    } catch (err) {
      console.warn('[TransactionCard/delete] Error -', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={handlePressCard}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.cardBorder,
          },
          pressed && { opacity: 0.85, transform: [{ scale: 0.992 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${transaction.name} ${formattedOrig}`}
      >
        {/* Left: Category circular badge */}
        <View style={[styles.iconBadge, { backgroundColor: catMeta.bgColor }]}>
          <LedgerIcon name={catMeta.icon} size={19} color={catMeta.color} strokeWidth={2.1} />
        </View>

        {/* Middle: Title, account pill, time, note */}
        <View style={styles.contentCol}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {transaction.name || transaction.category}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <View style={[styles.accountPill, { backgroundColor: accMeta.bgColor }]}>
              <View style={[styles.accountDot, { backgroundColor: accMeta.color }]} />
              <Text style={[styles.accountText, { color: accMeta.color }]} numberOfLines={1}>
                {transaction.account}
              </Text>
            </View>

            <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={1}>
              {showDate ? `${transaction.date} ` : ''}
              {transaction.time || ''}
              {transaction.category ? ` · ${transaction.category}` : ''}
            </Text>
          </View>

          {Boolean(transaction.note) && (
            <Text style={[styles.noteText, { color: colors.textSecondary }]} numberOfLines={1}>
              {transaction.note}
            </Text>
          )}
        </View>

        {/* Right: Amounts + Delete Action */}
        <View style={styles.rightCol}>
          <View style={styles.amountBlock}>
            <Text style={[styles.primaryAmount, { color: amountColor }]} numberOfLines={1}>
              {formattedOrig}
            </Text>
            {!isSameCurrency && (
              <Text style={[styles.convertedAmount, { color: colors.textMuted }]} numberOfLines={1}>
                {formattedConverted}
              </Text>
            )}
          </View>

          <Pressable
            onPress={handleRequestDelete}
            hitSlop={8}
            style={({ pressed }) => [
              styles.deleteBtn,
              { backgroundColor: colors.expenseBg },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`刪除 ${transaction.name}`}
          >
            <Trash2 size={14} color={colors.expense} strokeWidth={2} />
          </Pressable>
        </View>
      </Pressable>

      {/* Delete Confirmation Modal (cross-platform: iOS, Android, Web) */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !isDeleting && setConfirmVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !isDeleting && setConfirmVisible(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>確認刪除交易？</Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              確定要刪除「{transaction.name || transaction.category}」({formattedOrig}) 嗎？此動作無法復原。
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setConfirmVisible(false)}
                disabled={isDeleting}
                style={[
                  styles.modalBtn,
                  { backgroundColor: colors.chipBg },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>取消</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmDelete}
                disabled={isDeleting}
                style={[
                  styles.modalBtn,
                  { backgroundColor: colors.danger },
                ]}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>確認刪除</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 12,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    maxWidth: 105,
  },
  accountDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  accountText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaText: {
    fontSize: 11,
    fontWeight: '500',
    flexShrink: 1,
  },
  noteText: {
    fontSize: 11,
    marginTop: 1,
  },
  rightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountBlock: {
    alignItems: 'flex-end',
  },
  primaryAmount: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  convertedAmount: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 82,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
