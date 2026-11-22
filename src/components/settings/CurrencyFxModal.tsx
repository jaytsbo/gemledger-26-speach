import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AlertTriangle, Check, CheckCircle2, RefreshCw } from 'lucide-react-native';
import { HudReticle, MONO_FONT } from '@/components/ui/HudReticle';
import { useLedgerStore } from '@/store/useLedgerStore';
import { HUD_RADIUS } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';
import { CurrencyCode, SUPPORTED_CURRENCIES } from '@/types/ledger';
import {
  convertCurrency,
  CURRENCY_LABELS,
  CURRENCY_SYMBOLS,
  DEFAULT_EXCHANGE_RATES,
} from '@/utils/currency';
import { SettingsModalFrame } from './SettingsModalFrame';
import { FeedbackState, formatFxTimestamp } from './settingsHelpers';

interface CurrencyFxModalProps {
  visible: boolean;
  onClose: () => void;
  onFeedback: (fb: FeedbackState) => void;
}

export function CurrencyFxModal({
  visible,
  onClose,
  onFeedback,
}: CurrencyFxModalProps) {
  const { colors } = useAppTheme();
  const baseCurrency = useLedgerStore((s) => s.baseCurrency);
  const exchangeRates = useLedgerStore((s) => s.exchangeRates);
  const isSyncingFX = useLedgerStore((s) => s.isSyncingFX);
  const setBaseCurrency = useLedgerStore((s) => s.setBaseCurrency);
  const syncExchangeRates = useLedgerStore((s) => s.syncExchangeRates);

  const [isBusy, setIsBusy] = useState(false);
  const [inlineFeedback, setInlineFeedback] = useState<FeedbackState | null>(null);
  const isBusyRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setInlineFeedback(null);
      isBusyRef.current = false;
      setIsBusy(false);
    }
  }, [visible]);

  const fxPreviewList = useMemo(() => {
    const targets: CurrencyCode[] = (['USD', 'JPY', 'EUR'] as CurrencyCode[]).filter(
      (c) => c !== baseCurrency,
    );
    return targets.slice(0, 3).map((cur) => {
      const rate = convertCurrency(1, cur, baseCurrency, exchangeRates);
      return `1 ${cur} ≈ ${rate >= 10 ? rate.toFixed(2) : rate.toFixed(3)} ${baseCurrency}`;
    });
  }, [baseCurrency, exchangeRates]);

  const handleSelectCurrency = async (cur: CurrencyCode) => {
    if (isBusyRef.current || isSyncingFX) return;
    isBusyRef.current = true;
    setIsBusy(true);
    setInlineFeedback(null);
    console.log(`[Settings/CurrencyFxModal] SelectBaseCurrency - ${cur}`);
    try {
      await setBaseCurrency(cur);
      const fb: FeedbackState = {
        type: 'success',
        message: `已將預設本位幣切換為 ${cur}（${CURRENCY_LABELS[cur]}）`,
      };
      setInlineFeedback(fb);
      onFeedback(fb);
    } catch (err) {
      const fb: FeedbackState = {
        type: 'error',
        message: err instanceof Error ? err.message : '切換幣別失敗',
      };
      setInlineFeedback(fb);
      onFeedback(fb);
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  };

  const handleSyncFX = async () => {
    if (isBusyRef.current || isSyncingFX) return;
    isBusyRef.current = true;
    setIsBusy(true);
    setInlineFeedback(null);
    console.log('[Settings/CurrencyFxModal] SyncFX - Requesting live exchange rates');
    try {
      const res = await syncExchangeRates();
      const isStaticFallback = res.updated === DEFAULT_EXCHANGE_RATES.updated;
      const fb: FeedbackState = isStaticFallback
        ? {
            type: 'error',
            message: '無法連線即時匯率服務，目前沿用內建離線預設匯率',
          }
        : {
            type: 'success',
            message: `即時匯率已更新（${formatFxTimestamp(res.updated)}）`,
          };
      setInlineFeedback(fb);
      onFeedback(fb);
    } catch (err) {
      const fb: FeedbackState = {
        type: 'error',
        message: err instanceof Error ? err.message : '匯率同步失敗',
      };
      setInlineFeedback(fb);
      onFeedback(fb);
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  };

  const actionLocked = isBusy || isSyncingFX;

  return (
    <SettingsModalFrame
      visible={visible}
      title="匯率與幣別"
      subtitle={`最後更新：${formatFxTimestamp(exchangeRates.updated)}`}
      onClose={onClose}
    >
      {inlineFeedback ? (
        <View
          style={[
            styles.feedbackBox,
            {
              backgroundColor:
                inlineFeedback.type === 'success' ? colors.incomeBg : colors.expenseBg,
              borderColor:
                inlineFeedback.type === 'success' ? colors.income : colors.expense,
            },
          ]}
        >
          {inlineFeedback.type === 'success' ? (
            <CheckCircle2 size={15} color={colors.income} />
          ) : (
            <AlertTriangle size={15} color={colors.expense} />
          )}
          <Text
            style={[
              styles.feedbackText,
              {
                color:
                  inlineFeedback.type === 'success' ? colors.income : colors.expense,
              },
            ]}
          >
            {inlineFeedback.message}
          </Text>
        </View>
      ) : null}

      {/* Sync Button & Rate Preview */}
      <View
        style={[
          styles.fxBox,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      >
        <HudReticle variant="primary" size={7} inset={1} />
        <View style={styles.fxHeaderRow}>
          <View>
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>
              即時匯率預覽
            </Text>
            <Text style={[styles.fxTimestamp, { color: colors.textMuted }]}>
              {formatFxTimestamp(exchangeRates.updated)}
            </Text>
          </View>
          <Pressable
            onPress={handleSyncFX}
            disabled={actionLocked}
            style={[
              styles.syncBtn,
              {
                backgroundColor: colors.primary,
                borderColor: colors.primary,
                opacity: actionLocked ? 0.7 : 1,
              },
            ]}
          >
            {isSyncingFX ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <RefreshCw size={14} color={colors.onPrimary} />
            )}
            <Text style={[styles.syncBtnText, { color: colors.onPrimary }]}>
              {isSyncingFX ? '同步中...' : '同步匯率'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.previewList}>
          {fxPreviewList.map((line) => (
            <View
              key={line}
              style={[
                styles.previewPill,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.previewText, { color: colors.textSecondary }]}>
                {line}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Currency Selector */}
      <View style={styles.currencySection}>
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>
          選擇本位幣別
        </Text>
        <View style={styles.currencyList}>
          {SUPPORTED_CURRENCIES.map((cur) => {
            const active = cur === baseCurrency;
            return (
              <Pressable
                key={cur}
                disabled={actionLocked}
                onPress={() => handleSelectCurrency(cur)}
                style={[
                  styles.currencyRow,
                  {
                    backgroundColor: active
                      ? colors.primaryBg
                      : colors.surfaceElevated,
                    borderColor: active ? colors.primary : colors.border,
                    opacity: actionLocked && !active ? 0.65 : 1,
                  },
                ]}
              >
                <View style={styles.currencyLeft}>
                  <View
                    style={[
                      styles.symbolBadge,
                      {
                        backgroundColor: active ? colors.primary : colors.chipBg,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.symbolText,
                        { color: active ? colors.onPrimary : colors.text },
                      ]}
                    >
                      {CURRENCY_SYMBOLS[cur]}
                    </Text>
                  </View>
                  <View>
                    <Text
                      style={[
                        styles.currencyCode,
                        { color: active ? colors.primary : colors.text },
                      ]}
                    >
                      {cur}
                    </Text>
                    <Text style={[styles.currencyName, { color: colors.textMuted }]}>
                      {CURRENCY_LABELS[cur]}
                    </Text>
                  </View>
                </View>
                {active ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </SettingsModalFrame>
  );
}

const styles = StyleSheet.create({
  fxBox: {
    position: 'relative',
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  fxHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    letterSpacing: 0.5,
  },
  fxTimestamp: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  syncBtnText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: MONO_FONT,
  },
  previewList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewPill: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  previewText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  currencySection: {
    gap: 10,
  },
  currencyList: {
    gap: 8,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  currencyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  symbolBadge: {
    width: 34,
    height: 34,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: MONO_FONT,
  },
  currencyCode: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    letterSpacing: 0.4,
  },
  currencyName: {
    fontSize: 12,
    marginTop: 1,
  },
  feedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  feedbackText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
});
