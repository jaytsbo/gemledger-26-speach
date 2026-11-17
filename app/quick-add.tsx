import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCheck,
  CheckCircle2,
  Image as ImageIcon,
  Layers,
  Mic,
  Send,
  Sparkles,
  X,
  Zap,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AIDraftCard } from '../src/components/AIDraftCard';
import {
  CalculatorKeypad,
  evaluateArithmeticExpression,
} from '../src/components/CalculatorKeypad';
import { ApiService } from '../src/services/apiService';
import {
  cancelRecording,
  startRecording,
  stopRecording,
} from '../src/services/voiceRecorder';
import { useLedgerStore } from '../src/store/useLedgerStore';
import { getAccountMeta, getCategoryMeta } from '../src/theme/colors';
import { useAppTheme } from '../src/theme/ThemeContext';
import {
  AIParsedDraft,
  CurrencyCode,
  SUPPORTED_CURRENCIES,
  TransactionInput,
} from '../src/types/ledger';
import {
  CURRENCY_LABELS,
  convertCurrency,
  formatMoney,
  getCurrencySymbol,
} from '../src/utils/currency';

type ModalMode = 'manual' | 'ai';

interface AttachedImage {
  uri: string;
  base64: string;
  mimeType: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageUri?: string;
  audioDurationSec?: number;
  drafts?: AIParsedDraft[];
  savedIndices?: number[];
  isFallback?: boolean;
  fallbackReason?: string;
  modelUsed?: string;
}

const MAX_VOICE_SECONDS = 60;

function formatDuration(totalSec: number): string {
  const safeSec = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safeSec / 60);
  const secs = safeSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

const QUICK_AI_PROMPTS = [
  '🍜 東京拉麵 1080 JPY 現金',
  '💰 接案收入 35000 元 永豐銀行',
  '☕ 星巴克拿鐵 155 LINE Pay',
  '🚇 捷運通勤 35 悠遊卡',
];

function getNowDateStr(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function getNowTimeStr(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function triggerHapticSuccess(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

function triggerHapticLight(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export default function QuickAddModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string; mode?: string }>();
  const editId = typeof params.editId === 'string' ? params.editId : undefined;
  const initialModeParam = params.mode === 'ai' && !editId ? 'ai' : 'manual';

  const { colors } = useAppTheme();
  const {
    transactions,
    settings,
    exchangeRates,
    baseCurrency,
    initialized,
    initialize,
    addTransaction,
    batchAddTransactions,
    updateTransaction,
    callAI,
  } = useLedgerStore();

  const editingTransaction = useMemo(() => {
    if (!editId) return undefined;
    return transactions.find(
      (tx) => String(tx.id) === editId || String(tx.rowNumber ?? '') === editId,
    );
  }, [editId, transactions]);

  const [activeMode, setActiveMode] = useState<ModalMode>(initialModeParam);

  // Mode 1: Manual / Quick-Add state
  const [isExpense, setIsExpense] = useState(true);
  const [expression, setExpression] = useState('0');
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency || 'TWD');
  const [category, setCategory] = useState<string>(settings.categories[0] || '食');
  const [account, setAccount] = useState<string>(settings.accounts[0] || '現金');
  const [itemName, setItemName] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(getNowDateStr);
  const [time, setTime] = useState(getNowTimeStr);
  const [continuousMode, setContinuousMode] = useState(false);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const didHydrateEditRef = useRef<string | null>(null);

  // Mode 2: AI Bookkeeping state
  const [aiInput, setAiInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [submittingDraftKeys, setSubmittingDraftKeys] = useState<Record<string, boolean>>({});
  const [batchSubmittingMsgId, setBatchSubmittingMsgId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '您好！我是 Gemini 3.5 AI 智慧記帳助理。\n直接輸入消費描述、點選範例，或上傳收據照片，解析後即可微調並一鍵寫入帳本！',
    },
  ]);

  const isRecordingRef = useRef(false);
  const isStoppingVoiceRef = useRef(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnims = useRef([
    new Animated.Value(0.4),
    new Animated.Value(0.8),
    new Animated.Value(0.5),
    new Animated.Value(0.9),
  ]).current;

  const chatScrollRef = useRef<ScrollView | null>(null);
  const manualScrollRef = useRef<ScrollView | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTextInputFocused, setIsTextInputFocused] = useState(false);
  const [isSystemKeyboardOpen, setIsSystemKeyboardOpen] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsSystemKeyboardOpen(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsSystemKeyboardOpen(false));

    let cleanupVisualViewport: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.visualViewport) {
      const vv = window.visualViewport;
      const baseHeight = window.innerHeight;
      const onResize = () => {
        const diff = baseHeight - vv.height;
        setIsSystemKeyboardOpen(diff > 120);
      };
      vv.addEventListener('resize', onResize);
      cleanupVisualViewport = () => vv.removeEventListener('resize', onResize);
    }

    return () => {
      showSub.remove();
      hideSub.remove();
      cleanupVisualViewport?.();
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const handleManualInputFocus = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setIsTextInputFocused(true);
    setTimeout(() => {
      manualScrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
  }, []);

  const handleManualInputBlur = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      setIsTextInputFocused(false);
    }, 80);
  }, []);

  const handleDismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
    setIsTextInputFocused(false);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null;
      active?.blur?.();
    }
  }, []);

  const hideCalculatorKeypad = isTextInputFocused || isSystemKeyboardOpen;

  useEffect(() => {
    if (!initialized) {
      initialize();
    }
  }, [initialize, initialized]);

  // Hydrate form when editing an existing transaction
  useEffect(() => {
    if (!editId || !editingTransaction) return;
    if (didHydrateEditRef.current === editId) return;

    didHydrateEditRef.current = editId;
    const absAmt = Math.abs(Number(editingTransaction.amount) || 0);
    setActiveMode('manual');
    setIsExpense(editingTransaction.amount <= 0);
    setExpression(absAmt > 0 ? String(absAmt) : '0');
    setCurrency((editingTransaction.currency || baseCurrency) as CurrencyCode);
    setCategory(editingTransaction.category || settings.categories[0] || '食');
    setAccount(editingTransaction.account || settings.accounts[0] || '現金');
    setItemName(editingTransaction.name || '');
    setNote(editingTransaction.note || '');
    setDate(editingTransaction.date || getNowDateStr());
    setTime(editingTransaction.time || getNowTimeStr());
    console.log(
      `[QuickAdd/hydrateEdit] Loaded - ID:${editId}, Name:${editingTransaction.name}, Amt:${editingTransaction.amount}`,
    );
  }, [baseCurrency, editId, editingTransaction, settings.accounts, settings.categories]);

  const closeModal = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);

  const evaluatedAmount = useMemo(
    () => Math.max(0, evaluateArithmeticExpression(expression)),
    [expression],
  );

  const hasArithmeticOperator = useMemo(
    () => /[+-]/.test(expression.slice(1)),
    [expression],
  );

  const convertedBaseAmount = useMemo(
    () => convertCurrency(evaluatedAmount, currency, baseCurrency, exchangeRates),
    [baseCurrency, currency, evaluatedAmount, exchangeRates],
  );

  const handleExpressionChange = useCallback((nextExpr: string) => {
    setExpression(nextExpr);
    setErrorBanner(null);
  }, []);

  const handleSaveManual = async () => {
    if (isSubmittingManual) return;

    const finalAmount = Math.max(0, evaluateArithmeticExpression(expression));
    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      setErrorBanner('請輸入大於 0 的有效金額');
      return;
    }

    const signedAmount = isExpense ? -finalAmount : finalAmount;
    const cleanName = itemName.trim() || category || (isExpense ? '一般支出' : '一般收入');

    const payload: TransactionInput = {
      date: date.trim() || getNowDateStr(),
      time: time.trim() || getNowTimeStr(),
      account,
      name: cleanName,
      category,
      currency,
      amount: signedAmount,
      note: note.trim(),
    };

    setIsSubmittingManual(true);
    setErrorBanner(null);
    setFeedbackBanner(null);

    try {
      if (editingTransaction) {
        const targetId = editingTransaction.id ?? editingTransaction.rowNumber!;
        console.log(
          `[QuickAdd/handleSaveManual] Update - Target:${targetId}, Name:${payload.name}, Amt:${payload.amount}`,
        );
        await updateTransaction(targetId, payload);
        triggerHapticSuccess();
        closeModal();
        return;
      }

      console.log(
        `[QuickAdd/handleSaveManual] Create - Name:${payload.name}, Amt:${payload.amount} ${payload.currency}, Continuous:${continuousMode}`,
      );
      await addTransaction(payload);
      triggerHapticSuccess();

      if (continuousMode) {
        setExpression('0');
        setItemName('');
        setNote('');
        setTime(getNowTimeStr());
        setFeedbackBanner(`✓ 已寫入「${cleanName}」${formatMoney(signedAmount, currency)}，請繼續記下一筆`);
      } else {
        closeModal();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '儲存失敗，請稍後再試';
      console.warn('[QuickAdd/handleSaveManual] Error -', msg);
      setErrorBanner(msg);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  // Mode 2: Image picker handlers
  const handlePickImage = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('需要相機權限', '請允許存取相機以拍攝收據或發票。');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          base64: true,
        });
        if (!result.canceled && result.assets[0]?.base64) {
          const asset = result.assets[0];
          setAttachedImage({
            uri: asset.uri,
            base64: asset.base64!,
            mimeType: asset.mimeType || 'image/jpeg',
          });
          console.log('[QuickAdd/handlePickImage] Camera - Image captured');
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('需要相簿權限', '請允許存取相簿以選擇收據照片。');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          base64: true,
        });
        if (!result.canceled && result.assets[0]?.base64) {
          const asset = result.assets[0];
          setAttachedImage({
            uri: asset.uri,
            base64: asset.base64!,
            mimeType: asset.mimeType || 'image/jpeg',
          });
          console.log('[QuickAdd/handlePickImage] Library - Image selected');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '無法讀取圖片';
      console.warn('[QuickAdd/handlePickImage] Error -', msg);
      Alert.alert('圖片選取失敗', msg);
    }
  };

  const scrollToChatBottom = () => {
    setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleSendAI = async (overrideText?: string) => {
    if (isAnalyzingAI) return;
    const rawText = (overrideText ?? aiInput).trim();
    const currentImage = attachedImage;

    if (!rawText && !currentImage) return;

    const promptText = rawText || '請辨識這張收據/發票的消費明細';
    const userMsgId = `user-${Date.now()}`;

    const userBubble: ChatMessage = {
      id: userMsgId,
      role: 'user',
      text: promptText,
      imageUri: currentImage?.uri,
    };

    setMessages((prev) => [...prev, userBubble]);
    if (!overrideText) setAiInput('');
    setAttachedImage(null);
    setIsAnalyzingAI(true);
    triggerHapticLight();
    scrollToChatBottom();

    console.log(
      `[QuickAdd/handleSendAI] Request - TextLen:${promptText.length}, HasImage:${Boolean(currentImage)}`,
    );

    try {
      const res = await callAI(
        promptText,
        currentImage?.base64 ?? null,
        currentImage?.mimeType ?? null,
      );

      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: res.reply || '已為您解析以下明細：',
        drafts: res.parsedTransactions || [],
        savedIndices: [],
        isFallback: res.isFallback,
        fallbackReason: res.fallbackReason,
        modelUsed: res.modelUsed,
      };

      console.log(
        `[QuickAdd/handleSendAI] Response - Drafts:${assistantMsg.drafts?.length ?? 0}, Fallback:${Boolean(res.isFallback)}, Model:${res.modelUsed ?? 'none'}`,
      );

      setMessages((prev) => [...prev, assistantMsg]);
      scrollToChatBottom();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'AI 解析發生錯誤';
      console.warn('[QuickAdd/handleSendAI] Error -', errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `解析失敗：${errMsg}。請稍後重試或改用「極速記帳」。`,
        },
      ]);
      scrollToChatBottom();
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const showVoiceAlert = useCallback((title: string, message: string) => {
    setErrorBanner(message);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`${title}\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }, []);

  const handleFinishVoice = useCallback(async () => {
    if (!isRecordingRef.current || isStoppingVoiceRef.current) return;
    isStoppingVoiceRef.current = true;
    clearRecordingTimer();
    isRecordingRef.current = false;
    setIsRecording(false);

    try {
      const { base64, mimeType, durationSec } = await stopRecording();
      console.log(
        `[QuickAdd/handleFinishVoice] Captured - DurationSec:${durationSec}, MimeType:${mimeType}, Base64Len:${base64.length}`,
      );

      const userBubble: ChatMessage = {
        id: `user-voice-${Date.now()}`,
        role: 'user',
        text: `🎤 語音記帳 (${formatDuration(durationSec)})`,
        audioDurationSec: durationSec,
      };

      setMessages((prev) => [...prev, userBubble]);
      setIsAnalyzingAI(true);
      triggerHapticLight();
      scrollToChatBottom();

      const res = await callAI('', base64, mimeType);
      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: res.reply || '已為您解析以下明細：',
        drafts: res.parsedTransactions || [],
        savedIndices: [],
        isFallback: res.isFallback,
        fallbackReason: res.fallbackReason,
        modelUsed: res.modelUsed,
      };

      console.log(
        `[QuickAdd/handleFinishVoice] Response - Drafts:${assistantMsg.drafts?.length ?? 0}, Fallback:${Boolean(res.isFallback)}, Model:${res.modelUsed ?? 'none'}`,
      );
      setMessages((prev) => [...prev, assistantMsg]);
      scrollToChatBottom();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '語音記帳解析失敗';
      console.warn('[QuickAdd/handleFinishVoice] Error -', errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-voice-${Date.now()}`,
          role: 'assistant',
          text: `語音解析失敗：${errMsg}。請稍後重試或改用「極速記帳」。`,
        },
      ]);
      scrollToChatBottom();
    } finally {
      isStoppingVoiceRef.current = false;
      setIsAnalyzingAI(false);
      setRecordingSeconds(0);
    }
  }, [callAI, clearRecordingTimer]);

  const handleStartVoice = useCallback(async () => {
    if (isAnalyzingAI || isRecordingRef.current || isStartingRecording) return;
    setErrorBanner(null);
    setIsStartingRecording(true);

    try {
      const hasKey = await ApiService.hasGeminiApiKey();
      if (!hasKey) {
        console.log('[QuickAdd/handleStartVoice] Blocked - Missing Gemini API key');
        showVoiceAlert(
          '需要設定 Gemini API Key',
          '語音記帳需要設定 Gemini API Key，請先至「設定 → 進階 AI 設定」填入您的 API Key。',
        );
        return;
      }

      await startRecording();
      isRecordingRef.current = true;
      isStoppingVoiceRef.current = false;
      setIsRecording(true);
      setRecordingSeconds(0);
      triggerHapticLight();

      clearRecordingTimer();
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
      console.log('[QuickAdd/handleStartVoice] Recording started');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '無法啟動麥克風錄音';
      console.warn('[QuickAdd/handleStartVoice] Error -', msg);
      showVoiceAlert('無法開始錄音', msg);
    } finally {
      setIsStartingRecording(false);
    }
  }, [clearRecordingTimer, isAnalyzingAI, isStartingRecording, showVoiceAlert]);

  const handleCancelVoice = useCallback(async () => {
    clearRecordingTimer();
    isRecordingRef.current = false;
    isStoppingVoiceRef.current = false;
    setIsRecording(false);
    setRecordingSeconds(0);
    await cancelRecording().catch(() => {});
    console.log('[QuickAdd/handleCancelVoice] Recording cancelled');
  }, [clearRecordingTimer]);

  useEffect(() => {
    if (isRecording && recordingSeconds >= MAX_VOICE_SECONDS && !isStoppingVoiceRef.current) {
      console.log('[QuickAdd/voiceTimer] AutoStop - Reached 60s limit');
      handleFinishVoice();
    }
  }, [handleFinishVoice, isRecording, recordingSeconds]);

  useEffect(() => {
    if (!isRecording) {
      pulseAnim.setValue(1);
      waveAnims.forEach((anim, idx) => anim.setValue(idx % 2 === 0 ? 0.45 : 0.8));
      return;
    }

    const useNative = Platform.OS !== 'web';
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.25, duration: 550, useNativeDriver: useNative }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 550, useNativeDriver: useNative }),
      ]),
    );
    const waveLoops = waveAnims.map((anim, idx) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 260 + idx * 70,
            useNativeDriver: useNative,
          }),
          Animated.timing(anim, {
            toValue: 0.28,
            duration: 260 + idx * 70,
            useNativeDriver: useNative,
          }),
        ]),
      ),
    );

    pulseLoop.start();
    waveLoops.forEach((loop) => loop.start());

    return () => {
      pulseLoop.stop();
      waveLoops.forEach((loop) => loop.stop());
    };
  }, [isRecording, pulseAnim, waveAnims]);

  useEffect(() => {
    if (activeMode !== 'ai' && isRecordingRef.current) {
      handleCancelVoice();
    }
  }, [activeMode, handleCancelVoice]);

  useEffect(() => {
    return () => {
      clearRecordingTimer();
      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        cancelRecording().catch(() => {});
      }
    };
  }, [clearRecordingTimer]);

  const handleUpdateDraft = (msgId: string, draftIdx: number, updated: AIParsedDraft) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.drafts) return msg;
        const nextDrafts = [...msg.drafts];
        nextDrafts[draftIdx] = updated;
        return { ...msg, drafts: nextDrafts };
      }),
    );
  };

  const handleConfirmSingleDraft = async (
    msgId: string,
    draftIdx: number,
    draft: AIParsedDraft,
  ) => {
    const lockKey = `${msgId}:${draftIdx}`;
    if (submittingDraftKeys[lockKey] || batchSubmittingMsgId === msgId) return;

    setSubmittingDraftKeys((prev) => ({ ...prev, [lockKey]: true }));
    console.log(
      `[QuickAdd/handleConfirmSingleDraft] Write - Key:${lockKey}, Name:${draft.name}, Amt:${draft.amount}`,
    );

    try {
      await addTransaction({
        date: draft.date,
        time: draft.time,
        account: draft.account,
        name: draft.name,
        category: draft.category,
        currency: draft.currency,
        amount: draft.amount,
        note: draft.note,
      });

      triggerHapticSuccess();
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== msgId) return msg;
          const prevSaved = msg.savedIndices || [];
          if (prevSaved.includes(draftIdx)) return msg;
          return { ...msg, savedIndices: [...prevSaved, draftIdx] };
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '寫入失敗';
      console.warn('[QuickAdd/handleConfirmSingleDraft] Error -', msg);
      Alert.alert('寫入失敗', msg);
    } finally {
      setSubmittingDraftKeys((prev) => {
        const next = { ...prev };
        delete next[lockKey];
        return next;
      });
    }
  };

  const handleBatchConfirmMessage = async (msg: ChatMessage) => {
    if (!msg.drafts || msg.drafts.length === 0) return;
    if (batchSubmittingMsgId === msg.id) return;

    const savedSet = new Set(msg.savedIndices || []);
    const pendingEntries = msg.drafts
      .map((draft, idx) => ({ draft, idx }))
      .filter(({ idx }) => !savedSet.has(idx));

    if (pendingEntries.length === 0) return;

    setBatchSubmittingMsgId(msg.id);
    console.log(
      `[QuickAdd/handleBatchConfirmMessage] BatchWrite - Msg:${msg.id}, Count:${pendingEntries.length}`,
    );

    try {
      const inputs: TransactionInput[] = pendingEntries.map(({ draft }) => ({
        date: draft.date,
        time: draft.time,
        account: draft.account,
        name: draft.name,
        category: draft.category,
        currency: draft.currency,
        amount: draft.amount,
        note: draft.note,
      }));

      await batchAddTransactions(inputs);
      triggerHapticSuccess();

      const allIndices = msg.drafts.map((_, idx) => idx);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === msg.id ? { ...item, savedIndices: allIndices } : item,
        ),
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '批次寫入失敗';
      console.warn('[QuickAdd/handleBatchConfirmMessage] Error -', errMsg);
      Alert.alert('批次寫入失敗', errMsg);
    } finally {
      setBatchSubmittingMsgId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top Modal Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <Pressable
            onPress={closeModal}
            accessibilityRole="button"
            accessibilityLabel="關閉"
            style={({ pressed }) => [
              styles.closeBtn,
              { backgroundColor: colors.chipBg, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <X size={20} color={colors.text} />
          </Pressable>

          {editingTransaction || editId ? (
            <View style={[styles.editHeaderBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.editHeaderText, { color: colors.primary }]}>編輯交易明細</Text>
            </View>
          ) : (
            <View style={[styles.segmentedControl, { backgroundColor: colors.chipBg }]}>
              <Pressable
                onPress={() => {
                  triggerHapticLight();
                  setActiveMode('manual');
                }}
                style={[
                  styles.segmentBtn,
                  activeMode === 'manual' && { backgroundColor: colors.surface },
                ]}
              >
                <Zap
                  size={14}
                  color={activeMode === 'manual' ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.segmentText,
                    { color: activeMode === 'manual' ? colors.text : colors.textSecondary },
                  ]}
                >
                  ⚡ 極速記帳
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHapticLight();
                  setActiveMode('ai');
                }}
                style={[
                  styles.segmentBtn,
                  activeMode === 'ai' && { backgroundColor: colors.surface },
                ]}
              >
                <Sparkles
                  size={14}
                  color={activeMode === 'ai' ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.segmentText,
                    { color: activeMode === 'ai' ? colors.text : colors.textSecondary },
                  ]}
                >
                  ✨ AI 智慧記帳
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.headerSpacer} />
        </View>

        {activeMode === 'manual' ? (
          <View style={styles.flex1}>
            <ScrollView
              ref={manualScrollRef}
              style={styles.flex1}
              contentContainerStyle={styles.manualContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Status / Error Feedback */}
              {feedbackBanner ? (
                <View style={[styles.banner, { backgroundColor: colors.incomeBg, borderColor: colors.income }]}>
                  <CheckCircle2 size={16} color={colors.income} />
                  <Text style={[styles.bannerText, { color: colors.income }]}>{feedbackBanner}</Text>
                </View>
              ) : null}

              {errorBanner ? (
                <View style={[styles.banner, { backgroundColor: colors.expenseBg, borderColor: colors.expense }]}>
                  <AlertTriangle size={16} color={colors.expense} />
                  <Text style={[styles.bannerText, { color: colors.expense }]}>{errorBanner}</Text>
                </View>
              ) : null}

              {/* Expense / Income Toggle + Amount Hero */}
              <View style={[styles.amountCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={styles.flowToggleRow}>
                  <Pressable
                    onPress={() => {
                      triggerHapticLight();
                      setIsExpense(true);
                    }}
                    style={[
                      styles.flowBtn,
                      {
                        backgroundColor: isExpense ? colors.expenseBg : colors.inputBg,
                        borderColor: isExpense ? colors.expense : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.flowBtnText,
                        { color: isExpense ? colors.expense : colors.textSecondary },
                      ]}
                    >
                      支出 (−)
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      triggerHapticLight();
                      setIsExpense(false);
                    }}
                    style={[
                      styles.flowBtn,
                      {
                        backgroundColor: !isExpense ? colors.incomeBg : colors.inputBg,
                        borderColor: !isExpense ? colors.income : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.flowBtnText,
                        { color: !isExpense ? colors.income : colors.textSecondary },
                      ]}
                    >
                      收入 (+)
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.amountDisplayRow}>
                  <Text
                    style={[
                      styles.amountCurrencyPrefix,
                      { color: isExpense ? colors.expense : colors.income },
                    ]}
                  >
                    {isExpense ? '−' : '+'} {getCurrencySymbol(currency)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={[
                      styles.amountDisplayText,
                      { color: isExpense ? colors.expense : colors.income },
                    ]}
                  >
                    {expression}
                  </Text>
                </View>

                {hasArithmeticOperator ? (
                  <Text style={[styles.evaluatedPreview, { color: colors.textSecondary }]}>
                    計算結果 = {formatMoney(evaluatedAmount, currency)}
                  </Text>
                ) : null}

                {/* Real-time Converted Base Currency Preview Bar */}
                <View style={[styles.fxPreviewBar, { backgroundColor: colors.surfaceElevated }]}>
                  <Text style={[styles.fxPreviewLabel, { color: colors.textSecondary }]}>
                    {currency === baseCurrency
                      ? `基準幣別 · ${CURRENCY_LABELS[currency] || currency}`
                      : `即時換算 (${baseCurrency})`}
                  </Text>
                  <Text style={[styles.fxPreviewValue, { color: colors.text }]}>
                    {currency === baseCurrency
                      ? formatMoney(evaluatedAmount, baseCurrency)
                      : `≈ ${formatMoney(isExpense ? -convertedBaseAmount : convertedBaseAmount, baseCurrency)}`}
                  </Text>
                </View>
              </View>

              {/* 11-Currency Horizontal Selector */}
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>幣別</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalList}
                >
                  {SUPPORTED_CURRENCIES.map((cur) => {
                    const selected = currency === cur;
                    return (
                      <Pressable
                        key={cur}
                        onPress={() => {
                          triggerHapticLight();
                          setCurrency(cur);
                        }}
                        style={[
                          styles.chipPill,
                          {
                            backgroundColor: selected ? colors.primary : colors.card,
                            borderColor: selected ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipPillText,
                            { color: selected ? '#FFFFFF' : colors.text },
                          ]}
                        >
                          {cur} {getCurrencySymbol(cur)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Category Chips */}
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>分類</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalList}
                >
                  {settings.categories.map((cat) => {
                    const selected = category === cat;
                    const meta = getCategoryMeta(cat);
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => {
                          triggerHapticLight();
                          setCategory(cat);
                        }}
                        style={[
                          styles.chipPill,
                          {
                            backgroundColor: selected ? meta.color : colors.card,
                            borderColor: selected ? meta.color : colors.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.chipDot,
                            { backgroundColor: selected ? '#FFFFFF' : meta.color },
                          ]}
                        />
                        <Text
                          style={[
                            styles.chipPillText,
                            { color: selected ? '#FFFFFF' : colors.text },
                          ]}
                        >
                          {cat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Account Chips */}
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>帳戶</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalList}
                >
                  {settings.accounts.map((acc) => {
                    const selected = account === acc;
                    const meta = getAccountMeta(acc);
                    return (
                      <Pressable
                        key={acc}
                        onPress={() => {
                          triggerHapticLight();
                          setAccount(acc);
                        }}
                        style={[
                          styles.chipPill,
                          {
                            backgroundColor: selected ? meta.color : colors.card,
                            borderColor: selected ? meta.color : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipPillText,
                            { color: selected ? '#FFFFFF' : colors.text },
                          ]}
                        >
                          {acc}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Item Name, Note, Date & Time */}
              <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={styles.formRow}>
                  <View style={styles.flex1}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>品項名稱</Text>
                    <TextInput
                      value={itemName}
                      onChangeText={setItemName}
                      onFocus={handleManualInputFocus}
                      onBlur={handleManualInputBlur}
                      placeholder={`例如：${category}消費`}
                      placeholderTextColor={colors.textMuted}
                      style={[
                        styles.textInput,
                        { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
                      ]}
                    />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>備註</Text>
                    <TextInput
                      value={note}
                      onChangeText={setNote}
                      onFocus={handleManualInputFocus}
                      onBlur={handleManualInputBlur}
                      placeholder="選填備註..."
                      placeholderTextColor={colors.textMuted}
                      style={[
                        styles.textInput,
                        { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.flex1}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>日期</Text>
                    <TextInput
                      value={date}
                      onChangeText={setDate}
                      onFocus={handleManualInputFocus}
                      onBlur={handleManualInputBlur}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.textMuted}
                      style={[
                        styles.textInput,
                        styles.tabularInput,
                        { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
                      ]}
                    />
                  </View>
                  <View style={styles.timeInputWrap}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>時間</Text>
                    <TextInput
                      value={time}
                      onChangeText={setTime}
                      onFocus={handleManualInputFocus}
                      onBlur={handleManualInputBlur}
                      placeholder="HH:mm"
                      placeholderTextColor={colors.textMuted}
                      style={[
                        styles.textInput,
                        styles.tabularInput,
                        { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
                      ]}
                    />
                  </View>
                  <Pressable
                    onPress={() => {
                      setDate(getNowDateStr());
                      setTime(getNowTimeStr());
                    }}
                    style={[
                      styles.nowBtn,
                      { backgroundColor: colors.chipBg, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.nowBtnText, { color: colors.textSecondary }]}>現在</Text>
                  </Pressable>
                </View>

                {!editingTransaction && !editId ? (
                  <View style={[styles.continuousRow, { borderTopColor: colors.divider }]}>
                    <View style={styles.continuousLabelWrap}>
                      <Layers size={15} color={colors.primary} />
                      <View>
                        <Text style={[styles.continuousTitle, { color: colors.text }]}>連續記帳</Text>
                        <Text style={[styles.continuousSub, { color: colors.textMuted }]}>
                          儲存後保持視窗開啟以快速輸入下一筆
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={continuousMode}
                      onValueChange={setContinuousMode}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                ) : null}
              </View>
            </ScrollView>

            {/* Bottom Docked Submit + Calculator Keypad (auto-hides keypad when typing) */}
            <View style={{ backgroundColor: colors.surface }}>
              <View
                style={[
                  styles.submitBar,
                  {
                    borderTopColor: colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  },
                ]}
              >
                {hideCalculatorKeypad ? (
                  <Pressable
                    onPress={handleDismissKeyboard}
                    style={[
                      styles.nowBtn,
                      {
                        height: 48,
                        paddingHorizontal: 12,
                        justifyContent: 'center',
                        backgroundColor: colors.chipBg,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.nowBtnText, { color: colors.textSecondary }]}>
                      計算機
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  disabled={isSubmittingManual}
                  onPress={handleSaveManual}
                  style={({ pressed }) => [
                    styles.submitBtn,
                    {
                      flex: 1,
                      backgroundColor: isExpense ? colors.expense : colors.income,
                      opacity: isSubmittingManual ? 0.65 : pressed ? 0.88 : 1,
                    },
                  ]}
                >
                  {isSubmittingManual ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>
                      {editingTransaction || editId
                        ? '更新這筆交易'
                        : isExpense
                          ? `儲存支出 ${formatMoney(evaluatedAmount, currency)}`
                          : `儲存收入 +${formatMoney(evaluatedAmount, currency)}`}
                    </Text>
                  )}
                </Pressable>
              </View>

              {!hideCalculatorKeypad ? (
                <CalculatorKeypad
                  expression={expression}
                  onExpressionChange={handleExpressionChange}
                  accentColor={isExpense ? colors.expense : colors.income}
                  disabled={isSubmittingManual}
                />
              ) : null}
            </View>
          </View>
        ) : (
          /* Mode 2: AI Smart Bookkeeping */
          <View style={styles.flex1}>
            {/* Quick Example Prompt Chips */}
            <View style={[styles.promptBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.promptScroll}
              >
                {QUICK_AI_PROMPTS.map((prompt) => (
                  <Pressable
                    key={prompt}
                    disabled={isAnalyzingAI}
                    onPress={() => handleSendAI(prompt)}
                    style={({ pressed }) => [
                      styles.promptChip,
                      {
                        backgroundColor: colors.chipBg,
                        borderColor: colors.border,
                        opacity: isAnalyzingAI ? 0.5 : pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.promptChipText, { color: colors.text }]}>{prompt}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Chat Stream */}
            <ScrollView
              ref={chatScrollRef}
              style={styles.flex1}
              contentContainerStyle={styles.chatContent}
              keyboardShouldPersistTaps="handled"
            >
              {errorBanner ? (
                <View style={[styles.banner, { backgroundColor: colors.expenseBg, borderColor: colors.expense }]}>
                  <AlertTriangle size={16} color={colors.expense} />
                  <Text style={[styles.bannerText, { color: colors.expense }]}>{errorBanner}</Text>
                </View>
              ) : null}

              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const savedIndices = msg.savedIndices || [];
                const drafts = msg.drafts || [];
                const unsavedCount = drafts.filter((_, idx) => !savedIndices.includes(idx)).length;
                const isBatchSubmitting = batchSubmittingMsgId === msg.id;
                const displayText =
                  msg.audioDurationSec !== undefined
                    ? `🎤 語音記帳 (${formatDuration(msg.audioDurationSec)})`
                    : msg.text;

                return (
                  <View
                    key={msg.id}
                    style={[styles.msgGroup, isUser ? styles.msgGroupUser : styles.msgGroupAI]}
                  >
                    <View
                      style={[
                        styles.bubble,
                        isUser
                          ? { backgroundColor: colors.primary }
                          : {
                              backgroundColor: colors.card,
                              borderColor: colors.cardBorder,
                              borderWidth: 1,
                            },
                      ]}
                    >
                      {msg.imageUri ? (
                        <Image source={{ uri: msg.imageUri }} style={styles.chatImage} />
                      ) : null}
                      <Text style={[styles.bubbleText, { color: isUser ? '#FFFFFF' : colors.text }]}>
                        {displayText}
                      </Text>
                    </View>

                    {/* Parsed Draft Cards */}
                    {drafts.length > 0 ? (
                      <View style={styles.draftsStack}>
                        {drafts.map((draft, idx) => {
                          const lockKey = `${msg.id}:${idx}`;
                          const isSaved = savedIndices.includes(idx);
                          const isCardSubmitting =
                            Boolean(submittingDraftKeys[lockKey]) || isBatchSubmitting;

                          return (
                            <AIDraftCard
                              key={`${msg.id}-draft-${idx}`}
                              draft={draft}
                              index={idx}
                              baseCurrency={baseCurrency}
                              exchangeRates={exchangeRates}
                              categories={settings.categories}
                              accounts={settings.accounts}
                              isFallback={msg.isFallback}
                              fallbackReason={msg.fallbackReason}
                              modelUsed={msg.modelUsed}
                              isSubmitting={isCardSubmitting}
                              isSaved={isSaved}
                              onUpdateDraft={(updated) => handleUpdateDraft(msg.id, idx, updated)}
                              onConfirm={(confirmedDraft) =>
                                handleConfirmSingleDraft(msg.id, idx, confirmedDraft)
                              }
                            />
                          );
                        })}

                        {unsavedCount > 0 ? (
                          <Pressable
                            disabled={isBatchSubmitting}
                            onPress={() => handleBatchConfirmMessage(msg)}
                            style={({ pressed }) => [
                              styles.batchWriteBtn,
                              {
                                backgroundColor: colors.primaryDark,
                                opacity: isBatchSubmitting ? 0.65 : pressed ? 0.85 : 1,
                              },
                            ]}
                          >
                            {isBatchSubmitting ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <CheckCheck size={17} color="#FFFFFF" />
                            )}
                            <Text style={styles.batchWriteText}>
                              {isBatchSubmitting
                                ? '批次寫入中...'
                                : `一鍵全部寫入 (${unsavedCount} 筆)`}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}

              {isAnalyzingAI ? (
                <View style={[styles.analyzingBubble, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.analyzingText, { color: colors.textSecondary }]}>
                    Gemini AI 正在解析消費明細...
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            {/* Attached Image Preview */}
            {attachedImage ? (
              <View style={[styles.attachmentBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <Image source={{ uri: attachedImage.uri }} style={styles.attachmentThumb} />
                <View style={styles.flex1}>
                  <Text style={[styles.attachmentTitle, { color: colors.text }]}>已附加收據照片</Text>
                  <Text style={[styles.attachmentSub, { color: colors.textMuted }]}>
                    可直接按傳送讓 AI 辨識明細
                  </Text>
                </View>
                <Pressable
                  onPress={() => setAttachedImage(null)}
                  style={[styles.removeAttachmentBtn, { backgroundColor: colors.chipBg }]}
                >
                  <X size={15} color={colors.textSecondary} />
                </Pressable>
              </View>
            ) : null}

            {/* AI Composer Input Bar / Active Voice Recording Bar */}
            {isRecording ? (
              <View style={[styles.composerBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <Pressable
                  onPress={handleCancelVoice}
                  accessibilityLabel="取消錄音"
                  style={({ pressed }) => [
                    styles.voiceCancelBtn,
                    { backgroundColor: colors.chipBg, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <X size={18} color={colors.textSecondary} />
                </Pressable>

                <View
                  style={[
                    styles.recordingPill,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <Animated.View style={[styles.recordingDot, { opacity: pulseAnim }]} />
                  <Text style={[styles.recordingLabel, { color: colors.text }]}>聆聽中...</Text>

                  <View style={styles.waveformRow}>
                    {waveAnims.map((anim, idx) => (
                      <Animated.View
                        key={`wave-${idx}`}
                        style={[
                          styles.waveBar,
                          {
                            backgroundColor: colors.primary,
                            transform: [{ scaleY: anim }],
                          },
                        ]}
                      />
                    ))}
                  </View>

                  <Text style={[styles.recordingTimer, { color: colors.textSecondary }]}>
                    {formatDuration(recordingSeconds)}
                  </Text>
                </View>

                <Pressable
                  onPress={handleFinishVoice}
                  accessibilityLabel="完成並送出語音"
                  style={({ pressed }) => [
                    styles.voiceSendBtn,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Check size={16} color="#FFFFFF" />
                  <Text style={styles.voiceSendText}>送出</Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.composerBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <Pressable
                  disabled={isAnalyzingAI}
                  onPress={() => handlePickImage('camera')}
                  accessibilityLabel="拍攝收據"
                  style={({ pressed }) => [
                    styles.mediaBtn,
                    { backgroundColor: colors.chipBg, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Camera size={18} color={colors.textSecondary} />
                </Pressable>

                <Pressable
                  disabled={isAnalyzingAI}
                  onPress={() => handlePickImage('library')}
                  accessibilityLabel="選擇相片"
                  style={({ pressed }) => [
                    styles.mediaBtn,
                    { backgroundColor: colors.chipBg, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <ImageIcon size={18} color={colors.textSecondary} />
                </Pressable>

                <TextInput
                  value={aiInput}
                  onChangeText={setAiInput}
                  placeholder="輸入消費描述，如：東京拉麵 1080 JPY 現金"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={500}
                  onSubmitEditing={() => handleSendAI()}
                  style={[
                    styles.aiTextInput,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                />

                {aiInput.trim() === '' && !attachedImage ? (
                  <Pressable
                    disabled={isAnalyzingAI || isStartingRecording}
                    onPress={handleStartVoice}
                    accessibilityLabel="語音記帳"
                    style={({ pressed }) => [
                      styles.sendBtn,
                      {
                        backgroundColor: colors.primary,
                        opacity:
                          isAnalyzingAI || isStartingRecording ? 0.45 : pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    {isAnalyzingAI || isStartingRecording ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Mic size={18} color="#FFFFFF" />
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    disabled={isAnalyzingAI}
                    onPress={() => handleSendAI()}
                    accessibilityLabel="送出 AI 解析"
                    style={({ pressed }) => [
                      styles.sendBtn,
                      {
                        backgroundColor: colors.primary,
                        opacity: isAnalyzingAI ? 0.45 : pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    {isAnalyzingAI ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Send size={17} color="#FFFFFF" />
                    )}
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  editHeaderBadge: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
  },
  editHeaderText: {
    fontSize: 14,
    fontWeight: '700',
  },
  segmentedControl: {
    flex: 1,
    maxWidth: 300,
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 10,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
  },
  manualContent: {
    padding: 14,
    gap: 12,
    paddingBottom: 18,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  amountCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  flowToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  flowBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  flowBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  amountDisplayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: 6,
    paddingVertical: 4,
  },
  amountCurrencyPrefix: {
    fontSize: 22,
    fontWeight: '700',
  },
  amountDisplayText: {
    fontSize: 38,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  evaluatedPreview: {
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  fxPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  fxPreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  fxPreviewValue: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sectionBlock: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 2,
  },
  horizontalList: {
    gap: 8,
    paddingVertical: 2,
  },
  chipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  formCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  textInput: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  tabularInput: {
    fontVariant: ['tabular-nums'],
  },
  timeInputWrap: {
    width: 82,
  },
  nowBtn: {
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  continuousRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  continuousLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  continuousTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  continuousSub: {
    fontSize: 11,
  },
  submitBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: 1,
  },
  submitBtn: {
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  promptBar: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  promptScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  promptChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  promptChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chatContent: {
    padding: 14,
    gap: 14,
    paddingBottom: 24,
  },
  msgGroup: {
    gap: 10,
    maxWidth: '100%',
  },
  msgGroupUser: {
    alignItems: 'flex-end',
  },
  msgGroupAI: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  chatImage: {
    width: 180,
    height: 120,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  draftsStack: {
    width: '100%',
    gap: 10,
  },
  batchWriteBtn: {
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  batchWriteText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  analyzingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  analyzingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  attachmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  attachmentThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  attachmentTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  attachmentSub: {
    fontSize: 11,
  },
  removeAttachmentBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  mediaBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTextInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceCancelBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingPill: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  recordingLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  waveformRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 20,
  },
  waveBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  recordingTimer: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontVariant: ['tabular-nums'],
  },
  voiceSendBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  voiceSendText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
