import { Delete } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HUD_RADIUS } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { MONO_FONT } from './ui/HudReticle';
import { SpringPressable } from './ui/SpringPressable';

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

const MAX_EXPRESSION_LENGTH = 40;
const VALID_NUMBER_TOKEN_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function findLastOperatorIndex(expr: string): number {
  for (let i = expr.length - 1; i > 0; i -= 1) {
    const ch = expr[i];
    if ((ch === '+' || ch === '-') && expr[i - 1] !== 'e' && expr[i - 1] !== 'E') {
      return i;
    }
  }
  return -1;
}

/**
 * Safely evaluates a simple inline arithmetic expression containing +, -, digits, and decimals.
 * Preserves scientific notation tokens (e.g. 1e+21, 1e-7) without splitting on the exponent sign.
 */
export function evaluateArithmeticExpression(expr: string): number {
  const sanitized = (expr || '').replace(/\s+/g, '').replace(/[+\-.eE]+$/, '');
  if (!sanitized) return 0;

  const tokens: string[] = [];
  let tokenStart = 0;
  for (let i = 1; i < sanitized.length; i += 1) {
    const ch = sanitized[i];
    if ((ch === '+' || ch === '-') && sanitized[i - 1] !== 'e' && sanitized[i - 1] !== 'E') {
      tokens.push(sanitized.slice(tokenStart, i));
      tokenStart = i;
    }
  }
  tokens.push(sanitized.slice(tokenStart));

  let total = 0;
  for (const token of tokens) {
    if (!VALID_NUMBER_TOKEN_RE.test(token)) continue;
    const parsed = Number(token);
    if (Number.isFinite(parsed)) {
      total += parsed;
    }
  }

  if (!Number.isFinite(total)) return 0;
  if (Math.abs(total) >= 1e12) {
    return Object.is(total, -0) ? 0 : total;
  }
  const rounded = Math.round(total * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatNumericExpression(num: number, maxDecimals: number = 2): string {
  if (!Number.isFinite(num) || Math.abs(num) < 1e-9) return '0';
  const factor = Math.pow(10, maxDecimals);
  const rounded = Math.abs(num) < 1e12 ? Math.round(num * factor) / factor : num;
  if (!Number.isFinite(rounded) || Math.abs(rounded) < 1e-9) return '0';
  if (Math.abs(rounded) >= 1e15) {
    return rounded.toLocaleString('en-US', {
      useGrouping: false,
      maximumFractionDigits: 0,
    });
  }
  return rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

export function CalculatorKeypad({
  expression,
  onExpressionChange,
  onEvaluate,
  accentColor,
  disabled = false,
}: CalculatorKeypadProps) {
  const { colors } = useAppTheme();
  const equalsBg = accentColor || colors.primary;

  const handleKeyPress = useCallback(
    (key: string) => {
      if (disabled) return;

      const current = expression && expression.length > 0 ? expression : '0';

      if (key === 'AC') {
        console.log('[CalculatorKeypad/handleKeyPress] Clear - Reset expression to 0');
        onExpressionChange('0', 0);
        return;
      }

      if (key === 'BACKSPACE') {
        let next = current.length <= 1 ? '0' : current.slice(0, -1);
        next = next.replace(/[eE][+-]?$/, '');
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
          if (current.length > 1 && (current[current.length - 2] === 'e' || current[current.length - 2] === 'E')) {
            return;
          }
          const replaced = `${current.slice(0, -1)}${key}`;
          onExpressionChange(replaced, evaluateArithmeticExpression(replaced));
          return;
        }
        const cleaned = lastChar === '.' ? current.slice(0, -1) : current;
        if (cleaned.length >= MAX_EXPRESSION_LENGTH) return;
        const next = `${cleaned}${key}`;
        onExpressionChange(next, evaluateArithmeticExpression(next));
        return;
      }

      if (key === '.') {
        const lastOpIdx = findLastOperatorIndex(current);
        const activeSegment = current.slice(lastOpIdx + 1);
        if (activeSegment.includes('.') || /[eE]/.test(activeSegment)) return;

        const appendStr = activeSegment === '' ? '0.' : '.';
        if (current.length + appendStr.length > MAX_EXPRESSION_LENGTH) return;
        const next = `${current}${appendStr}`;
        onExpressionChange(next, evaluateArithmeticExpression(next));
        return;
      }

      // Digits 0-9
      const lastOpIdx = findLastOperatorIndex(current);
      const activeSegment = current.slice(lastOpIdx + 1);

      let next = current;
      if (/[eE]/.test(activeSegment)) {
        return;
      } else if (activeSegment === '0') {
        next = `${current.slice(0, lastOpIdx + 1)}${key}`;
      } else {
        if (current.length >= MAX_EXPRESSION_LENGTH) return;
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
                ? colors.accentBg
                : isAction
                  ? colors.surfaceElevated
                  : colors.card;

            const borderColor = isEquals
              ? equalsBg
              : isOperator
                ? colors.accent
                : colors.cardBorder;

            const textColor = isEquals
              ? equalsBg === colors.primary
                ? colors.onPrimary
                : '#FFFFFF'
              : isOperator
                ? colors.accent
                : item.value === 'AC'
                  ? colors.expense
                  : colors.text;

            return (
              <SpringPressable
                key={item.value}
                disabled={disabled}
                pressedScale={0.91}
                haptic="selection"
                onPress={() => handleKeyPress(item.value)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                style={[
                  styles.keyButton,
                  {
                    backgroundColor: bg,
                    borderColor,
                    opacity: disabled ? 0.5 : 1,
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
              </SpringPressable>
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
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 20,
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
});
