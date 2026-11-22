export type ThemeMode = 'light' | 'dark' | 'system';

export const HUD_RADIUS = 8;
export const HUD_RADIUS_LG = 10;
export const HUD_RETICLE_SIZE = 9;
export const HUD_RETICLE_WIDTH = 2;

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
  primaryBg: string;
  primaryGlow: string;
  onPrimary: string;
  accent: string;
  accentBg: string;
  accentGlow: string;
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
  heroGradientMid: string;
  heroGradientEnd: string;
  gridLine: string;
  chipBg: string;
  chipText: string;
  inputBg: string;
  shadow: string;
}

export const LIGHT_COLORS: ThemeColors = {
  background: '#E8F0FA',
  surface: 'rgba(255, 255, 255, 0.68)',
  surfaceElevated: 'rgba(248, 250, 252, 0.64)',
  card: 'rgba(255, 255, 255, 0.72)',
  cardBorder: '#CBD5E1',
  text: '#090D16',
  textSecondary: '#334155',
  textMuted: '#64748B',
  primary: '#0098B3',
  primaryLight: 'rgba(0, 152, 179, 0.12)',
  primaryDark: '#007A90',
  primaryBg: 'rgba(0, 152, 179, 0.10)',
  primaryGlow: 'rgba(0, 152, 179, 0.18)',
  onPrimary: '#FFFFFF',
  accent: '#6D28D9',
  accentBg: 'rgba(109, 40, 217, 0.10)',
  accentGlow: 'rgba(109, 40, 217, 0.18)',
  income: '#00A86B',
  incomeBg: 'rgba(0, 168, 107, 0.10)',
  expense: '#E11D48',
  expenseBg: 'rgba(225, 29, 72, 0.10)',
  warning: '#D97706',
  warningBg: 'rgba(217, 119, 6, 0.12)',
  danger: '#DC2626',
  border: '#CBD5E1',
  divider: '#E2E8F0',
  tabBarBg: 'rgba(255, 255, 255, 0.82)',
  tabBarBorder: 'rgba(0, 152, 179, 0.40)',
  heroGradientStart: '#0A2540',
  heroGradientMid: '#1E1B4B',
  heroGradientEnd: '#090D16',
  gridLine: 'rgba(0, 240, 255, 0.11)',
  chipBg: 'rgba(226, 232, 240, 0.66)',
  chipText: '#1E293B',
  inputBg: 'rgba(248, 250, 252, 0.66)',
  shadow: '#090D16',
};

export const DARK_COLORS: ThemeColors = {
  background: '#040711',
  surface: 'rgba(10, 15, 30, 0.64)',
  surfaceElevated: 'rgba(17, 25, 46, 0.58)',
  card: 'rgba(13, 20, 37, 0.66)',
  cardBorder: '#1A2744',
  text: '#F0F9FF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  primary: '#00F0FF',
  primaryLight: 'rgba(0, 240, 255, 0.16)',
  primaryDark: '#00B8D4',
  primaryBg: 'rgba(0, 240, 255, 0.12)',
  primaryGlow: 'rgba(0, 240, 255, 0.28)',
  onPrimary: '#050811',
  accent: '#8B5CF6',
  accentBg: 'rgba(139, 92, 246, 0.14)',
  accentGlow: 'rgba(139, 92, 246, 0.30)',
  income: '#00F59B',
  incomeBg: 'rgba(0, 245, 155, 0.12)',
  expense: '#FF2A85',
  expenseBg: 'rgba(255, 42, 133, 0.12)',
  warning: '#FFB800',
  warningBg: 'rgba(255, 184, 0, 0.14)',
  danger: '#FF3366',
  border: '#1A2744',
  divider: '#152038',
  tabBarBg: 'rgba(10, 15, 30, 0.78)',
  tabBarBorder: 'rgba(0, 240, 255, 0.45)',
  heroGradientStart: '#07192F',
  heroGradientMid: '#101336',
  heroGradientEnd: '#040710',
  gridLine: 'rgba(0, 240, 255, 0.08)',
  chipBg: 'rgba(17, 25, 46, 0.62)',
  chipText: '#CBD5E1',
  inputBg: 'rgba(7, 12, 24, 0.62)',
  shadow: '#000000',
};

export interface CategoryMeta {
  color: string;
  bgColor: string;
  icon: string;
  label: string;
}

const CATEGORY_META_MAP: Record<string, CategoryMeta> = {
  '食': { color: '#FF7A00', bgColor: 'rgba(255, 122, 0, 0.14)', icon: 'Utensils', label: '食' },
  '衣': { color: '#FF2A85', bgColor: 'rgba(255, 42, 133, 0.14)', icon: 'Shirt', label: '衣' },
  '住': { color: '#6366F1', bgColor: 'rgba(99, 102, 241, 0.16)', icon: 'Home', label: '住' },
  '行': { color: '#00D2FF', bgColor: 'rgba(0, 210, 255, 0.14)', icon: 'TrainFront', label: '行' },
  '育樂': { color: '#A855F7', bgColor: 'rgba(168, 85, 247, 0.16)', icon: 'Gamepad2', label: '育樂' },
  '學習費用': { color: '#38BDF8', bgColor: 'rgba(56, 189, 248, 0.14)', icon: 'GraduationCap', label: '學習費用' },
  '醫療/雜項': { color: '#FF3366', bgColor: 'rgba(255, 51, 102, 0.14)', icon: 'HeartPulse', label: '醫療/雜項' },
  '收入': { color: '#00F59B', bgColor: 'rgba(0, 245, 155, 0.14)', icon: 'Wallet', label: '收入' },
  '投資': { color: '#00E5FF', bgColor: 'rgba(0, 229, 255, 0.14)', icon: 'TrendingUp', label: '投資' },
  '初始資產': { color: '#94A3B8', bgColor: 'rgba(148, 163, 184, 0.16)', icon: 'Landmark', label: '初始資產' },
  '代墊款': { color: '#FFB800', bgColor: 'rgba(255, 184, 0, 0.16)', icon: 'HandCoins', label: '代墊款' },
  '代墊回收': { color: '#2DD4BF', bgColor: 'rgba(45, 212, 191, 0.14)', icon: 'RotateCcw', label: '代墊回收' },
  '內部轉帳': { color: '#7DD3FC', bgColor: 'rgba(125, 211, 252, 0.14)', icon: 'ArrowLeftRight', label: '內部轉帳' },
};

const FALLBACK_PALETTE = [
  '#00D2FF',
  '#FF7A00',
  '#A855F7',
  '#00F59B',
  '#FF2A85',
  '#FFB800',
  '#38BDF8',
  '#818CF8',
  '#FF3366',
  '#2DD4BF',
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
  '現金': { color: '#00F59B', bgColor: 'rgba(0, 245, 155, 0.16)', icon: 'Banknote', shortLabel: '現金' },
  'LINE Pay': { color: '#00E5FF', bgColor: 'rgba(0, 229, 255, 0.16)', icon: 'Smartphone', shortLabel: 'LP' },
  'LINE Bank': { color: '#38BDF8', bgColor: 'rgba(56, 189, 248, 0.16)', icon: 'Building2', shortLabel: 'LB' },
  '郵局': { color: '#2DD4BF', bgColor: 'rgba(45, 212, 191, 0.16)', icon: 'Landmark', shortLabel: '郵局' },
  '永豐銀行': { color: '#FF3366', bgColor: 'rgba(255, 51, 102, 0.16)', icon: 'Landmark', shortLabel: '永豐' },
  '國泰世華': { color: '#FFB800', bgColor: 'rgba(255, 184, 0, 0.16)', icon: 'CreditCard', shortLabel: '國泰' },
  '玉山銀行': { color: '#A855F7', bgColor: 'rgba(168, 85, 247, 0.16)', icon: 'CreditCard', shortLabel: '玉山' },
  '悠遊卡': { color: '#818CF8', bgColor: 'rgba(129, 140, 248, 0.16)', icon: 'Ticket', shortLabel: '悠遊' },
  '街口支付': { color: '#FF7A00', bgColor: 'rgba(255, 122, 0, 0.16)', icon: 'Zap', shortLabel: '街口' },
  '台新Richart': { color: '#FF2A85', bgColor: 'rgba(255, 42, 133, 0.16)', icon: 'Wallet', shortLabel: 'Richart' },
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
