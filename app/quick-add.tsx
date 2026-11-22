import { useLocalSearchParams, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AiBookkeepChatView,
  AiBookkeepChatViewHandle,
} from '../src/components/quick-add/AiBookkeepChatView';
import { ManualBookkeepView } from '../src/components/quick-add/ManualBookkeepView';
import {
  MODE_SEGMENT_OPTIONS,
  ModalMode,
} from '../src/components/quick-add/quickAddHelpers';
import { CyberNeuralBackground } from '../src/components/ui/CyberNeuralBackground';
import { HudReticle, MONO_FONT } from '../src/components/ui/HudReticle';
import { SpringPressable } from '../src/components/ui/SpringPressable';
import { SpringSegmentedControl } from '../src/components/ui/SpringSegmentedControl';
import { useLedgerStore } from '../src/store/useLedgerStore';
import { HUD_RADIUS, HUD_RADIUS_LG } from '../src/theme/colors';
import { useAppTheme } from '../src/theme/ThemeContext';

export default function QuickAddModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string; mode?: string }>();
  const editId = typeof params.editId === 'string' ? params.editId : undefined;
  const initialModeParam: ModalMode = params.mode === 'ai' && !editId ? 'ai' : 'manual';

  const { colors, isDark } = useAppTheme();
  const { transactions, initialized, initialize } = useLedgerStore();

  const editingTransaction = useMemo(() => {
    if (!editId) return undefined;
    const byId = transactions.find(
      (tx) =>
        tx.id !== undefined &&
        tx.id !== null &&
        String(tx.id).trim() !== '' &&
        String(tx.id) === editId,
    );
    if (byId) return byId;
    return transactions.find((tx) => {
      const hasValidId =
        tx.id !== undefined && tx.id !== null && String(tx.id).trim() !== '';
      return !hasValidId && String(tx.rowNumber ?? '') === editId;
    });
  }, [editId, transactions]);

  const [activeMode, setActiveMode] = useState<ModalMode>(initialModeParam);
  const [manualDirty, setManualDirty] = useState(false);
  const [aiDirty, setAiDirty] = useState(false);
  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);

  const aiViewRef = useRef<AiBookkeepChatViewHandle | null>(null);

  useEffect(() => {
    if (!initialized) {
      initialize();
    }
  }, [initialize, initialized]);

  useEffect(() => {
    if (editId) {
      setActiveMode('manual');
      setAiDirty(false);
    } else if (params.mode === 'ai') {
      setActiveMode('ai');
    } else if (params.mode === 'manual') {
      setActiveMode('manual');
    }
  }, [editId, params.mode]);

  const closeModal = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);

  const hasUnsavedChanges = editId ? manualDirty : manualDirty || aiDirty;

  const handleRequestClose = useCallback(() => {
    if (hasUnsavedChanges) {
      console.log('[QuickAdd/handleRequestClose] Prompt - Unsaved changes detected');
      setDiscardConfirmVisible(true);
      return;
    }
    closeModal();
  }, [closeModal, hasUnsavedChanges]);

  const handleConfirmDiscard = useCallback(() => {
    aiViewRef.current?.cancelActiveWork();
    setDiscardConfirmVisible(false);
    closeModal();
  }, [closeModal]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <CyberNeuralBackground />
      <KeyboardAvoidingView
        style={[styles.flex1, styles.transparentBg]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top Modal Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <View style={styles.headerTopRow}>
            <SpringPressable
              onPress={handleRequestClose}
              pressedScale={0.92}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel="關閉"
              style={[
                styles.closeBtn,
                {
                  backgroundColor: colors.chipBg,
                  borderColor: colors.border,
                },
              ]}
            >
              <X size={18} color={colors.text} />
            </SpringPressable>

            <View
              style={[
                styles.headerTitleBadge,
                {
                  backgroundColor:
                    !editingTransaction && !editId && activeMode === 'ai'
                      ? colors.accentBg
                      : colors.primaryBg,
                  borderColor:
                    !editingTransaction && !editId && activeMode === 'ai'
                      ? colors.accent
                      : colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.headerTitleText,
                  {
                    color:
                      !editingTransaction && !editId && activeMode === 'ai'
                        ? colors.accent
                        : colors.primary,
                  },
                ]}
              >
                {editingTransaction || editId ? '編輯紀錄' : '快速記帳'}
              </Text>
            </View>

            <View style={styles.headerSpacer} />
          </View>

          {!editingTransaction && !editId ? (
            <View style={styles.segmentRow}>
              <SpringSegmentedControl
                options={MODE_SEGMENT_OPTIONS}
                value={activeMode}
                onChange={setActiveMode}
                size="sm"
                style={styles.modeSegment}
                accessibilityLabel="記帳模式切換"
              />
            </View>
          ) : null}
        </View>

        {/* Keep both views mounted when not editing so switching Manual <-> AI preserves typed state */}
        <View style={activeMode === 'manual' ? styles.flex1 : styles.hidden}>
          <ManualBookkeepView
            editId={editId}
            editingTransaction={editingTransaction}
            isActive={activeMode === 'manual'}
            onCloseModal={closeModal}
            onDirtyChange={setManualDirty}
          />
        </View>

        {!editId ? (
          <View style={activeMode === 'ai' ? styles.flex1 : styles.hidden}>
            <AiBookkeepChatView
              ref={aiViewRef}
              isActive={activeMode === 'ai'}
              onDirtyChange={setAiDirty}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* Unsaved Changes Confirmation Modal (cross-platform: iOS, Android, Web) */}
      <Modal
        visible={discardConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDiscardConfirmVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setDiscardConfirmVisible(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: isDark
                  ? 'rgba(10, 15, 30, 0.94)'
                  : 'rgba(255, 255, 255, 0.96)',
                borderColor: colors.primary,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <HudReticle variant="primary" />
            <Text style={[styles.modalTitle, { color: colors.text }]}>捨棄未儲存內容？</Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              目前尚有未儲存的編輯內容、未送出的文字、圖片或錄音，確定要離開嗎？（已產生的 AI 對話與草稿會自動保留）
            </Text>

            <View style={styles.modalActions}>
              <SpringPressable
                pressedScale={0.95}
                onPress={() => setDiscardConfirmVisible(false)}
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor: colors.chipBg,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>
                  繼續編輯
                </Text>
              </SpringPressable>
              <SpringPressable
                pressedScale={0.95}
                haptic="light"
                onPress={handleConfirmDiscard}
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor: colors.danger,
                    borderColor: colors.danger,
                  },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>捨棄並離開</Text>
              </SpringPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  transparentBg: {
    backgroundColor: 'transparent',
  },
  hidden: {
    display: 'none',
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  headerTitleBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  headerTitleText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    letterSpacing: 0.6,
  },
  segmentRow: {
    alignItems: 'center',
  },
  modeSegment: {
    width: '100%',
    maxWidth: 360,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
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
    fontSize: 16,
    fontWeight: '700',
    fontFamily: MONO_FONT,
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
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
});
