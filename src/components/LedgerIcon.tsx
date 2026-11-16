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

export function LedgerIcon({
  name,
  size = 18,
  color = '#0F766E',
  strokeWidth = 2,
}: LedgerIconProps) {
  const IconComponent = ICON_MAP[name as keyof typeof ICON_MAP] ?? Tag;
  return <IconComponent size={size} color={color} strokeWidth={strokeWidth} />;
}
