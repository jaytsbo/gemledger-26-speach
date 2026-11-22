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
import { HudReticle, MONO_FONT } from '@/components/ui/HudReticle';
import { HUD_RADIUS, HUD_RADIUS_LG } from '@/theme/colors';
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
  accentVariant?: 'primary' | 'accent';
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
  accentVariant = 'primary',
}: SettingsModalFrameProps) {
  const { colors, isDark } = useAppTheme();
  const accentColor = accentVariant === 'accent' ? colors.accent : colors.primary;
  const accentGlow = accentVariant === 'accent' ? colors.accentGlow : colors.primaryGlow;

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
              borderTopColor: accentColor,
              borderLeftColor: colors.cardBorder,
              borderRightColor: colors.cardBorder,
              shadowColor: isDark ? accentGlow : colors.shadow,
              shadowOpacity: isDark ? 0.55 : 0.16,
            },
          ]}
        >
          <View
            style={[
              styles.header,
              {
                backgroundColor: colors.surface,
                borderBottomColor: colors.divider,
              },
            ]}
          >
            <View style={styles.headerLeft}>
              {onBack ? (
                <Pressable
                  onPress={onBack}
                  hitSlop={10}
                  style={[
                    styles.iconBtn,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <ChevronLeft size={18} color={accentColor} />
                </Pressable>
              ) : null}
              <View style={[styles.titleAccentBar, { backgroundColor: accentColor }]} />
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
                style={[
                  styles.iconBtn,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              >
                <X size={17} color={colors.textSecondary} />
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

          <HudReticle variant={accentVariant} inset={2} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    flex: 1,
  },
  sheet: {
    position: 'relative',
    maxHeight: '88%',
    borderTopLeftRadius: HUD_RADIUS_LG,
    borderTopRightRadius: HUD_RADIUS_LG,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
    elevation: 10,
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
  titleAccentBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    padding: 18,
    paddingBottom: 30,
    gap: 14,
  },
});
