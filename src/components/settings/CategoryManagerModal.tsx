import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AlertTriangle, GitMerge, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { LedgerIcon } from '@/components/LedgerIcon';
import { useLedgerStore } from '@/store/useLedgerStore';
import { getCategoryMeta } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';
import { SettingsModalFrame } from './SettingsModalFrame';
import { FeedbackState } from './settingsHelpers';

interface CategoryManagerModalProps {
  visible: boolean;
  onClose: () => void;
  onFeedback: (fb: FeedbackState) => void;
}

type CategorySubview =
  | { kind: 'list' }
  | { kind: 'rename'; category: string }
  | { kind: 'delete'; category: string; linkedCount: number }
  | { kind: 'merge' };

export function CategoryManagerModal({
  visible,
  onClose,
  onFeedback,
}: CategoryManagerModalProps) {
  const { colors } = useAppTheme();
  const transactions = useLedgerStore((s) => s.transactions);
  const settings = useLedgerStore((s) => s.settings);
  const addCategory = useLedgerStore((s) => s.addCategory);
  const renameCategory = useLedgerStore((s) => s.renameCategory);
  const mergeCategories = useLedgerStore((s) => s.mergeCategories);
  const removeCategoryCascade = useLedgerStore((s) => s.removeCategoryCascade);

  const [subview, setSubview] = useState<CategorySubview>({ kind: 'list' });
  const [newName, setNewName] = useState('');
  const [renameInput, setRenameInput] = useState('');
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSubview({ kind: 'list' });
      setNewName('');
      setRenameInput('');
      setMergeSource('');
      setMergeTarget('');
      setInlineError(null);
      setIsBusy(false);
    }
  }, [visible]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of transactions) {
      const key = (tx.category || '').trim();
      if (key) map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [transactions]);

  const handleAdd = async () => {
    const clean = newName.trim();
    if (!clean) {
      setInlineError('請輸入分類名稱');
      return;
    }
    setInlineError(null);
    setIsBusy(true);
    try {
      console.log(`[Settings/CategoryManagerModal] Add - name=${clean}`);
      await addCategory(clean);
      setNewName('');
      onFeedback({ type: 'success', message: `已新增分類「${clean}」` });
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : '新增分類失敗');
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmRename = async () => {
    if (subview.kind !== 'rename') return;
    const clean = renameInput.trim();
    if (!clean) {
      setInlineError('新分類名稱不可為空');
      return;
    }
    setInlineError(null);
    setIsBusy(true);
    try {
      console.log(
        `[Settings/CategoryManagerModal] Rename - old=${subview.category}, new=${clean}`,
      );
      await renameCategory(subview.category, clean);
      setSubview({ kind: 'list' });
      onFeedback({
        type: 'success',
        message: `已將分類「${subview.category}」更名為「${clean}」`,
      });
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : '更名失敗');
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (subview.kind !== 'delete') return;
    setInlineError(null);
    setIsBusy(true);
    try {
      console.log(
        `[Settings/CategoryManagerModal] DeleteCascade - category=${subview.category}, linked=${subview.linkedCount}`,
      );
      const res = await removeCategoryCascade(subview.category);
      setSubview({ kind: 'list' });
      onFeedback({
        type: 'success',
        message: `已刪除分類「${subview.category}」及 ${res.deletedCount ?? subview.linkedCount} 筆關聯交易`,
      });
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setIsBusy(false);
    }
  };

  const openMergeSubview = () => {
    setInlineError(null);
    const cats = settings.categories;
    setMergeSource(cats[0] || '');
    setMergeTarget(cats[1] || '');
    setSubview({ kind: 'merge' });
  };

  const handleConfirmMerge = async () => {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) {
      setInlineError('請選擇兩個不同的來源與目標分類');
      return;
    }
    setInlineError(null);
    setIsBusy(true);
    try {
      const affected = categoryCounts[mergeSource] || 0;
      console.log(
        `[Settings/CategoryManagerModal] Merge - source=${mergeSource}, target=${mergeTarget}, affected=${affected}`,
      );
      await mergeCategories(mergeSource, mergeTarget);
      setSubview({ kind: 'list' });
      onFeedback({
        type: 'success',
        message: `已將「${mergeSource}」（${affected} 筆）合併至「${mergeTarget}」`,
      });
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : '合併分類失敗');
    } finally {
      setIsBusy(false);
    }
  };

  const modalTitle =
    subview.kind === 'rename'
      ? `更名分類：${subview.category}`
      : subview.kind === 'delete'
        ? `刪除分類：${subview.category}`
        : subview.kind === 'merge'
          ? '合併分類'
          : '管理分類';

  const headerRight =
    subview.kind === 'list' && settings.categories.length >= 2 ? (
      <Pressable
        onPress={openMergeSubview}
        style={[styles.mergeHeaderBtn, { backgroundColor: colors.primaryLight }]}
      >
        <GitMerge size={14} color={colors.primary} />
        <Text style={[styles.mergeHeaderText, { color: colors.primary }]}>合併分類</Text>
      </Pressable>
    ) : undefined;

  return (
    <SettingsModalFrame
      visible={visible}
      title={modalTitle}
      subtitle={
        subview.kind === 'list' ? `共 ${settings.categories.length} 個分類` : undefined
      }
      onClose={onClose}
      onBack={
        subview.kind !== 'list'
          ? () => {
              setInlineError(null);
              setSubview({ kind: 'list' });
            }
          : undefined
      }
      headerRight={headerRight}
    >
      {inlineError ? (
        <View
          style={[
            styles.errorBox,
            { backgroundColor: colors.expenseBg, borderColor: colors.expense },
          ]}
        >
          <Text style={[styles.errorText, { color: colors.expense }]}>{inlineError}</Text>
        </View>
      ) : null}

      {subview.kind === 'list' ? (
        <>
          <View style={styles.addRow}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="輸入新分類名稱（如：寵物）"
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
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
            >
              <Plus size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.list}>
            {settings.categories.map((cat) => {
              const meta = getCategoryMeta(cat);
              const count = categoryCounts[cat] || 0;
              return (
                <View
                  key={cat}
                  style={[
                    styles.itemRow,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.iconBox, { backgroundColor: meta.bgColor }]}>
                    <LedgerIcon name={meta.icon} size={18} color={meta.color} />
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
                      {cat}
                    </Text>
                    <Text style={[styles.itemCount, { color: colors.textMuted }]}>
                      {count} 筆交易
                    </Text>
                  </View>
                  <View style={styles.itemActions}>
                    <Pressable
                      onPress={() => {
                        setInlineError(null);
                        setRenameInput(cat);
                        setSubview({ kind: 'rename', category: cat });
                      }}
                      style={[styles.smallBtn, { backgroundColor: colors.chipBg }]}
                    >
                      <Pencil size={13} color={colors.textSecondary} />
                      <Text style={[styles.smallBtnText, { color: colors.textSecondary }]}>
                        編輯
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (settings.categories.length <= 1) {
                          setInlineError('至少需保留 1 個分類，無法全部刪除');
                          return;
                        }
                        setInlineError(null);
                        setSubview({ kind: 'delete', category: cat, linkedCount: count });
                      }}
                      style={[styles.smallBtn, { backgroundColor: colors.expenseBg }]}
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

      {subview.kind === 'rename' ? (
        <View style={styles.subviewBox}>
          <Text style={[styles.subviewDesc, { color: colors.textSecondary }]}>
            更名後將同步更新所有關聯交易紀錄的分類名稱。
          </Text>
          <TextInput
            value={renameInput}
            onChangeText={setRenameInput}
            placeholder="輸入新分類名稱"
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
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>確認更名</Text>
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
              確定刪除分類「{subview.category}」？這將會連同刪除該分類下的{' '}
              {subview.linkedCount} 筆交易紀錄，且無法復原。
            </Text>
          </View>
          <Pressable
            onPress={handleConfirmDelete}
            disabled={isBusy}
            style={[styles.primaryBtn, { backgroundColor: colors.danger }]}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>確認連帶刪除</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {subview.kind === 'merge' ? (
        <View style={styles.subviewBox}>
          <Text style={[styles.subviewLabel, { color: colors.text }]}>
            1. 選擇要被合併（移除）的來源分類
          </Text>
          <View style={styles.chipGrid}>
            {settings.categories.map((cat) => {
              const selected = mergeSource === cat;
              return (
                <Pressable
                  key={`src-${cat}`}
                  onPress={() => {
                    setMergeSource(cat);
                    if (mergeTarget === cat) {
                      const next = settings.categories.find((c) => c !== cat) || '';
                      setMergeTarget(next);
                    }
                  }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.expenseBg : colors.surfaceElevated,
                      borderColor: selected ? colors.expense : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? colors.expense : colors.textSecondary },
                    ]}
                  >
                    {cat} ({categoryCounts[cat] || 0})
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.subviewLabel, { color: colors.text }]}>
            2. 選擇保留的目標分類
          </Text>
          <View style={styles.chipGrid}>
            {settings.categories
              .filter((cat) => cat !== mergeSource)
              .map((cat) => {
                const selected = mergeTarget === cat;
                return (
                  <Pressable
                    key={`dst-${cat}`}
                    onPress={() => setMergeTarget(cat)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.primaryLight : colors.surfaceElevated,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? colors.primary : colors.textSecondary },
                      ]}
                    >
                      {cat} ({categoryCounts[cat] || 0})
                    </Text>
                  </Pressable>
                );
              })}
          </View>

          <View
            style={[
              styles.mergePreviewBox,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.subviewDesc, { color: colors.textSecondary }]}>
              將把「{mergeSource || '—'}」的 {categoryCounts[mergeSource] || 0}{' '}
              筆交易全部移轉至「{mergeTarget || '—'}」，並從清單中移除「{mergeSource || '—'}」。
            </Text>
          </View>

          <Pressable
            onPress={handleConfirmMerge}
            disabled={isBusy || !mergeSource || !mergeTarget || mergeSource === mergeTarget}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity: isBusy ? 0.7 : 1,
              },
            ]}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>確認合併分類</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </SettingsModalFrame>
  );
}

const styles = StyleSheet.create({
  mergeHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  mergeHeaderText: {
    fontSize: 12,
    fontWeight: '800',
  },
  errorBox: {
    padding: 10,
    borderRadius: 12,
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
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
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
    borderRadius: 14,
    borderWidth: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
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
    fontSize: 12,
    marginTop: 1,
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
    borderRadius: 9,
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  subviewBox: {
    gap: 12,
  },
  subviewLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  subviewDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mergePreviewBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  primaryBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
});
