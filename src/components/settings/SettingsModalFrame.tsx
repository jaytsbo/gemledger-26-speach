import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronLeft, X } from 'lucide-react-native';
import { useAppTheme } from '@/theme/ThemeContext';

interface SettingsModalFrameProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  scrollable?: boolean;
}

/**
 * Shared single-layer modal shell for Settings sub-screens.
 * Supports inline subview navigation via `onBack` without stacking Modals.
 */
export function SettingsModalFrame({
  visible,
  title,
  subtitle,
  onClose,
  onBack,
  headerRight,
  children,
  scrollable = true,
}: SettingsModalFrameProps) {
  const { colors } = useAppTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onBack ?? onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={styles.backdropDismiss} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={styles.headerLeft}>
              {onBack ? (
                <Pressable
                  onPress={onBack}
                  hitSlop={10}
                  style={[styles.iconBtn, { backgroundColor: colors.chipBg }]}
                >
                  <ChevronLeft size={18} color={colors.text} />
                </Pressable>
              ) : null}
              <View style={styles.titleWrap}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text
                    style={[styles.subtitle, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.headerActions}>
              {headerRight}
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={[styles.iconBtn, { backgroundColor: colors.chipBg }]}
              >
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          {scrollable ? (
            <ScrollView
              contentContainerStyle={styles.scrollBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.scrollBody}>{children}</View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.56)',
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    flex: 1,
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    padding: 18,
    paddingBottom: 30,
    gap: 14,
  },
});
