import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AlertTriangle, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { ACCOUNT_ICON_OPTIONS, LedgerIcon } from '@/components/LedgerIcon';
import { MONO_FONT } from '@/components/ui/HudReticle';
import { useLedgerStore } from '@/store/useLedgerStore';
import { getAccountMeta, HUD_RADIUS } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';
import { SettingsModalFrame } from './SettingsModalFrame';
import { FeedbackState } from './settingsHelpers';

interface AccountManagerModalProps {
  visible: boolean;
  onClose: () => void;
  onFeedback: (fb: FeedbackState) => void;
}

type AccountSubview =
  | { kind: 'list' }
  | { kind: 'icon'; account: string }
  | { kind: 'rename'; account: string }
  | { kind: 'delete'; account: string; linkedCount: number };

export function AccountManagerModal({
  visible,
  onClose,
  onFeedback,
}: AccountManagerModalProps) {
  const { colors } = useAppTheme();
  const transactions = useLedgerStore((s) => s.transactions);
  const settings = useLedgerStore((s) => s.settings);
  const addAccount = useLedgerStore((s) => s.addAccount);
  const renameAccount = useLedgerStore((s) => s.renameAccount);
  const removeAccountCascade = useLedgerStore((s) => s.removeAccountCascade);
  const updateSettings = useLedgerStore((s) => s.updateSettings);

  const [subview, setSubview] = useState<AccountSubview>({ kind: 'list' });
  const [newName, setNewName] = useState('');
  const [renameInput, setRenameInput] = useState('');
  const [inlineFeedback, setInlineFeedback] = useState<FeedbackState | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setSubview({ kind: 'list' });
      setNewName('');
      setRenameInput('');
      setInlineFeedback(null);
      isBusyRef.current = false;
      setIsBusy(false);
    }
  }, [visible]);

  const accountCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of transactions) {
      const key = (tx.account || '').trim();
      if (key) map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [transactions]);

  const handleAdd = async () => {
    if (isBusyRef.current) return;
    const clean = newName.trim();
    if (!clean) {
      setInlineFeedback({ type: 'error', message: '請輸入帳戶名稱' });
      return;
    }
    isBusyRef.current = true;
    setInlineFeedback(null);
    setIsBusy(true);
    try {
      console.log(`[Settings/AccountManagerModal] Add - name=${clean}`);
      await addAccount(clean);
      setNewName('');
      const fb: FeedbackState = { type: 'success', message: `已新增帳戶「${clean}」` };
      setInlineFeedback(fb);
      onFeedback(fb);
    } catch (err) {
      setInlineFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : '新增帳戶失敗',
      });
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  };

  const handlePickIcon = async (account: string, iconName: string) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    console.log(`[Settings/AccountManagerModal] PickIcon - account=${account}, icon=${iconName}`);
    setInlineFeedback(null);
    setIsBusy(true);
    try {
      await updateSettings({
        accountIcons: {
          ...(settings.accountIcons || {}),
          [account]: iconName,
        },
      });
      setSubview({ kind: 'list' });
      const fb: FeedbackState = { type: 'success', message: `已更新「${account}」圖示` };
      setInlineFeedback(fb);
      onFeedback(fb);
    } catch (err) {
      setInlineFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : '更新圖示失敗',
      });
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  };

  const handleConfirmRename = async () => {
    if (subview.kind !== 'rename' || isBusyRef.current) return;
    const clean = renameInput.trim();
    if (!clean) {
      setInlineFeedback({ type: 'error', message: '新帳戶名稱不可為空' });
      return;
    }
    isBusyRef.current = true;
    setInlineFeedback(null);
    setIsBusy(true);
    try {
      console.log(
        `[Settings/AccountManagerModal] Rename - old=${subview.account}, new=${clean}`,
      );
      await renameAccount(subview.account, clean);
      setSubview({ kind: 'list' });
      const fb: FeedbackState = {
        type: 'success',
        message: `已將帳戶「${subview.account}」更名為「${clean}」`,
      };
      setInlineFeedback(fb);
      onFeedback(fb);
    } catch (err) {
      setInlineFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : '更名失敗',
      });
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (subview.kind !== 'delete' || isBusyRef.current) return;
    isBusyRef.current = true;
    setInlineFeedback(null);
    setIsBusy(true);
    try {
      console.log(
        `[Settings/AccountManagerModal] DeleteCascade - account=${subview.account}, linked=${subview.linkedCount}`,
      );
      const res = await removeAccountCascade(subview.account);
      if (settings.accountIcons?.[subview.account]) {
        const nextIcons = { ...settings.accountIcons };
        delete nextIcons[subview.account];
        await updateSettings({ accountIcons: nextIcons });
      }
      setSubview({ kind: 'list' });
      const fb: FeedbackState = {
        type: 'success',
        message: `已刪除帳戶「${subview.account}」及 ${res.deletedCount ?? subview.linkedCount} 筆關聯交易`,
      };
      setInlineFeedback(fb);
      onFeedback(fb);
    } catch (err) {
      setInlineFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : '刪除失敗',
      });
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  };

  const modalTitle =
    subview.kind === 'icon'
      ? `選擇圖示 · ${subview.account}`
      : subview.kind === 'rename'
        ? `更名帳戶 · ${subview.account}`
        : subview.kind === 'delete'
          ? `刪除帳戶 · ${subview.account}`
          : '帳戶管理';

  return (
    <SettingsModalFrame
      visible={visible}
      title={modalTitle}
      subtitle={
        subview.kind === 'list' ? `共 ${settings.accounts.length} 個帳戶 · 點擊圖示可更換` : undefined
      }
      onClose={onClose}
      onBack={
        subview.kind !== 'list'
          ? () => {
              setInlineFeedback(null);
              setSubview({ kind: 'list' });
            }
          : undefined
      }
    >
      {inlineFeedback ? (
        <View
          style={[
            styles.errorBox,
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
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
              styles.errorText,
              {
                flex: 1,
                color:
                  inlineFeedback.type === 'success' ? colors.income : colors.expense,
              },
            ]}
          >
            {inlineFeedback.message}
          </Text>
        </View>
      ) : null}

      {subview.kind === 'list' ? (
        <>
          <View style={styles.addRow}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              editable={!isBusy}
              placeholder="輸入新帳戶名稱（如：玉山銀行）"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              onSubmitEditing={handleAdd}
            />
            <Pressable
              onPress={handleAdd}
              disabled={isBusy}
              style={[
                styles.addBtn,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
              ]}
            >
              <Plus size={18} color={colors.onPrimary} />
            </Pressable>
          </View>

          <View style={styles.list}>
            {settings.accounts.map((acc) => {
              const meta = getAccountMeta(acc);
              const iconName = settings.accountIcons?.[acc] || meta.icon;
              const count = accountCounts[acc] || 0;
              return (
                <View
                  key={acc}
                  style={[
                    styles.itemRow,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Pressable
                    disabled={isBusy}
                    onPress={() => {
                      if (isBusyRef.current) return;
                      setInlineFeedback(null);
                      setSubview({ kind: 'icon', account: acc });
                    }}
                    style={[
                      styles.iconBox,
                      {
                        backgroundColor: meta.bgColor,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <LedgerIcon name={iconName} size={18} color={meta.color} />
                  </Pressable>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
                      {acc}
                    </Text>
                    <Text style={[styles.itemCount, { color: colors.textMuted }]}>
                      {count} 筆交易
                    </Text>
                  </View>
                  <View style={styles.itemActions}>
                    <Pressable
                      disabled={isBusy}
                      onPress={() => {
                        setInlineFeedback(null);
                        setRenameInput(acc);
                        setSubview({ kind: 'rename', account: acc });
                      }}
                      style={[
                        styles.smallBtn,
                        {
                          backgroundColor: colors.chipBg,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Pencil size={13} color={colors.textSecondary} />
                      <Text style={[styles.smallBtnText, { color: colors.textSecondary }]}>
                        編輯
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={isBusy}
                      onPress={() => {
                        if (settings.accounts.length <= 1) {
                          setInlineFeedback({
                            type: 'error',
                            message: '至少需保留 1 個帳戶，無法全部刪除',
                          });
                          return;
                        }
                        setInlineFeedback(null);
                        setSubview({ kind: 'delete', account: acc, linkedCount: count });
                      }}
                      style={[
                        styles.smallBtn,
                        {
                          backgroundColor: colors.expenseBg,
                          borderColor: colors.expense,
                        },
                      ]}
                    >
                      <Trash2 size={13} color={colors.expense} />
                      <Text style={[styles.smallBtnText, { color: colors.expense }]}>
                        刪除
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {subview.kind === 'icon' ? (
        <View style={styles.iconGrid}>
          {ACCOUNT_ICON_OPTIONS.map((opt) => {
            const currentIcon =
              settings.accountIcons?.[subview.account] || getAccountMeta(subview.account).icon;
            const selected = currentIcon === opt.name;
            return (
              <Pressable
                key={opt.name}
                onPress={() => handlePickIcon(subview.account, opt.name)}
                disabled={isBusy}
                style={[
                  styles.iconOption,
                  {
                    backgroundColor: selected ? colors.primaryBg : colors.surfaceElevated,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <LedgerIcon
                  name={opt.name}
                  size={22}
                  color={selected ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.iconOptionLabel,
                    { color: selected ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {subview.kind === 'rename' ? (
        <View style={styles.subviewBox}>
          <Text style={[styles.subviewDesc, { color: colors.textSecondary }]}>
            更名後將同步更新所有關聯交易紀錄的帳戶名稱。
          </Text>
          <TextInput
            value={renameInput}
            onChangeText={setRenameInput}
            editable={!isBusy}
            placeholder="輸入新帳戶名稱"
            placeholderTextColor={colors.textMuted}
            autoFocus
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            onSubmitEditing={handleConfirmRename}
          />
          <Pressable
            onPress={handleConfirmRename}
            disabled={isBusy}
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
                確認更名
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {subview.kind === 'delete' ? (
        <View style={styles.subviewBox}>
          <View
            style={[
              styles.warningBox,
              { backgroundColor: colors.expenseBg, borderColor: colors.expense },
            ]}
          >
            <AlertTriangle size={20} color={colors.expense} />
            <Text style={[styles.warningText, { color: colors.text }]}>
              確定刪除帳戶「{subview.account}」？這將會連同刪除該帳戶下的{' '}
              {subview.linkedCount} 筆交易紀錄，且無法復原。
            </Text>
          </View>
          <Pressable
            onPress={handleConfirmDelete}
            disabled={isBusy}
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.danger, borderColor: colors.danger },
            ]}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={[styles.primaryBtnText, { color: '#FFFFFF' }]}>
                確認連帶刪除
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </SettingsModalFrame>
  );
}

const styles = StyleSheet.create({
  errorBox: {
    padding: 10,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '700',
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '800',
  },
  itemCount: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  itemActions: {
    flexDirection: 'row',
    gap: 6,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconOption: {
    width: '30.5%',
    paddingVertical: 14,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  iconOptionLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  subviewBox: {
    gap: 12,
  },
  subviewDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  primaryBtn: {
    height: 44,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    letterSpacing: 0.4,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
