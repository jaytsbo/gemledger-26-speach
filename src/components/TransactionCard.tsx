import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { LedgerIcon } from '@/components/LedgerIcon';
import { HudReticle, MONO_FONT } from '@/components/ui/HudReticle';
import { SpringPressable } from '@/components/ui/SpringPressable';
import { useLedgerStore } from '@/store/useLedgerStore';
import {
  HUD_RADIUS,
  HUD_RADIUS_LG,
  HUD_RETICLE_SIZE,
  getAccountMeta,
  getCategoryMeta,
} from '@/theme/colors';
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

function withAlphaBorder(color: string, alphaHex: string): string {
  return color.startsWith('#') && color.length === 7 ? `${color}${alphaHex}` : color;
}

function TransactionCardImpl({
  transaction,
  baseCurrency,
  exchangeRates,
  showDate = false,
}: TransactionCardProps) {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const deleteTransaction = useLedgerStore((s) => s.deleteTransaction);

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isDeletingRef = useRef(false);

  const mountProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(mountProgress, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();
    return () => {
      anim.stop();
    };
  }, [mountProgress]);

  const mountTranslateY = mountProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
  });

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

  const resolveTransactionTargetId = (): number | string | undefined => {
    const hasValidId =
      transaction.id !== undefined &&
      transaction.id !== null &&
      String(transaction.id).trim() !== '';
    if (hasValidId) return transaction.id;
    return transaction.rowNumber;
  };

  const handlePressCard = () => {
    const targetId = String(resolveTransactionTargetId() ?? '');
    console.log(`[TransactionCard/openEdit] Tap - ID:${targetId}, Name:${transaction.name}`);
    router.push({
      pathname: '/quick-add',
      params: { editId: targetId },
    });
  };

  const handleRequestDelete = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setDeleteError(null);
    setConfirmVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (isDeletingRef.current || isDeleting) return;
    const targetId = resolveTransactionTargetId();
    if (targetId === undefined || targetId === null) {
      setDeleteError('無法識別此交易編號，無法刪除');
      return;
    }

    isDeletingRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);
    console.log(`[TransactionCard/delete] Confirm - Target:${targetId}, Name:${transaction.name}`);
    try {
      await deleteTransaction(targetId);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setConfirmVisible(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '刪除交易失敗，請稍後再試';
      console.warn('[TransactionCard/delete] Error -', msg);
      setDeleteError(msg);
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  };

  const violetBorderColor = isDark
    ? 'rgba(139, 92, 246, 0.45)'
    : 'rgba(109, 40, 217, 0.35)';

  return (
    <Animated.View
      style={{
        opacity: mountProgress,
        transform: [{ translateY: mountTranslateY }],
      }}
    >
      <SpringPressable
        onPress={handlePressCard}
        pressedScale={0.98}
        haptic="selection"
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: violetBorderColor,
            shadowColor: colors.accent,
            shadowOpacity: isDark ? 0.25 : 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: isDark ? 4 : 2,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${transaction.name} ${formattedOrig}`}
      >
        {/* Nebula Violet Ambient Gradient Wash + Left Glowing Core Bar */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="txVioletWash" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={colors.accent} stopOpacity="0.10" />
                <Stop offset="65%" stopColor={colors.accent} stopOpacity="0.02" />
                <Stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#txVioletWash)" />
          </Svg>
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.leftAccentBar,
            {
              backgroundColor: colors.accent,
              opacity: isDark ? 0.72 : 0.55,
            },
          ]}
        />

        <HudReticle variant="accent" size={HUD_RETICLE_SIZE} />

        {/* Left: Category tactical square badge */}
        <View
          style={[
            styles.iconBadge,
            {
              backgroundColor: catMeta.bgColor,
              borderColor: withAlphaBorder(catMeta.color, '55'),
            },
          ]}
        >
          <LedgerIcon name={catMeta.icon} size={18} color={catMeta.color} strokeWidth={2.1} />
        </View>

        {/* Middle: Title, account chip, time, note */}
        <View style={styles.contentCol}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {transaction.name || transaction.category}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <View
              style={[
                styles.accountPill,
                {
                  backgroundColor: accMeta.bgColor,
                  borderColor: withAlphaBorder(accMeta.color, '4D'),
                },
              ]}
            >
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
              {
                backgroundColor: colors.expenseBg,
                borderColor: withAlphaBorder(colors.expense, '4D'),
              },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`刪除 ${transaction.name}`}
          >
            <Trash2 size={14} color={colors.expense} strokeWidth={2} />
          </Pressable>
        </View>
      </SpringPressable>

      {/* Delete Confirmation Modal (lazy-mounted only when confirmVisible is true) */}
      {confirmVisible ? (
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
                  borderColor: withAlphaBorder(colors.danger, '80'),
                },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <HudReticle color={colors.danger} size={HUD_RETICLE_SIZE} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>刪除交易紀錄？</Text>
              <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
                確定要刪除「{transaction.name || transaction.category}」({formattedOrig}) 嗎？此動作無法復原。
              </Text>

              {deleteError ? (
                <View
                  style={[
                    styles.deleteErrorBox,
                    { backgroundColor: colors.expenseBg, borderColor: colors.expense },
                  ]}
                >
                  <Text style={[styles.deleteErrorText, { color: colors.expense }]}>
                    {deleteError}
                  </Text>
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setConfirmVisible(false)}
                  disabled={isDeleting}
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor: colors.chipBg,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>取消</Text>
                </Pressable>
                <Pressable
                  onPress={handleConfirmDelete}
                  disabled={isDeleting}
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor: colors.danger,
                      borderColor: colors.danger,
                    },
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
      ) : null}
    </Animated.View>
  );
}

function areTransactionCardPropsEqual(
  prev: TransactionCardProps,
  next: TransactionCardProps,
): boolean {
  if (prev.baseCurrency !== next.baseCurrency) return false;
  if (prev.showDate !== next.showDate) return false;
  if (prev.exchangeRates !== next.exchangeRates) {
    if (
      !prev.exchangeRates ||
      !next.exchangeRates ||
      prev.exchangeRates.base !== next.exchangeRates.base ||
      prev.exchangeRates.updated !== next.exchangeRates.updated ||
      prev.exchangeRates.rates !== next.exchangeRates.rates
    ) {
      return false;
    }
  }
  const a = prev.transaction;
  const b = next.transaction;
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.rowNumber === b.rowNumber &&
    a.date === b.date &&
    a.time === b.time &&
    a.account === b.account &&
    a.name === b.name &&
    a.category === b.category &&
    a.currency === b.currency &&
    a.amount === b.amount &&
    a.note === b.note &&
    a.updatedAt === b.updatedAt
  );
}

export const TransactionCard = React.memo(
  TransactionCardImpl,
  areTransactionCardPropsEqual,
);
TransactionCard.displayName = 'TransactionCard';

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 12,
  },
  leftAccentBar: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
    width: 2,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    maxWidth: 118,
  },
  accountDot: {
    width: 5,
    height: 5,
    borderRadius: 1,
  },
  accountText: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    fontWeight: '700',
  },
  metaText: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
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
    fontFamily: MONO_FONT,
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  convertedAmount: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    position: 'relative',
    width: '100%',
    maxWidth: 360,
    borderRadius: HUD_RADIUS_LG,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: {
    fontFamily: MONO_FONT,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  deleteErrorBox: {
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  deleteErrorText: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    fontFamily: MONO_FONT,
    fontSize: 13,
    fontWeight: '700',
  },
});
