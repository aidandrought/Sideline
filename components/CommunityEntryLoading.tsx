import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

type Props = {
  name?: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  label?: string;
};

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3 ? normalized.split('').map((char) => `${char}${char}`).join('') : normalized;
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getInitials = (name?: string) =>
  (name || 'FC')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'FC';

export function CommunityEntryLoading({
  name = 'Community',
  logo,
  primaryColor = '#4DA3FF',
  secondaryColor = '#101923',
  label = 'Loading community',
}: Props) {
  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#03070C', '#07111A', '#0A1622']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={[styles.glow, styles.glowPrimary, { backgroundColor: withAlpha(primaryColor, 0.18) }]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowSecondary, { backgroundColor: withAlpha(secondaryColor, 0.12) }]} />

      <View style={styles.center}>
        <View
          style={[
            styles.logoShell,
            {
              backgroundColor: withAlpha(primaryColor, 0.1),
              borderColor: withAlpha(primaryColor, 0.18),
              shadowColor: primaryColor,
            },
          ]}
        >
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={[styles.logoFallback, { backgroundColor: withAlpha(secondaryColor, 0.38) }]}>
              <Text style={styles.logoFallbackText}>{getInitials(name)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.metaRow}>
          <ActivityIndicator size="small" color={primaryColor} />
          <Text style={[styles.label, { color: withAlpha(primaryColor, 0.92) }]}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06101A',
    overflow: 'hidden',
    paddingHorizontal: 24,
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  glowPrimary: {
    top: 110,
    left: -50,
  },
  glowSecondary: {
    bottom: 120,
    right: -44,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  logoShell: {
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  logo: {
    width: 108,
    height: 108,
  },
  logoFallback: {
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    color: '#F3F8FD',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  name: {
    color: '#F3F8FD',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.6,
    maxWidth: 280,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
