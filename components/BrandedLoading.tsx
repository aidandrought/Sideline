import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

type Props = {
  label?: string;
  sublabel?: string;
  dark?: boolean;
  variant?: 'default' | 'launch';
};

export function BrandedLoading({ label = 'Loading', sublabel, dark = false, variant = 'default' }: Props) {
  if (variant === 'launch') {
    return (
      <View style={styles.launchWrap}>
        <LinearGradient
          colors={['#030814', '#06101F', '#08172C']}
          start={{ x: 0.12, y: 0 }}
          end={{ x: 0.88, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View pointerEvents="none" style={styles.launchGlowTop} />
        <View pointerEvents="none" style={styles.launchGlowBottom} />
        <View pointerEvents="none" style={styles.launchGrid} />
        <View style={styles.launchCenter}>
          <View pointerEvents="none" style={styles.launchHalo} />
          <View pointerEvents="none" style={styles.launchAura} />
          <Image
            source={require('../assets/images/Official logo.png')}
            style={styles.launchLogo}
            resizeMode="contain"
          />
          <Text style={styles.launchWordmark}>SIDELINE</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, dark ? styles.wrapDark : styles.wrapLight]}>
      <LinearGradient
        colors={dark ? ['#0E1A2E', '#0A1220', '#081019'] : ['#F8FBFF', '#EEF5FF', '#E6F1FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={[styles.gridGlow, dark ? styles.gridGlowDark : styles.gridGlowLight]} />
      <View pointerEvents="none" style={[styles.orbTop, dark ? styles.orbTopDark : styles.orbTopLight]} />
      <View pointerEvents="none" style={[styles.orbBottom, dark ? styles.orbBottomDark : styles.orbBottomLight]} />
      <View style={[styles.logoStage, dark ? styles.logoStageDark : styles.logoStageLight]}>
        <View pointerEvents="none" style={[styles.logoGlow, dark ? styles.logoGlowDark : styles.logoGlowLight]} />
        <View style={[styles.logoShell, dark ? styles.logoShellDark : styles.logoShellLight]}>
          <Image
            source={require('../assets/images/Official Sideline App Logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      </View>
      {label ? <Text style={[styles.label, dark && styles.labelDark]}>{label}</Text> : null}
      {sublabel ? <Text style={[styles.sublabel, dark && styles.sublabelDark]}>{sublabel}</Text> : null}
      <ActivityIndicator size="small" color={dark ? '#7CC4FF' : '#1E78E8'} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  launchWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#060B14',
    overflow: 'hidden',
  },
  launchGlowTop: {
    position: 'absolute',
    top: -140,
    right: -40,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(39, 112, 255, 0.16)',
  },
  launchGlowBottom: {
    position: 'absolute',
    bottom: -180,
    left: -80,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(86, 213, 255, 0.10)',
  },
  launchGrid: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(4, 12, 25, 0.28)',
  },
  launchCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchHalo: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(43, 103, 255, 0.12)',
    shadowColor: '#2F86FF',
    shadowOpacity: 0.24,
    shadowRadius: 42,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  launchAura: {
    position: 'absolute',
    width: 236,
    height: 236,
    borderRadius: 118,
    backgroundColor: 'rgba(112, 211, 255, 0.08)',
  },
  launchLogo: {
    width: 184,
    height: 184,
  },
  launchWordmark: {
    marginTop: -38,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: 2.8,
    color: '#bad2ef',
    textShadowColor: 'rgba(56, 142, 255, 0.28)',
    textShadowRadius: 16,
  },
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 34,
    borderRadius: 32,
    overflow: 'hidden',
    minWidth: 286,
    maxWidth: 340,
  },
  wrapDark: {
    backgroundColor: '#08101B',
    borderWidth: 1,
    borderColor: 'rgba(129, 171, 255, 0.18)',
    shadowColor: '#000814',
    shadowOpacity: 0.34,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 20,
  },
  wrapLight: {
    backgroundColor: '#F5F9FF',
    borderWidth: 1,
    borderColor: '#D7E5F6',
    shadowColor: '#7AA7D9',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  gridGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.7,
  },
  gridGlowDark: {
    backgroundColor: 'rgba(10, 21, 39, 0.22)',
  },
  gridGlowLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  orbTop: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -86,
    right: -58,
  },
  orbTopDark: {
    backgroundColor: 'rgba(81, 154, 255, 0.22)',
  },
  orbTopLight: {
    backgroundColor: 'rgba(64, 138, 255, 0.13)',
  },
  orbBottom: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    bottom: -78,
    left: -52,
  },
  orbBottomDark: {
    backgroundColor: 'rgba(40, 206, 188, 0.18)',
  },
  orbBottomLight: {
    backgroundColor: 'rgba(40, 206, 188, 0.1)',
  },
  logoStage: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  logoStageDark: {
    backgroundColor: 'rgba(8, 16, 29, 0.18)',
  },
  logoStageLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.26)',
  },
  logoGlow: {
    position: 'absolute',
    width: 156,
    height: 156,
    borderRadius: 78,
  },
  logoGlowDark: {
    backgroundColor: 'rgba(70, 135, 255, 0.18)',
  },
  logoGlowLight: {
    backgroundColor: 'rgba(96, 167, 255, 0.12)',
  },
  logoShell: {
    width: 136,
    height: 136,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  logoShellDark: {
    backgroundColor: 'rgba(10, 19, 33, 0.86)',
    borderColor: 'rgba(144, 184, 255, 0.14)',
  },
  logoShellLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
    borderColor: 'rgba(116, 156, 210, 0.18)',
  },
  logo: {
    width: 112,
    height: 112,
  },
  label: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102038',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  labelDark: {
    color: '#F5F9FF',
  },
  sublabel: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#58708D',
    textAlign: 'center',
    maxWidth: 272,
  },
  sublabelDark: {
    color: '#9DB1CC',
  },
  spinner: {
    marginTop: 18,
  },
});
