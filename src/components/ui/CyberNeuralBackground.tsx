import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';
import { useAppTheme } from '../../theme/ThemeContext';

const NODE_COUNT = 38;
const CONNECTION_DIST = 135;
const MAX_SYNAPSE_PULSES = 18;
const NODE_COLORS = ['#00F0FF', '#8B5CF6', '#FF2A85', '#00F59B'] as const;
const PULSE_COLORS = ['#00F0FF', '#A855F7', '#00F59B'] as const;

interface NeuralNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  phase: number;
}

interface SynapsePulse {
  fromIdx: number;
  toIdx: number;
  t: number;
  speed: number;
  color: string;
}

interface NativeRenderConnection {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  opacity: number;
}

interface NativeRenderPulse {
  key: string;
  cx: number;
  cy: number;
  color: string;
}

interface NativeRenderFrame {
  nodes: NeuralNode[];
  connections: NativeRenderConnection[];
  pulses: NativeRenderPulse[];
}

interface WebCanvas2DContext {
  clearRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, startAngle: number, endAngle: number): void;
  stroke(): void;
  fill(): void;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  shadowColor: string;
  shadowBlur: number;
  globalAlpha: number;
}

interface WebCanvasElement {
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
  parentElement?: { clientWidth: number; clientHeight: number } | null;
  getContext(contextId: '2d'): WebCanvas2DContext | null;
}

function createInitialNodes(width: number, height: number): NeuralNode[] {
  const safeW = Math.max(width, 320);
  const safeH = Math.max(height, 560);
  const nodes: NeuralNode[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const speed = 0.38 + (i % 5) * 0.11;
    const angle = ((i * 137.5) % 360) * (Math.PI / 180);
    nodes.push({
      x: ((i * 73 + 29) % 97) / 97 * safeW,
      y: ((i * 131 + 43) % 89) / 89 * safeH,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 2 + (i % 3),
      color: NODE_COLORS[i % NODE_COLORS.length],
      phase: (i * 0.45) % (Math.PI * 2),
    });
  }
  return nodes;
}

function stepSimulation(
  nodes: NeuralNode[],
  pulses: SynapsePulse[],
  width: number,
  height: number,
): void {
  const safeW = Math.max(width, 320);
  const safeH = Math.max(height, 560);

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    n.x += n.vx;
    n.y += n.vy;
    n.phase += 0.035;

    if (n.x < 0) {
      n.x = 0;
      n.vx = Math.abs(n.vx);
    } else if (n.x > safeW) {
      n.x = safeW;
      n.vx = -Math.abs(n.vx);
    }

    if (n.y < 0) {
      n.y = 0;
      n.vy = Math.abs(n.vy);
    } else if (n.y > safeH) {
      n.y = safeH;
      n.vy = -Math.abs(n.vy);
    }
  }

  // Advance existing synapse pulses and remove finished or broken ones
  for (let p = pulses.length - 1; p >= 0; p--) {
    const pulse = pulses[p];
    pulse.t += pulse.speed;
    const a = nodes[pulse.fromIdx];
    const b = nodes[pulse.toIdx];
    if (!a || !b || pulse.t >= 1) {
      pulses.splice(p, 1);
      continue;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx * dx + dy * dy > CONNECTION_DIST * CONNECTION_DIST * 1.15) {
      pulses.splice(p, 1);
    }
  }

  // Spawn new travelling synapse electric pulses along active connections
  if (pulses.length < MAX_SYNAPSE_PULSES && Math.random() < 0.35) {
    const startIdx = Math.floor(Math.random() * nodes.length);
    const a = nodes[startIdx];
    for (let j = 0; j < nodes.length; j++) {
      const targetIdx = (startIdx + j + 1) % nodes.length;
      const b = nodes[targetIdx];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > 900 && distSq < CONNECTION_DIST * CONNECTION_DIST) {
        pulses.push({
          fromIdx: startIdx,
          toIdx: targetIdx,
          t: 0,
          speed: 0.022 + Math.random() * 0.022,
          color: PULSE_COLORS[(startIdx + targetIdx) % PULSE_COLORS.length],
        });
        break;
      }
    }
  }
}

export function CyberNeuralBackground(): JSX.Element {
  const { isDark } = useAppTheme();

  // Tri-Color Flowing Aurora Energy Clouds (4.5~6s noticeable billowing motion)
  const aurora1Anim = useRef(new Animated.Value(0)).current;
  const aurora2Anim = useRef(new Animated.Value(0)).current;
  const aurora3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const useNative = Platform.OS !== 'web';

    const loop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(aurora1Anim, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
        Animated.timing(aurora1Anim, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
      ]),
    );

    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(aurora2Anim, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
        Animated.timing(aurora2Anim, {
          toValue: 0,
          duration: 2900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
      ]),
    );

    const loop3 = Animated.loop(
      Animated.sequence([
        Animated.timing(aurora3Anim, {
          toValue: 1,
          duration: 2450,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
        Animated.timing(aurora3Anim, {
          toValue: 0,
          duration: 3050,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
      ]),
    );

    loop1.start();
    loop2.start();
    loop3.start();

    return () => {
      loop1.stop();
      loop2.stop();
      loop3.stop();
    };
  }, [aurora1Anim, aurora2Anim, aurora3Anim]);

  // Web HTML5 Canvas 60fps Neural Constellation + Travelling Synapse Pulses
  const webCanvasRef = useRef<WebCanvasElement | null>(null);
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const canvas = webCanvasRef.current;
    if (!canvas || typeof requestAnimationFrame !== 'function') return;

    const win = globalThis as unknown as {
      devicePixelRatio?: number;
      innerWidth?: number;
      innerHeight?: number;
      addEventListener?: (type: string, cb: () => void) => void;
      removeEventListener?: (type: string, cb: () => void) => void;
      ResizeObserver?: new (cb: () => void) => {
        observe(el: unknown): void;
        disconnect(): void;
      };
    };

    let logicalW =
      canvas.clientWidth || canvas.parentElement?.clientWidth || win.innerWidth || 420;
    let logicalH =
      canvas.clientHeight || canvas.parentElement?.clientHeight || win.innerHeight || 840;

    const syncCanvasSize = () => {
      const dpr = Math.min(win.devicePixelRatio || 1, 2);
      const nextW =
        canvas.clientWidth || canvas.parentElement?.clientWidth || win.innerWidth || 420;
      const nextH =
        canvas.clientHeight || canvas.parentElement?.clientHeight || win.innerHeight || 840;
      logicalW = Math.max(nextW, 300);
      logicalH = Math.max(nextH, 480);
      canvas.width = Math.floor(logicalW * dpr);
      canvas.height = Math.floor(logicalH * dpr);
    };

    syncCanvasSize();

    const nodes = createInitialNodes(logicalW, logicalH);
    const pulses: SynapsePulse[] = [];

    let resizeObserver: { observe(el: unknown): void; disconnect(): void } | null = null;
    if (typeof win.ResizeObserver === 'function' && canvas.parentElement) {
      resizeObserver = new win.ResizeObserver(() => {
        syncCanvasSize();
      });
      resizeObserver.observe(canvas.parentElement);
    } else if (typeof win.addEventListener === 'function') {
      win.addEventListener('resize', syncCanvasSize);
    }

    let rafId: number | null = null;
    const maxDistSq = CONNECTION_DIST * CONNECTION_DIST;

    const renderFrame = () => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = Math.min(win.devicePixelRatio || 1, 2);
        const dark = isDarkRef.current;
        const maxLineAlpha = dark ? 0.52 : 0.38;

        stepSimulation(nodes, pulses, logicalW, logicalH);

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(dpr, dpr);

        // 1. Dynamic geometric connection lines between nodes within 135px
        ctx.shadowBlur = 0;
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < maxDistSq) {
              const dist = Math.sqrt(distSq);
              const ratio = 1 - dist / CONNECTION_DIST;
              const alpha = (ratio * maxLineAlpha).toFixed(3);
              ctx.strokeStyle =
                (i + j) % 2 === 0
                  ? `rgba(0, 240, 255, ${alpha})`
                  : `rgba(139, 92, 246, ${alpha})`;
              ctx.lineWidth = 0.85 + ratio * 0.75;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }

        // 2. Travelling synapse electric pulses shooting along connection lines
        for (let p = 0; p < pulses.length; p++) {
          const pulse = pulses[p];
          const a = nodes[pulse.fromIdx];
          const b = nodes[pulse.toIdx];
          if (!a || !b) continue;
          const px = a.x + (b.x - a.x) * pulse.t;
          const py = a.y + (b.y - a.y) * pulse.t;
          ctx.fillStyle = pulse.color;
          ctx.shadowColor = pulse.color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(px, py, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // 3. 38 drifting glowing neural nodes
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const pulseRadius = n.r + Math.sin(n.phase) * 0.55;
          ctx.fillStyle = n.color;
          ctx.shadowColor = n.color;
          ctx.shadowBlur = 12;
          ctx.globalAlpha = dark ? 0.88 : 0.72;
          ctx.beginPath();
          ctx.arc(n.x, n.y, Math.max(1.6, pulseRadius), 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else if (typeof win.removeEventListener === 'function') {
        win.removeEventListener('resize', syncCanvasSize);
      }
    };
  }, []);

  // Native (~30fps throttled) SVG Neural Constellation + Travelling Synapse Pulses
  const initialDims = Dimensions.get('window');
  const nativeSizeRef = useRef({
    width: initialDims.width || 390,
    height: initialDims.height || 844,
  });
  const [nativeFrame, setNativeFrame] = useState<NativeRenderFrame>(() => ({
    nodes: createInitialNodes(nativeSizeRef.current.width, nativeSizeRef.current.height),
    connections: [],
    pulses: [],
  }));

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (typeof requestAnimationFrame !== 'function') return;

    const nodes = createInitialNodes(
      nativeSizeRef.current.width,
      nativeSizeRef.current.height,
    );
    const pulses: SynapsePulse[] = [];
    const maxDistSq = CONNECTION_DIST * CONNECTION_DIST;

    let rafId: number | null = null;
    let lastTick = 0;

    const tick = (timestamp: number) => {
      if (timestamp - lastTick >= 33) {
        lastTick = timestamp;
        const { width, height } = nativeSizeRef.current;
        stepSimulation(nodes, pulses, width, height);

        const maxLineAlpha = isDarkRef.current ? 0.52 : 0.38;
        const connections: NativeRenderConnection[] = [];
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < maxDistSq) {
              const dist = Math.sqrt(distSq);
              const ratio = 1 - dist / CONNECTION_DIST;
              connections.push({
                key: `${i}-${j}`,
                x1: a.x,
                y1: a.y,
                x2: b.x,
                y2: b.y,
                stroke: (i + j) % 2 === 0 ? '#00F0FF' : '#8B5CF6',
                opacity: Number((ratio * maxLineAlpha).toFixed(2)),
              });
            }
          }
        }

        const renderPulses: NativeRenderPulse[] = [];
        for (let p = 0; p < pulses.length; p++) {
          const pulse = pulses[p];
          const a = nodes[pulse.fromIdx];
          const b = nodes[pulse.toIdx];
          if (!a || !b) continue;
          renderPulses.push({
            key: `p-${p}-${pulse.fromIdx}-${pulse.toIdx}`,
            cx: a.x + (b.x - a.x) * pulse.t,
            cy: a.y + (b.y - a.y) * pulse.t,
            color: pulse.color,
          });
        }

        setNativeFrame({
          nodes: nodes.map((n) => ({ ...n })),
          connections,
          pulses: renderPulses,
        });
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      nativeSizeRef.current = { width, height };
    }
  };

  // Interpolations for the 3 large flowing Aurora energy clouds
  const cloud1TranslateX = aurora1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-65, 75],
  });
  const cloud1TranslateY = aurora1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-55, 65],
  });
  const cloud1Scale = aurora1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.28],
  });

  const cloud2TranslateX = aurora2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [70, -65],
  });
  const cloud2TranslateY = aurora2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-50, 70],
  });
  const cloud2Scale = aurora2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.26, 0.9],
  });

  const cloud3TranslateX = aurora3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-55, 70],
  });
  const cloud3TranslateY = aurora3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [65, -55],
  });
  const cloud3Scale = aurora3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.26],
  });

  const cyanStopOpacity = isDark ? '0.44' : '0.28';
  const violetStopOpacity = isDark ? '0.45' : '0.30';
  const magentaStopOpacity = isDark ? '0.38' : '0.24';
  const emeraldStopOpacity = isDark ? '0.34' : '0.22';

  return (
    <View
      pointerEvents="none"
      onLayout={handleLayout}
      style={[
        styles.container,
        { backgroundColor: isDark ? '#040711' : '#E8F0FA' },
      ]}
    >
      {/* Aurora Cloud 1: Electric Cyan (#00F0FF) -> Nebula Violet (#8B5CF6) (Upper Left / Top) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.auroraCloud1,
          {
            transform: [
              { translateX: cloud1TranslateX },
              { translateY: cloud1TranslateY },
              { scale: cloud1Scale },
            ],
          },
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 400 400">
          <Defs>
            <RadialGradient id="cyberAuroraCyan" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="#00F0FF" stopOpacity={cyanStopOpacity} />
              <Stop offset="52%" stopColor="#00B8D4" stopOpacity={isDark ? '0.20' : '0.12'} />
              <Stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="200" cy="200" r="200" fill="url(#cyberAuroraCyan)" />
        </Svg>
      </Animated.View>

      {/* Aurora Cloud 2: Nebula Violet (#8B5CF6) -> Deep Indigo (Center Right) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.auroraCloud2,
          {
            transform: [
              { translateX: cloud2TranslateX },
              { translateY: cloud2TranslateY },
              { scale: cloud2Scale },
            ],
          },
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 420 420">
          <Defs>
            <RadialGradient id="cyberAuroraViolet" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="#8B5CF6" stopOpacity={violetStopOpacity} />
              <Stop offset="55%" stopColor="#6D28D9" stopOpacity={isDark ? '0.22' : '0.13'} />
              <Stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="210" cy="210" r="210" fill="url(#cyberAuroraViolet)" />
        </Svg>
      </Animated.View>

      {/* Aurora Cloud 3: Neon Magenta (#FF2A85) + Emerald (#00F59B) (Bottom Left / Lower) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.auroraCloud3,
          {
            transform: [
              { translateX: cloud3TranslateX },
              { translateY: cloud3TranslateY },
              { scale: cloud3Scale },
            ],
          },
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 420 420">
          <Defs>
            <RadialGradient id="cyberAuroraMagentaEmerald" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="#FF2A85" stopOpacity={magentaStopOpacity} />
              <Stop offset="50%" stopColor="#00F59B" stopOpacity={emeraldStopOpacity} />
              <Stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="210" cy="210" r="210" fill="url(#cyberAuroraMagentaEmerald)" />
        </Svg>
      </Animated.View>

      {/* Neural Network Constellation Particles + Geometric Connections + Travelling Synapse Pulses */}
      {Platform.OS === 'web' ? (
        React.createElement('canvas', {
          ref: (el: WebCanvasElement | null) => {
            webCanvasRef.current = el;
          },
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          },
        })
      ) : (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          {nativeFrame.connections.map((conn) => (
            <Line
              key={conn.key}
              x1={conn.x1}
              y1={conn.y1}
              x2={conn.x2}
              y2={conn.y2}
              stroke={conn.stroke}
              strokeWidth={1.15}
              strokeOpacity={conn.opacity}
            />
          ))}
          {nativeFrame.pulses.map((p) => (
            <Circle
              key={p.key}
              cx={p.cx}
              cy={p.cy}
              r={2.8}
              fill={p.color}
              fillOpacity={0.95}
            />
          ))}
          {nativeFrame.nodes.map((n, idx) => (
            <Circle
              key={`node-${idx}`}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={n.color}
              fillOpacity={isDark ? 0.86 : 0.72}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 0,
  },
  auroraCloud1: {
    position: 'absolute',
    top: -110,
    left: -95,
    width: 440,
    height: 440,
  },
  auroraCloud2: {
    position: 'absolute',
    top: '24%',
    right: -120,
    width: 460,
    height: 460,
  },
  auroraCloud3: {
    position: 'absolute',
    bottom: -115,
    left: -75,
    width: 460,
    height: 460,
  },
});
