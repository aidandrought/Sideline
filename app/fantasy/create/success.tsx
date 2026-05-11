// app/fantasy/create/success.tsx
// League created — show invite code, copy & share

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Clipboard,
  Easing,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0B1220',
  surface: '#172033',
  accent: '#10B981',
  cyan: '#3DD9D6',
  text: '#F5F7FA',
  muted: '#94A3B8',
  success: '#22C55E',
  gold: '#FFD700',
  border: '#1E2D45',
};

// ─── Confetti dot ─────────────────────────────────────────────────────────────

const CONFETTI_COLORS = [C.accent, C.cyan, C.gold, C.success, '#A78BFA', '#F472B6'];

function ConfettiDot({ index }: { index: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const startX = (index * 47) % 320 - 160;
  const size = 6 + (index % 5) * 2;

  useEffect(() => {
    const delay = (index * 120) % 800;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 1800 + (index % 3) * 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 300] });
  const translateX = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [startX, startX + 30, startX - 20] });
  const opacity = anim.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(index % 2 === 0 ? 1 : -1) * 360}deg`] });

  return (
    <Animated.View
      style={[
        confettiStyle.dot,
        {
          width: size,
          height: size,
          backgroundColor: color,
          transform: [{ translateX }, { translateY }, { rotate }],
          opacity,
          borderRadius: index % 3 === 0 ? size / 2 : 2,
        },
      ]}
    />
  );
}

const confettiStyle = StyleSheet.create({
  dot: { position: 'absolute', top: 0, left: '50%' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { leagueId, inviteCode } = useLocalSearchParams<{ leagueId: string; inviteCode: string }>();

  const [copied, setCopied] = useState(false);

  // Format invite code as XXXX-XXXX if not already
  const displayCode = (() => {
    if (!inviteCode) return '----';
    const clean = inviteCode.replace('-', '');
    if (clean.length >= 8) return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
    if (inviteCode.includes('-')) return inviteCode;
    return inviteCode;
  })();

  const handleCopy = () => {
    if (!inviteCode) return;
    Clipboard.setString(displayCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my Sideline Fantasy league! Use invite code: ${displayCode}\n\nDownload Sideline to play.`,
        title: 'Join my Fantasy League',
      });
    } catch (e) {
      // User cancelled — ignore
    }
  };

  const handleGoToLeague = () => {
    if (leagueId) {
      router.replace(`/fantasy/league/${leagueId}`);
    } else {
      router.replace('/(tabs)');
    }
  };

  // Trophy scale-in animation
  const trophyAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(trophyAnim, {
      toValue: 1,
      friction: 5,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Confetti */}
      <View style={s.confettiContainer} pointerEvents="none">
        {Array.from({ length: 20 }, (_, i) => (
          <ConfettiDot key={i} index={i} />
        ))}
      </View>

      <View style={[s.content, { paddingBottom: insets.bottom + 32 }]}>
        {/* Trophy */}
        <Animated.Text
          style={[s.trophy, { transform: [{ scale: trophyAnim }] }]}
        >
          🏆
        </Animated.Text>

        <Text style={s.heading}>League Created!</Text>
        <Text style={s.subheading}>Share the invite code with friends to grow your league.</Text>

        {/* Invite code box */}
        <View style={s.codeBox}>
          <Text style={s.codeLabel}>INVITE CODE</Text>
          <Text style={s.codeText}>{displayCode}</Text>
        </View>

        {/* Copy button */}
        <TouchableOpacity style={[s.btn, s.btnCopy]} onPress={handleCopy} activeOpacity={0.8}>
          <Text style={s.btnCopyText}>
            {copied ? '✓ Copied!' : 'Copy Code'}
          </Text>
        </TouchableOpacity>

        {/* Share button */}
        <TouchableOpacity style={[s.btn, s.btnShare]} onPress={handleShare} activeOpacity={0.8}>
          <Text style={s.btnShareText}>Share League</Text>
        </TouchableOpacity>

        {/* Go to league */}
        <TouchableOpacity style={[s.btn, s.btnGo]} onPress={handleGoToLeague} activeOpacity={0.8}>
          <Text style={s.btnGoText}>Go to My League</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  confettiContainer: { position: 'absolute', top: 0, left: 0, right: 0, height: 320, zIndex: 0 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 1,
  },
  trophy: { fontSize: 80, marginBottom: 20 },
  heading: { fontSize: 30, fontWeight: '900', color: C.text, marginBottom: 8 },
  subheading: { fontSize: 15, color: C.muted, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  codeBox: {
    backgroundColor: C.surface,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderWidth: 2,
    borderColor: C.gold,
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.gold,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  codeText: {
    fontSize: 36,
    fontWeight: '900',
    color: C.text,
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
  },
  btn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnCopy: { backgroundColor: C.accent },
  btnCopyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnShare: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  btnShareText: { color: C.text, fontSize: 16, fontWeight: '600' },
  btnGo: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.cyan },
  btnGoText: { color: C.cyan, fontSize: 16, fontWeight: '700' },
});
