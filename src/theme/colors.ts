export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
  income: string;
  incomeBg: string;
  expense: string;
  expenseBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  border: string;
  divider: string;
  tabBarBg: string;
  tabBarBorder: string;
  heroGradientStart: string;
  heroGradientEnd: string;
  chipBg: string;
  chipText: string;
  inputBg: string;
  shadow: string;
}

export const LIGHT_COLORS: ThemeColors = {
  background: '#F4F7F6',
  surface: '#FFFFFF',
  surfaceElevated: '#F8FAFC',
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  primary: '#0F766E',
  primaryLight: '#CCFBF1',
  primaryDark: '#115E59',
  accent: '#14B8A6',
  income: '#059669',
  incomeBg: '#ECFDF5',
  expense: '#E11D48',
  expenseBg: '#FFF1F2',
  warning: '#D97706',
  warningBg: '#FFFBEB',
  danger: '#DC2626',
  border: '#E2E8F0',
  divider: '#F1F5F9',
  tabBarBg: 'rgba(255, 255, 255, 0.94)',
  tabBarBorder: '#E2E8F0',
  heroGradientStart: '#064E3B',
  heroGradientEnd: '#0F172A',
  chipBg: '#F1F5F9',
  chipText: '#334155',
  inputBg: '#F8FAFC',
  shadow: '#0F172A',
};

export const DARK_COLORS: ThemeColors = {
  background: '#090D16',
  surface: '#111827',
  surfaceElevated: '#1E293B',
  card: '#131C2E',
  cardBorder: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#64748B',
  primary: '#14B8A6',
  primaryLight: '#134E4A',
  primaryDark: '#0D9488',
  accent: '#2DD4BF',
  income: '#34D399',
  incomeBg: 'rgba(16, 185, 129, 0.14)',
  expense: '#FB7185',
  expenseBg: 'rgba(244, 63, 94, 0.14)',
  warning: '#FBBF24',
  warningBg: 'rgba(245, 158, 11, 0.14)',
  danger: '#F87171',
  border: '#1E293B',
  divider: '#1E293B',
  tabBarBg: 'rgba(17, 24, 39, 0.94)',
  tabBarBorder: '#1E293B',
  heroGradientStart: '#065F46',
  heroGradientEnd: '#020617',
  chipBg: '#1E293B',
  chipText: '#E2E8F0',
  inputBg: '#0F172A',
  shadow: '#000000',
};

export interface CategoryMeta {
  color: string;
  bgColor: string;
  icon: string;
  label: string;
}

const CATEGORY_META_MAP: Record<string, CategoryMeta> = {
  '食': { color: '#F97316', bgColor: 'rgba(249, 115, 22, 0.14)', icon: 'Utensils', label: '食' },
  '衣': { color: '#EC4899', bgColor: 'rgba(236, 72, 153, 0.14)', icon: 'Shirt', label: '衣' },
  '住': { color: '#6366F1', bgColor: 'rgba(99, 102, 241, 0.14)', icon: 'Home', label: '住' },
  '行': { color: '#0EA5E9', bgColor: 'rgba(14, 165, 233, 0.14)', icon: 'TrainFront', label: '行' },
  '育樂': { color: '#8B5CF6', bgColor: 'rgba(139, 92, 246, 0.14)', icon: 'Gamepad2', label: '育樂' },
  '學習費用': { color: '#3B82F6', bgColor: 'rgba(59, 130, 246, 0.14)', icon: 'GraduationCap', label: '學習費用' },
  '醫療/雜項': { color: '#F43F5E', bgColor: 'rgba(244, 63, 94, 0.14)', icon: 'HeartPulse', label: '醫療/雜項' },
  '收入': { color: '#10B981', bgColor: 'rgba(16, 185, 129, 0.14)', icon: 'Wallet', label: '收入' },
  '投資': { color: '#0F766E', bgColor: 'rgba(15, 118, 110, 0.14)', icon: 'TrendingUp', label: '投資' },
  '初始資產': { color: '#64748B', bgColor: 'rgba(100, 116, 139, 0.14)', icon: 'Landmark', label: '初始資產' },
  '代墊款': { color: '#F59E0B', bgColor: 'rgba(245, 158, 11, 0.14)', icon: 'HandCoins', label: '代墊款' },
  '代墊回收': { color: '#14B8A6', bgColor: 'rgba(20, 184, 166, 0.14)', icon: 'RotateCcw', label: '代墊回收' },
  '內部轉帳': { color: '#94A3B8', bgColor: 'rgba(148, 163, 184, 0.14)', icon: 'ArrowLeftRight', label: '內部轉帳' },
};

const FALLBACK_PALETTE = [
  '#0F766E',
  '#0284C7',
  '#7C3AED',
  '#DB2777',
  '#D97706',
  '#059669',
  '#4F46E5',
];

function hashColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

export function getCategoryMeta(category: string): CategoryMeta {
  const key = (category || '').trim();
  if (CATEGORY_META_MAP[key]) {
    return CATEGORY_META_MAP[key];
  }
  const color = hashColor(key || 'other');
  return {
    color,
    bgColor: `${color}22`,
    icon: 'Tag',
    label: key || '未分類',
  };
}

export interface AccountMeta {
  color: string;
  bgColor: string;
  icon: string;
  shortLabel: string;
}

const ACCOUNT_META_MAP: Record<string, AccountMeta> = {
  '現金': { color: '#10B981', bgColor: 'rgba(16, 185, 129, 0.15)', icon: 'Banknote', shortLabel: '現金' },
  'LINE Pay': { color: '#06C755', bgColor: 'rgba(6, 199, 85, 0.15)', icon: 'Smartphone', shortLabel: 'LP' },
  'LINE Bank': { color: '#00B900', bgColor: 'rgba(0, 185, 0, 0.15)', icon: 'Building2', shortLabel: 'LB' },
  '郵局': { color: '#15803D', bgColor: 'rgba(21, 128, 61, 0.15)', icon: 'Landmark', shortLabel: '郵局' },
  '永豐銀行': { color: '#DC2626', bgColor: 'rgba(220, 38, 38, 0.15)', icon: 'Landmark', shortLabel: '永豐' },
  '國泰世華': { color: '#16A34A', bgColor: 'rgba(22, 163, 74, 0.15)', icon: 'CreditCard', shortLabel: '國泰' },
  '玉山銀行': { color: '#0D9488', bgColor: 'rgba(13, 148, 136, 0.15)', icon: 'CreditCard', shortLabel: '玉山' },
  '悠遊卡': { color: '#0284C7', bgColor: 'rgba(2, 132, 199, 0.15)', icon: 'Ticket', shortLabel: '悠遊' },
  '街口支付': { color: '#E11D48', bgColor: 'rgba(225, 29, 72, 0.15)', icon: 'Zap', shortLabel: '街口' },
  '台新Richart': { color: '#BE123C', bgColor: 'rgba(190, 18, 60, 0.15)', icon: 'Wallet', shortLabel: 'Richart' },
};

export function getAccountMeta(account: string): AccountMeta {
  const key = (account || '').trim();
  if (ACCOUNT_META_MAP[key]) {
    return ACCOUNT_META_MAP[key];
  }
  const color = hashColor(key || 'account');
  return {
    color,
    bgColor: `${color}22`,
    icon: 'Wallet',
    shortLabel: key.slice(0, 4) || '帳戶',
  };
}
