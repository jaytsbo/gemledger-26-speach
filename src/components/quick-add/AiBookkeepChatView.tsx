import * as ImagePicker from 'expo-image-picker';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCheck,
  Image as ImageIcon,
  Mic,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AIDraftCard } from '../AIDraftCard';
import { HudReticle, MONO_FONT } from '../ui/HudReticle';
import { SpringPressable } from '../ui/SpringPressable';
import { ApiService } from '../../services/apiService';
import { compressReceiptImage } from '../../services/mediaCompressor';
import {
  cancelRecording,
  startRecording,
  stopRecording,
} from '../../services/voiceRecorder';
import { useLedgerStore } from '../../store/useLedgerStore';
import { HUD_RADIUS, HUD_RADIUS_LG } from '../../theme/colors';
import { useAppTheme } from '../../theme/ThemeContext';
import { AiChatMessage, AIParsedDraft, TransactionInput } from '../../types/ledger';
import {
  AttachedImage,
  formatDuration,
  MAX_VOICE_SECONDS,
  QUICK_AI_PROMPTS,
  triggerHapticLight,
  triggerHapticSuccess,
  WELCOME_AI_MESSAGE,
} from './quickAddHelpers';

export interface AiBookkeepChatViewHandle {
  cancelActiveWork: () => void;
}

export interface AiBookkeepChatViewProps {
  isActive: boolean;
  onDirtyChange: (dirty: boolean) => void;
}

export const AiBookkeepChatView = forwardRef<AiBookkeepChatViewHandle, AiBookkeepChatViewProps>(
  function AiBookkeepChatView({ isActive, onDirtyChange }, ref) {
    const { colors } = useAppTheme();
    const {
      settings,
      exchangeRates,
      baseCurrency,
      aiChatMessages,
      setAiChatMessages,
      clearAiChat,
      addTransaction,
      batchAddTransactions,
      callAI,
    } = useLedgerStore();

    const [aiInput, setAiInput] = useState('');
    const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
    const [isCompressingImage, setIsCompressingImage] = useState(false);
    const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isStartingRecording, setIsStartingRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [submittingDraftKeys, setSubmittingDraftKeys] = useState<Record<string, boolean>>({});
    const [batchSubmittingMsgId, setBatchSubmittingMsgId] = useState<string | null>(null);
    const [clearChatConfirmVisible, setClearChatConfirmVisible] = useState(false);
    const [isClearingChat, setIsClearingChat] = useState(false);
    const [errorBanner, setErrorBanner] = useState<string | null>(null);

    const displayedMessages = useMemo<AiChatMessage[]>(
      () => (aiChatMessages.length > 0 ? aiChatMessages : [WELCOME_AI_MESSAGE]),
      [aiChatMessages],
    );

    const isMountedRef = useRef(true);
    const isAnalyzingAIRef = useRef(false);
    const isPickingImageRef = useRef(false);
    const isCompressingImageRef = useRef(false);
    const isClearingChatRef = useRef(false);
    const imagePickSessionRef = useRef(0);
    const isActiveRef = useRef<boolean>(isActive);
    isActiveRef.current = isActive;
    const messagesRef = useRef(aiChatMessages);
    messagesRef.current = aiChatMessages;
    const submittingDraftKeysRef = useRef<Set<string>>(new Set());
    const batchSubmittingMsgIdsRef = useRef<Set<string>>(new Set());
    const voiceSessionRef = useRef(0);
    const isRecordingRef = useRef(false);
    const isStartingRecordingRef = useRef(false);
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

    const clearRecordingTimer = useCallback(() => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }, []);

    // Report AI dirty state (only unsent input/media/in-flight ops; persisted chat drafts survive close)
    const isAiDirty = useMemo(
      () =>
        isRecording ||
        isStartingRecording ||
        isAnalyzingAI ||
        isCompressingImage ||
        aiInput.trim() !== '' ||
        attachedImage !== null,
      [aiInput, attachedImage, isAnalyzingAI, isCompressingImage, isRecording, isStartingRecording],
    );

    useEffect(() => {
      onDirtyChange(isAiDirty);
    }, [isAiDirty, onDirtyChange]);

    useImperativeHandle(
      ref,
      () => ({
        cancelActiveWork: () => {
          voiceSessionRef.current += 1;
          imagePickSessionRef.current += 1;
          clearRecordingTimer();
          if (isRecordingRef.current || isStartingRecordingRef.current) {
            isRecordingRef.current = false;
            isStartingRecordingRef.current = false;
            isStoppingVoiceRef.current = false;
            setIsRecording(false);
            setIsStartingRecording(false);
            setRecordingSeconds(0);
            cancelRecording().catch(() => {});
          }
          console.log(
            '[QuickAdd/AiBookkeepChatView] CancelActiveWork - Aborted in-flight voice/image sessions',
          );
        },
      }),
      [clearRecordingTimer],
    );

    // Image picker handlers (resize + JPEG compress via mediaCompressor)
    const handlePickImage = async (source: 'camera' | 'library') => {
      if (isAnalyzingAIRef.current || isCompressingImageRef.current || isPickingImageRef.current) {
        return;
      }

      isPickingImageRef.current = true;
      const sessionId = ++imagePickSessionRef.current;

      try {
        let result: ImagePicker.ImagePickerResult;
        if (source === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('需要相機權限', '請允許存取相機以拍攝收據或發票。');
            return;
          }
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.9,
            base64: false,
          });
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('需要相簿權限', '請允許存取相簿以選擇收據照片。');
            return;
          }
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.9,
            base64: false,
          });
        }

        if (result.canceled || !result.assets[0]?.uri) {
          return;
        }

        const asset = result.assets[0];
        if (!isMountedRef.current || imagePickSessionRef.current !== sessionId) {
          return;
        }

        isCompressingImageRef.current = true;
        setIsCompressingImage(true);
        setErrorBanner(null);
        console.log(
          `[QuickAdd/handlePickImage] Compressing - Source:${source}, Size:${asset.width ?? 0}x${asset.height ?? 0}`,
        );

        const compressed = await compressReceiptImage({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        });

        if (!isMountedRef.current || imagePickSessionRef.current !== sessionId) {
          return;
        }

        setAttachedImage({
          uri: compressed.uri,
          base64: compressed.base64,
          mimeType: compressed.mimeType,
        });
        console.log(
          `[QuickAdd/handlePickImage] Ready - Source:${source}, Output:${compressed.width}x${compressed.height}, Base64Len:${compressed.base64.length}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : '無法處理收據圖片，請重試';
        console.warn(`[QuickAdd/handlePickImage] Error - Source:${source}, Message:${msg}`);
        if (isMountedRef.current && imagePickSessionRef.current === sessionId) {
          setErrorBanner(msg);
        }
        if (Platform.OS !== 'web') {
          Alert.alert('圖片處理失敗', msg);
        }
      } finally {
        isPickingImageRef.current = false;
        isCompressingImageRef.current = false;
        if (isMountedRef.current) {
          setIsCompressingImage(false);
        }
      }
    };

    const handleRemoveAttachedImage = useCallback(() => {
      imagePickSessionRef.current += 1;
      setAttachedImage(null);
    }, []);

    const handleConfirmClearAiChat = useCallback(async () => {
      if (isClearingChatRef.current) return;
      isClearingChatRef.current = true;
      setIsClearingChat(true);
      console.log('[QuickAdd/handleConfirmClearAiChat] Clear - Clearing retained AI chat history');
      try {
        await clearAiChat();
        if (isMountedRef.current) {
          setErrorBanner(null);
          setClearChatConfirmVisible(false);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '清除對話紀錄失敗，請稍後再試';
        console.warn('[QuickAdd/handleConfirmClearAiChat] Error -', msg);
        if (isMountedRef.current) {
          setErrorBanner(msg);
          setClearChatConfirmVisible(false);
        }
      } finally {
        isClearingChatRef.current = false;
        if (isMountedRef.current) {
          setIsClearingChat(false);
        }
      }
    }, [clearAiChat]);

    const scrollToChatBottom = useCallback(() => {
      setTimeout(() => {
        chatScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }, []);

    const handleSendAI = async (overrideText?: string) => {
      if (
        isAnalyzingAIRef.current ||
        isAnalyzingAI ||
        isCompressingImageRef.current ||
        isCompressingImage
      ) {
        return;
      }
      const rawText = (overrideText ?? aiInput).trim();
      const currentImage = attachedImage;

      if (!rawText && !currentImage) return;

      isAnalyzingAIRef.current = true;
      const promptText = rawText || '請辨識這張收據/發票的消費明細';
      const userMsgId = `user-${Date.now()}`;

      const userBubble: AiChatMessage = {
        id: userMsgId,
        role: 'user',
        text: promptText,
        imageUri: currentImage?.uri,
        createdAt: new Date().toISOString(),
      };

      setAiChatMessages((prev) => [...prev, userBubble]);
      setErrorBanner(null);
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
        if (!isMountedRef.current) return;

        const drafts = res.parsedTransactions || [];
        const assistantMsg: AiChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: res.reply || '已為您解析以下明細：',
          drafts,
          savedIndices: [],
          isFallback: res.isFallback,
          fallbackReason: res.fallbackReason,
          modelUsed: res.modelUsed,
          createdAt: new Date().toISOString(),
        };

        console.log(
          `[QuickAdd/handleSendAI] Response - Drafts:${drafts.length}, Fallback:${Boolean(res.isFallback)}, Model:${res.modelUsed ?? 'none'}`,
        );

        setAiChatMessages((prev) => [...prev, assistantMsg]);
        if (!res.isFallback || drafts.length > 0) {
          if (!overrideText) setAiInput('');
          setAttachedImage(null);
        }
        scrollToChatBottom();
      } catch (err) {
        if (!isMountedRef.current) return;
        const errMsg = err instanceof Error ? err.message : 'AI 解析發生錯誤';
        console.warn('[QuickAdd/handleSendAI] Error -', errMsg);
        setAiChatMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            text: `解析失敗：${errMsg}。已保留您的輸入與圖片，可直接重試或改用「極速記帳」。`,
            createdAt: new Date().toISOString(),
          },
        ]);
        scrollToChatBottom();
      } finally {
        isAnalyzingAIRef.current = false;
        if (isMountedRef.current) {
          setIsAnalyzingAI(false);
        }
      }
    };

    const showVoiceAlert = useCallback((title: string, message: string) => {
      setErrorBanner(message);
      if (
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        typeof window.alert === 'function'
      ) {
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
        if (!isMountedRef.current) return;
        console.log(
          `[QuickAdd/handleFinishVoice] Captured - DurationSec:${durationSec}, MimeType:${mimeType}, Base64Len:${base64.length}`,
        );

        const userBubble: AiChatMessage = {
          id: `user-voice-${Date.now()}`,
          role: 'user',
          text: `🎤 語音記帳 (${formatDuration(durationSec)})`,
          audioDurationSec: durationSec,
          createdAt: new Date().toISOString(),
        };

        setAiChatMessages((prev) => [...prev, userBubble]);
        isAnalyzingAIRef.current = true;
        setIsAnalyzingAI(true);
        triggerHapticLight();
        scrollToChatBottom();

        const res = await callAI('', base64, mimeType);
        if (!isMountedRef.current) return;
        const assistantMsg: AiChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: res.reply || '已為您解析以下明細：',
          drafts: res.parsedTransactions || [],
          savedIndices: [],
          isFallback: res.isFallback,
          fallbackReason: res.fallbackReason,
          modelUsed: res.modelUsed,
          createdAt: new Date().toISOString(),
        };

        console.log(
          `[QuickAdd/handleFinishVoice] Response - Drafts:${assistantMsg.drafts?.length ?? 0}, Fallback:${Boolean(res.isFallback)}, Model:${res.modelUsed ?? 'none'}`,
        );
        setAiChatMessages((prev) => [...prev, assistantMsg]);
        scrollToChatBottom();
      } catch (err) {
        if (!isMountedRef.current) return;
        const errMsg = err instanceof Error ? err.message : '語音記帳解析失敗';
        console.warn('[QuickAdd/handleFinishVoice] Error -', errMsg);
        setAiChatMessages((prev) => [
          ...prev,
          {
            id: `err-voice-${Date.now()}`,
            role: 'assistant',
            text: `語音解析失敗：${errMsg}。請稍後重試或改用「極速記帳」。`,
            createdAt: new Date().toISOString(),
          },
        ]);
        scrollToChatBottom();
      } finally {
        isStoppingVoiceRef.current = false;
        isAnalyzingAIRef.current = false;
        if (isMountedRef.current) {
          setIsAnalyzingAI(false);
          setRecordingSeconds(0);
        }
      }
    }, [callAI, clearRecordingTimer, scrollToChatBottom, setAiChatMessages]);

    const handleStartVoice = useCallback(async () => {
      if (
        isAnalyzingAIRef.current ||
        isAnalyzingAI ||
        isCompressingImageRef.current ||
        isCompressingImage ||
        isRecordingRef.current ||
        isStartingRecordingRef.current
      ) {
        return;
      }
      const sessionId = ++voiceSessionRef.current;
      isStartingRecordingRef.current = true;
      setErrorBanner(null);
      setIsStartingRecording(true);

      try {
        if (settings.simulate503) {
          console.log('[QuickAdd/handleStartVoice] Blocked - simulate503 is enabled');
          showVoiceAlert(
            '目前已開啟 503 離線模擬',
            '目前已開啟 503 離線模擬，請先至設定關閉後再使用語音記帳',
          );
          return;
        }

        const apiKey = await ApiService.getGeminiApiKey();
        const hasKey = Boolean(apiKey && apiKey.trim());
        if (!isMountedRef.current || !isActiveRef.current || voiceSessionRef.current !== sessionId) {
          console.log(
            '[QuickAdd/handleStartVoice] Aborted - Mode changed or unmounted during key check',
          );
          return;
        }
        if (!hasKey) {
          console.log('[QuickAdd/handleStartVoice] Blocked - Missing Gemini API key');
          showVoiceAlert(
            '需要設定 Gemini API Key',
            '語音記帳需要設定 Gemini API Key，請先至「設定 → AI 與開發者設定」填入您的 API Key。',
          );
          return;
        }

        await startRecording();
        if (!isMountedRef.current || !isActiveRef.current || voiceSessionRef.current !== sessionId) {
          console.log(
            '[QuickAdd/handleStartVoice] AbortedAfterStart - Cancelling recording after mode switch or unmount',
          );
          await cancelRecording().catch(() => {});
          return;
        }

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
        if (!isMountedRef.current || !isActiveRef.current || voiceSessionRef.current !== sessionId) {
          return;
        }
        const msg = err instanceof Error ? err.message : '無法啟動麥克風錄音';
        console.warn('[QuickAdd/handleStartVoice] Error -', msg);
        showVoiceAlert('無法開始錄音', msg);
      } finally {
        isStartingRecordingRef.current = false;
        if (isMountedRef.current) {
          setIsStartingRecording(false);
        }
      }
    }, [
      clearRecordingTimer,
      isAnalyzingAI,
      isCompressingImage,
      settings.simulate503,
      showVoiceAlert,
    ]);

    const handleCancelVoice = useCallback(async () => {
      voiceSessionRef.current += 1;
      clearRecordingTimer();
      isRecordingRef.current = false;
      isStartingRecordingRef.current = false;
      isStoppingVoiceRef.current = false;
      setIsRecording(false);
      setIsStartingRecording(false);
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
      if (!isActive && (isRecordingRef.current || isStartingRecordingRef.current)) {
        handleCancelVoice();
      }
    }, [handleCancelVoice, isActive]);

    useEffect(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
        voiceSessionRef.current += 1;
        imagePickSessionRef.current += 1;
        clearRecordingTimer();
        if (isRecordingRef.current || isStartingRecordingRef.current) {
          isRecordingRef.current = false;
          isStartingRecordingRef.current = false;
          isStoppingVoiceRef.current = false;
          cancelRecording().catch(() => {});
        }
      };
    }, [clearRecordingTimer]);

    const handleUpdateDraft = (msgId: string, draftIdx: number, updated: AIParsedDraft) => {
      setAiChatMessages((prev) =>
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
      if (
        submittingDraftKeysRef.current.has(lockKey) ||
        batchSubmittingMsgIdsRef.current.has(msgId)
      ) {
        return;
      }
      const latestMsg = messagesRef.current.find((m) => m.id === msgId);
      if (latestMsg?.savedIndices?.includes(draftIdx)) return;

      if (!Number.isFinite(draft.amount) || draft.amount === 0) {
        Alert.alert('金額無效', '請先點選「微調」輸入大於 0 的有效金額後再寫入。');
        return;
      }

      submittingDraftKeysRef.current.add(lockKey);
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
        if (isMountedRef.current) {
          setAiChatMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== msgId) return msg;
              const prevSaved = msg.savedIndices || [];
              if (prevSaved.includes(draftIdx)) return msg;
              return { ...msg, savedIndices: [...prevSaved, draftIdx] };
            }),
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '寫入失敗';
        console.warn('[QuickAdd/handleConfirmSingleDraft] Error -', msg);
        Alert.alert('寫入失敗', msg);
      } finally {
        submittingDraftKeysRef.current.delete(lockKey);
        if (isMountedRef.current) {
          setSubmittingDraftKeys((prev) => {
            const next = { ...prev };
            delete next[lockKey];
            return next;
          });
        }
      }
    };

    const handleBatchConfirmMessage = async (msg: AiChatMessage) => {
      if (!msg.drafts || msg.drafts.length === 0) return;
      if (batchSubmittingMsgIdsRef.current.has(msg.id)) return;

      const hasAnySingleInFlight = msg.drafts.some((_, idx) =>
        submittingDraftKeysRef.current.has(`${msg.id}:${idx}`),
      );
      if (hasAnySingleInFlight) {
        console.log(
          `[QuickAdd/handleBatchConfirmMessage] Blocked - Single draft submitting for Msg:${msg.id}`,
        );
        return;
      }

      const latestMsg = messagesRef.current.find((m) => m.id === msg.id) ?? msg;
      const savedSet = new Set(latestMsg.savedIndices || []);
      const pendingEntries = (latestMsg.drafts || [])
        .map((draft, idx) => ({ draft, idx }))
        .filter(({ idx }) => !savedSet.has(idx));

      if (pendingEntries.length === 0) return;

      const hasInvalidDraft = pendingEntries.some(
        ({ draft }) => !Number.isFinite(draft.amount) || draft.amount === 0,
      );
      if (hasInvalidDraft) {
        Alert.alert(
          '有未完成的明細',
          '部分明細金額為 0 或無效，請先點選「微調」修正後再批次寫入。',
        );
        return;
      }

      batchSubmittingMsgIdsRef.current.add(msg.id);
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

        const writtenIndices = pendingEntries.map(({ idx }) => idx);
        if (isMountedRef.current) {
          setAiChatMessages((prev) =>
            prev.map((item) => {
              if (item.id !== msg.id) return item;
              const merged = Array.from(
                new Set([...(item.savedIndices || []), ...writtenIndices]),
              );
              return { ...item, savedIndices: merged };
            }),
          );
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : '批次寫入失敗';
        console.warn('[QuickAdd/handleBatchConfirmMessage] Error -', errMsg);
        Alert.alert('批次寫入失敗', errMsg);
      } finally {
        batchSubmittingMsgIdsRef.current.delete(msg.id);
        if (isMountedRef.current) {
          setBatchSubmittingMsgId((cur) => (cur === msg.id ? null : cur));
        }
      }
    };

    const hasAnyDraftSubmitting =
      batchSubmittingMsgId !== null || Object.keys(submittingDraftKeys).length > 0;
    const isClearChatDisabled =
      aiChatMessages.length === 0 ||
      isClearingChat ||
      isAnalyzingAI ||
      isCompressingImage ||
      isRecording ||
      isStartingRecording ||
      hasAnyDraftSubmitting;

    return (
      <View style={styles.flex1}>
        {/* Retained AI Chat Header + Clear Chat Action */}
        <View
          style={[
            styles.aiRetentionBar,
            { borderBottomColor: colors.border, backgroundColor: colors.surfaceElevated },
          ]}
        >
          <Text
            style={[styles.aiRetentionText, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {aiChatMessages.length > 0
              ? `對話封存 · ${aiChatMessages.length} 則 · 關閉視窗不會遺失`
              : '對話與草稿自動保留 · 關閉視窗不會遺失'}
          </Text>
          <SpringPressable
            disabled={isClearChatDisabled}
            pressedScale={0.94}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="清除對話"
            onPress={() => setClearChatConfirmVisible(true)}
            style={[
              styles.clearChatBtn,
              {
                backgroundColor: colors.expenseBg,
                borderColor: colors.expense,
                opacity: isClearChatDisabled ? 0.45 : 1,
              },
            ]}
          >
            <Trash2 size={12} color={colors.expense} />
            <Text style={[styles.clearChatBtnText, { color: colors.expense }]}>清除對話</Text>
          </SpringPressable>
        </View>

        {/* Quick Example Prompt Chips */}
        <View
          style={[
            styles.promptBar,
            { borderBottomColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.promptScroll}
          >
            {QUICK_AI_PROMPTS.map((prompt) => {
              const promptDisabled =
                isAnalyzingAI || isCompressingImage || isRecording || isStartingRecording;
              return (
                <SpringPressable
                  key={prompt}
                  disabled={promptDisabled}
                  pressedScale={0.95}
                  haptic="light"
                  onPress={() => handleSendAI(prompt)}
                  style={[
                    styles.promptChip,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.cardBorder,
                      opacity: promptDisabled ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.promptChipText, { color: colors.text }]}>{prompt}</Text>
                </SpringPressable>
              );
            })}
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
            <View
              style={[
                styles.banner,
                { backgroundColor: colors.expenseBg, borderColor: colors.expense },
              ]}
            >
              <AlertTriangle size={16} color={colors.expense} />
              <Text style={[styles.bannerText, { color: colors.expense }]}>{errorBanner}</Text>
            </View>
          ) : null}

          {displayedMessages.map((msg) => {
            const isUser = msg.role === 'user';
            const savedIndices = msg.savedIndices || [];
            const drafts = msg.drafts || [];
            const unsavedCount = drafts.filter((_, idx) => !savedIndices.includes(idx)).length;
            const isBatchSubmitting = batchSubmittingMsgId === msg.id;
            const hasAnySingleSubmitting = drafts.some((_, idx) =>
              Boolean(submittingDraftKeys[`${msg.id}:${idx}`]),
            );
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
                      ? {
                          backgroundColor: colors.primaryBg,
                          borderColor: colors.primary,
                        }
                      : {
                          backgroundColor: colors.card,
                          borderColor: colors.accent,
                        },
                  ]}
                >
                  {!isUser ? <HudReticle variant="accent" /> : null}

                  {!isUser ? (
                    <View
                      style={[
                        styles.aiBadge,
                        {
                          backgroundColor: colors.accentBg,
                          borderColor: colors.accent,
                        },
                      ]}
                    >
                      <Sparkles size={11} color={colors.accent} />
                      <Text style={[styles.aiBadgeText, { color: colors.accent }]}>
                        {drafts.length > 0 ? 'AI 智慧解析 · 解析完成' : 'AI 智慧解析'}
                      </Text>
                    </View>
                  ) : null}

                  {msg.imageUri ? (
                    <Image
                      source={{ uri: msg.imageUri }}
                      style={[styles.chatImage, { borderColor: colors.primary }]}
                    />
                  ) : null}
                  <Text style={[styles.bubbleText, { color: colors.text }]}>{displayText}</Text>
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
                      <SpringPressable
                        disabled={isBatchSubmitting || hasAnySingleSubmitting}
                        pressedScale={0.96}
                        haptic="light"
                        onPress={() => handleBatchConfirmMessage(msg)}
                        style={[
                          styles.batchWriteBtn,
                          {
                            backgroundColor: colors.primary,
                            borderColor: colors.primary,
                            opacity: isBatchSubmitting || hasAnySingleSubmitting ? 0.65 : 1,
                          },
                        ]}
                      >
                        {isBatchSubmitting || hasAnySingleSubmitting ? (
                          <ActivityIndicator size="small" color={colors.onPrimary} />
                        ) : (
                          <CheckCheck size={17} color={colors.onPrimary} />
                        )}
                        <Text style={[styles.batchWriteText, { color: colors.onPrimary }]}>
                          {isBatchSubmitting
                            ? '批次寫入中...'
                            : hasAnySingleSubmitting
                              ? '單筆寫入中...'
                              : `一鍵全部寫入 · ${unsavedCount} 筆`}
                        </Text>
                      </SpringPressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          {isAnalyzingAI ? (
            <View
              style={[
                styles.analyzingBubble,
                { backgroundColor: colors.accentBg, borderColor: colors.accent },
              ]}
            >
              <HudReticle variant="accent" size={7} />
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[styles.analyzingText, { color: colors.text }]}>
                AI 智慧解析中...
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Compressing / Attached Image Preview */}
        {isCompressingImage ? (
          <View
            style={[
              styles.attachmentBar,
              { backgroundColor: colors.surface, borderTopColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.attachmentLoadingBox,
                { backgroundColor: colors.accentBg, borderColor: colors.accent },
              ]}
            >
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
            <View style={styles.flex1}>
              <Text style={[styles.attachmentTitle, { color: colors.text }]}>
                正在壓縮收據照片...
              </Text>
              <Text style={[styles.attachmentSub, { color: colors.textMuted }]}>
                最佳化尺寸與畫質以加速 AI 辨識，請稍候
              </Text>
            </View>
          </View>
        ) : attachedImage ? (
          <View
            style={[
              styles.attachmentBar,
              { backgroundColor: colors.surface, borderTopColor: colors.border },
            ]}
          >
            <Image
              source={{ uri: attachedImage.uri }}
              style={[styles.attachmentThumb, { borderColor: colors.accent }]}
            />
            <View style={styles.flex1}>
              <Text style={[styles.attachmentTitle, { color: colors.text }]}>已附加收據照片</Text>
              <Text style={[styles.attachmentSub, { color: colors.textMuted }]}>
                可直接按傳送讓 AI 辨識明細
              </Text>
            </View>
            <SpringPressable
              disabled={isAnalyzingAI}
              pressedScale={0.9}
              onPress={handleRemoveAttachedImage}
              accessibilityRole="button"
              accessibilityLabel="移除附件照片"
              style={[
                styles.removeAttachmentBtn,
                {
                  backgroundColor: colors.chipBg,
                  borderColor: colors.border,
                  opacity: isAnalyzingAI ? 0.5 : 1,
                },
              ]}
            >
              <X size={15} color={colors.textSecondary} />
            </SpringPressable>
          </View>
        ) : null}

        {/* AI Composer Input Bar / Active Voice Recording Bar */}
        {isRecording ? (
          <View
            style={[
              styles.composerBar,
              { backgroundColor: colors.surface, borderTopColor: colors.border },
            ]}
          >
            <SpringPressable
              pressedScale={0.92}
              haptic="light"
              onPress={handleCancelVoice}
              accessibilityRole="button"
              accessibilityLabel="取消錄音"
              style={[
                styles.voiceCancelBtn,
                { backgroundColor: colors.chipBg, borderColor: colors.border },
              ]}
            >
              <X size={18} color={colors.textSecondary} />
            </SpringPressable>

            <View
              style={[
                styles.recordingPill,
                { backgroundColor: colors.inputBg, borderColor: colors.accent },
              ]}
            >
              <Animated.View
                style={[
                  styles.recordingDot,
                  { backgroundColor: colors.danger, opacity: pulseAnim },
                ]}
              />
              <Text style={[styles.recordingLabel, { color: colors.text }]}>聆聽中...</Text>

              <View style={styles.waveformRow}>
                {waveAnims.map((anim, idx) => (
                  <Animated.View
                    key={`wave-${idx}`}
                    style={[
                      styles.waveBar,
                      {
                        backgroundColor: colors.accent,
                        transform: [{ scaleY: anim }],
                      },
                    ]}
                  />
                ))}
              </View>

              <Text style={[styles.recordingTimer, { color: colors.primary }]}>
                {formatDuration(recordingSeconds)}
              </Text>
            </View>

            <SpringPressable
              pressedScale={0.94}
              haptic="light"
              onPress={handleFinishVoice}
              accessibilityRole="button"
              accessibilityLabel="完成並送出語音"
              style={[
                styles.voiceSendBtn,
                { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Check size={16} color={colors.onPrimary} />
              <Text style={[styles.voiceSendText, { color: colors.onPrimary }]}>送出</Text>
            </SpringPressable>
          </View>
        ) : (
          <View
            style={[
              styles.composerBar,
              { backgroundColor: colors.surface, borderTopColor: colors.border },
            ]}
          >
            <SpringPressable
              disabled={isAnalyzingAI || isCompressingImage}
              pressedScale={0.92}
              haptic="light"
              onPress={() => handlePickImage('camera')}
              accessibilityRole="button"
              accessibilityLabel="拍攝收據"
              style={[
                styles.mediaBtn,
                {
                  backgroundColor: colors.chipBg,
                  borderColor: colors.border,
                  opacity: isAnalyzingAI || isCompressingImage ? 0.5 : 1,
                },
              ]}
            >
              <Camera size={18} color={colors.textSecondary} />
            </SpringPressable>

            <SpringPressable
              disabled={isAnalyzingAI || isCompressingImage}
              pressedScale={0.92}
              haptic="light"
              onPress={() => handlePickImage('library')}
              accessibilityRole="button"
              accessibilityLabel="選擇相片"
              style={[
                styles.mediaBtn,
                {
                  backgroundColor: colors.chipBg,
                  borderColor: colors.border,
                  opacity: isAnalyzingAI || isCompressingImage ? 0.5 : 1,
                },
              ]}
            >
              <ImageIcon size={18} color={colors.textSecondary} />
            </SpringPressable>

            <TextInput
              value={aiInput}
              onChangeText={setAiInput}
              editable={!isAnalyzingAI && !isCompressingImage}
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

            {aiInput.trim() === '' && !attachedImage && !isCompressingImage ? (
              <SpringPressable
                disabled={isAnalyzingAI || isStartingRecording || isCompressingImage}
                pressedScale={0.92}
                haptic="light"
                onPress={handleStartVoice}
                accessibilityRole="button"
                accessibilityLabel="語音記帳"
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                    opacity:
                      isAnalyzingAI || isStartingRecording || isCompressingImage ? 0.45 : 1,
                  },
                ]}
              >
                {isAnalyzingAI || isStartingRecording ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Mic size={18} color={colors.onPrimary} />
                )}
              </SpringPressable>
            ) : (
              <SpringPressable
                disabled={isAnalyzingAI || isCompressingImage}
                pressedScale={0.92}
                haptic="light"
                onPress={() => handleSendAI()}
                accessibilityRole="button"
                accessibilityLabel="送出 AI 解析"
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                    opacity: isAnalyzingAI || isCompressingImage ? 0.45 : 1,
                  },
                ]}
              >
                {isAnalyzingAI || isCompressingImage ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Send size={17} color={colors.onPrimary} />
                )}
              </SpringPressable>
            )}
          </View>
        )}

        {/* Clear AI Chat Confirmation Modal (cross-platform: iOS, Android, Web) */}
        <Modal
          visible={isActive && clearChatConfirmVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!isClearingChat) setClearChatConfirmVisible(false);
          }}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (!isClearingChat) setClearChatConfirmVisible(false);
            }}
          >
            <Pressable
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.accent,
                },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <HudReticle variant="accent" />
              <Text style={[styles.modalTitle, { color: colors.text }]}>清除 AI 對話紀錄？</Text>
              <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
                確定要清除所有已保留的 AI 對話紀錄與未寫入的草稿嗎？已寫入帳本的交易不受影響。
              </Text>

              <View style={styles.modalActions}>
                <SpringPressable
                  disabled={isClearingChat}
                  pressedScale={0.95}
                  onPress={() => setClearChatConfirmVisible(false)}
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor: colors.chipBg,
                      borderColor: colors.border,
                      opacity: isClearingChat ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>取消</Text>
                </SpringPressable>
                <SpringPressable
                  disabled={isClearingChat}
                  pressedScale={0.95}
                  haptic="light"
                  onPress={handleConfirmClearAiChat}
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor: colors.danger,
                      borderColor: colors.danger,
                      opacity: isClearingChat ? 0.65 : 1,
                    },
                  ]}
                >
                  {isClearingChat ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>確認清除</Text>
                  )}
                </SpringPressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  aiRetentionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  aiRetentionText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  clearChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  clearChatBtnText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
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
    borderRadius: HUD_RADIUS,
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
    position: 'relative',
    maxWidth: '90%',
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 7,
  },
  userTag: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    letterSpacing: 0.4,
  },
  aiBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  chatImage: {
    width: 180,
    height: 120,
    borderRadius: 6,
    borderWidth: 1,
    resizeMode: 'cover',
  },
  draftsStack: {
    width: '100%',
    gap: 10,
  },
  batchWriteBtn: {
    height: 44,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  batchWriteText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  analyzingBubble: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  analyzingText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: MONO_FONT,
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
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  attachmentLoadingBox: {
    width: 44,
    height: 44,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentTitle: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  attachmentSub: {
    fontSize: 11,
  },
  removeAttachmentBtn: {
    width: 28,
    height: 28,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
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
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTextInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceCancelBtn: {
    width: 40,
    height: 40,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingPill: {
    flex: 1,
    height: 40,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordingLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: MONO_FONT,
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
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  voiceSendBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  voiceSendText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: MONO_FONT,
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
