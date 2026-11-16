import React from 'react';
import {
  ArrowLeftRight,
  Banknote,
  Building2,
  CreditCard,
  Gamepad2,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  RotateCcw,
  Shirt,
  Smartphone,
  Tag,
  Ticket,
  TrainFront,
  TrendingUp,
  Utensils,
  Wallet,
  Zap,
} from 'lucide-react-native';

interface LedgerIconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const ICON_MAP = {
  Utensils,
  Shirt,
  Home,
  TrainFront,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  Wallet,
  TrendingUp,
  Landmark,
  HandCoins,
  RotateCcw,
  ArrowLeftRight,
  Tag,
  Banknote,
  Smartphone,
  Building2,
  CreditCard,
  Ticket,
  Zap,
} as const;

export const ACCOUNT_ICON_OPTIONS: readonly {
  name: keyof typeof ICON_MAP;
  label: string;
}[] = [
  { name: 'Wallet', label: '錢包' },
  { name: 'Landmark', label: '銀行' },
  { name: 'CreditCard', label: '信用卡' },
  { name: 'Banknote', label: '現金' },
  { name: 'Smartphone', label: '行動支付' },
  { name: 'Building2', label: '機構' },
  { name: 'Ticket', label: '票券' },
  { name: 'Zap', label: '快速' },
  { name: 'TrendingUp', label: '投資' },
  { name: 'HandCoins', label: '儲蓄' },
  { name: 'Home', label: '家用' },
  { name: 'Tag', label: '其他' },
];

export function LedgerIcon({
  name,
  size = 18,
  color = '#0F766E',
  strokeWidth = 2,
}: LedgerIconProps) {
  const IconComponent = ICON_MAP[name as keyof typeof ICON_MAP] ?? Tag;
  return <IconComponent size={size} color={color} strokeWidth={strokeWidth} />;
}
