import * as Haptics from 'expo-haptics';
import { Delete } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';

export interface CalculatorKeypadProps {
  expression: string;
  onExpressionChange: (nextExpression: string, evaluatedValue: number) => void;
  onEvaluate?: (evaluatedValue: number) => void;
  accentColor?: string;
  disabled?: boolean;
}

type KeyKind = 'digit' | 'operator' | 'action' | 'equals';

interface KeyConfig {
  label: string;
  value: string;
  kind: KeyKind;
}

const KEY_ROWS: KeyConfig[][] = [
  [
    { label: '7', value: '7', kind: 'digit' },
    { label: '8', value: '8', kind: 'digit' },
    { label: '9', value: '9', kind: 'digit' },
    { label: '⌫', value: 'BACKSPACE', kind: 'action' },
  ],
  [
    { label: '4', value: '4', kind: 'digit' },
    { label: '5', value: '5', kind: 'digit' },
    { label: '6', value: '6', kind: 'digit' },
    { label: '+', value: '+', kind: 'operator' },
  ],
  [
    { label: '1', value: '1', kind: 'digit' },
    { label: '2', value: '2', kind: 'digit' },
    { label: '3', value: '3', kind: 'digit' },
    { label: '−', value: '-', kind: 'operator' },
  ],
  [
    { label: 'AC', value: 'AC', kind: 'action' },
    { label: '0', value: '0', kind: 'digit' },
    { label: '.', value: '.', kind: 'digit' },
    { label: '=', value: '=', kind: 'equals' },
  ],
];

/**
 * Safely evaluates a simple inline arithmetic expression containing +, -, digits, and decimals.
 */
export function evaluateArithmeticExpression(expr: string): number {
  const sanitized = (expr || '').replace(/\s+/g, '').replace(/[+\-.]+$/, '');
  if (!sanitized) return 0;

  const tokens = sanitized.match(/[+-]?[^+-]+/g);
  if (!tokens) return 0;

  let total = 0;
  for (const token of tokens) {
    const parsed = parseFloat(token);
    if (Number.isFinite(parsed)) {
      total += parsed;
    }
  }

  const rounded = Math.round(total * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatNumericExpression(num: number): string {
  if (!Number.isFinite(num) || num === 0) return '0';
  const rounded = Math.round(num * 100) / 100;
  return String(rounded);
}

function triggerLightHaptic(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function CalculatorKeypad({
  expression,
  onExpressionChange,
  onEvaluate,
  accentColor,
  disabled = false,
}: CalculatorKeypadProps) {
  const { colors, isDark } = useAppTheme();
  const equalsBg = accentColor || colors.primary;

  const handleKeyPress = useCallback(
    (key: string) => {
      if (disabled) return;
      triggerLightHaptic();

      const current = expression && expression.length > 0 ? expression : '0';

      if (key === 'AC') {
        console.log('[CalculatorKeypad/handleKeyPress] Clear - Reset expression to 0');
        onExpressionChange('0', 0);
        return;
      }

      if (key === 'BACKSPACE') {
        const next = current.length <= 1 ? '0' : current.slice(0, -1);
        const finalExpr = next === '-' || next === '+' || next === '' ? '0' : next;
        onExpressionChange(finalExpr, evaluateArithmeticExpression(finalExpr));
        return;
      }

      if (key === '=') {
        const evaluated = evaluateArithmeticExpression(current);
        const formatted = formatNumericExpression(Math.max(0, evaluated));
        console.log(
          `[CalculatorKeypad/evaluate] Compute - Expr:${current} -> Value:${evaluated}`,
        );
        onExpressionChange(formatted, evaluated);
        onEvaluate?.(evaluated);
        return;
      }

      if (key === '+' || key === '-') {
        const lastChar = current[current.length - 1];
        if (lastChar === '+' || lastChar === '-') {
          const replaced = `${current.slice(0, -1)}${key}`;
          onExpressionChange(replaced, evaluateArithmeticExpression(replaced));
          return;
        }
        const cleaned = lastChar === '.' ? current.slice(0, -1) : current;
        const next = `${cleaned}${key}`;
        onExpressionChange(next, evaluateArithmeticExpression(next));
        return;
      }

      if (key === '.') {
        const lastOpIdx = Math.max(current.lastIndexOf('+'), current.lastIndexOf('-'));
        const activeSegment = current.slice(lastOpIdx + 1);
        if (activeSegment.includes('.')) return;

        const next =
          activeSegment === '' ? `${current}0.` : `${current}.`;
        onExpressionChange(next, evaluateArithmeticExpression(next));
        return;
      }

      // Digits 0-9
      const lastOpIdx = Math.max(current.lastIndexOf('+'), current.lastIndexOf('-'));
      const activeSegment = current.slice(lastOpIdx + 1);

      let next = current;
      if (activeSegment === '0') {
        next = `${current.slice(0, lastOpIdx + 1)}${key}`;
      } else {
        if (activeSegment.includes('.')) {
          const [, decimals = ''] = activeSegment.split('.');
          if (decimals.length >= 2) return;
        } else if (activeSegment.length >= 10) {
          return;
        }
        next = `${current}${key}`;
      }

      onExpressionChange(next, evaluateArithmeticExpression(next));
    },
    [disabled, expression, onEvaluate, onExpressionChange],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {KEY_ROWS.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((item) => {
            const isEquals = item.kind === 'equals';
            const isOperator = item.kind === 'operator';
            const isAction = item.kind === 'action';

            const bg = isEquals
              ? equalsBg
              : isOperator
                ? colors.primaryLight
                : isAction
                  ? isDark
                    ? colors.surfaceElevated
                    : '#E2E8F0'
                  : isDark
                    ? colors.card
                    : '#F8FAFC';

            const textColor = isEquals
              ? '#FFFFFF'
              : isOperator
                ? colors.primary
                : item.value === 'AC'
                  ? colors.expense
                  : colors.text;

            return (
              <Pressable
                key={item.value}
                disabled={disabled}
                onPress={() => handleKeyPress(item.value)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                style={({ pressed }) => [
                  styles.keyButton,
                  {
                    backgroundColor: bg,
                    borderColor: isEquals ? equalsBg : colors.border,
                    opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                ]}
              >
                {item.value === 'BACKSPACE' ? (
                  <Delete size={20} color={colors.textSecondary} strokeWidth={2.2} />
                ) : (
                  <Text
                    style={[
                      styles.keyText,
                      {
                        color: textColor,
                        fontWeight: isEquals || isOperator ? '700' : '600',
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  keyButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },
});
