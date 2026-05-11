import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { teamPrimaryColor, teamSecondaryColor } from '../services/teamTint';

type Mode = 'chat' | 'preview' | 'result';

type Props = {
  homeName?: string;
  awayName?: string;
  homeLogo?: string;
  awayLogo?: string;
  league?: string;
  mode?: Mode;
};

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3 ? normalized.split('').map((char) => `${char}${char}`).join('') : normalized;
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getModeLabel = (mode: Mode) => {
  switch (mode) {
    case 'chat':
      return 'LIVE CHAT';
    case 'result':
      return 'MATCH RESULT';
    default:
      return 'MATCH PREVIEW';
  }
};

const getCenterLabel = (mode: Mode) => {
  switch (mode) {
    case 'chat':
      return 'LIVE';
    case 'result':
      return 'FT';
    default:
      return 'VS';
  }
};

const MAX_TEAM_LINE_CHARS = 16;

const canWrapIntoTwoLines = (value: string, maxCharsPerLine = MAX_TEAM_LINE_CHARS) => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  let lineCount = 1;
  let lineLength = 0;
  for (const word of words) {
    if (word.length > maxCharsPerLine) return false;
    if (lineLength === 0) {
      lineLength = word.length;
      continue;
    }
    if (lineLength + 1 + word.length <= maxCharsPerLine) {
      lineLength += 1 + word.length;
      continue;
    }
    lineCount += 1;
    if (lineCount > 2) return false;
    lineLength = word.length;
  }
  return true;
};

const formatTeamNameForTwoLines = (value: string, maxCharsPerLine = MAX_TEAM_LINE_CHARS) => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return value;

  let bestBreak = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i += 1) {
    const first = words.slice(0, i).join(' ');
    const second = words.slice(i).join(' ');
    if (first.length > maxCharsPerLine || second.length > maxCharsPerLine) continue;
    const score = Math.abs(first.length - second.length);
    if (score < bestScore) {
      bestScore = score;
      bestBreak = i;
    }
  }

  if (bestBreak === -1) return value;
  return `${words.slice(0, bestBreak).join(' ')}\n${words.slice(bestBreak).join(' ')}`;
};

const getDisplayTeamName = (name?: string) => {
  const fullName = (name || '').trim();
  if (!fullName) return 'TBD';
  if (canWrapIntoTwoLines(fullName, MAX_TEAM_LINE_CHARS)) {
    return formatTeamNameForTwoLines(fullName, MAX_TEAM_LINE_CHARS);
  }
  return fullName;
};

const getTeamNameSizing = (homeName: string, awayName: string) => {
  const longest = Math.max(homeName.replace(/\n/g, ' ').length, awayName.replace(/\n/g, ' ').length);
  if (longest >= 20) {
    return { fontSize: 16, lineHeight: 20, minimumFontScale: 0.55 as const };
  }
  if (longest >= 16) {
    return { fontSize: 18, lineHeight: 22, minimumFontScale: 0.58 as const };
  }
  if (longest >= 13) {
    return { fontSize: 20, lineHeight: 24, minimumFontScale: 0.62 as const };
  }
  return { fontSize: 22, lineHeight: 26, minimumFontScale: 0.65 as const };
};

const getFallbackAbbr = (name?: string) => {
  const value = (name || '').trim();
  if (!value) return 'TBD';
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((word) => word[0]).join('').slice(0, 3).toUpperCase();
};

export function MatchEntryLoading({
  homeName = 'Home',
  awayName = 'Away',
  homeLogo,
  awayLogo,
  league = 'Football',
  mode = 'preview',
}: Props) {
  useEffect(() => {
    if (homeLogo) {
      void Image.prefetch(homeLogo);
    }
    if (awayLogo) {
      void Image.prefetch(awayLogo);
    }
  }, [awayLogo, homeLogo]);

  const homePrimary = teamPrimaryColor(homeName);
  const homeSecondary = teamSecondaryColor(homeName);
  const awayPrimary = teamPrimaryColor(awayName);
  const awaySecondary = teamSecondaryColor(awayName);
  const displayHomeName = getDisplayTeamName(homeName);
  const displayAwayName = getDisplayTeamName(awayName);
  const teamNameSizing = getTeamNameSizing(displayHomeName, displayAwayName);

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#03070C', '#07111A', '#0A1622']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(homePrimary, 0.18), withAlpha(homeSecondary, 0.16)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.glow, styles.glowLeft]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(awayPrimary, 0.18), withAlpha(awaySecondary, 0.16)]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.glow, styles.glowRight]}
      />

      <View style={styles.card}>
        <LinearGradient
          colors={[withAlpha(homePrimary, 0.28), withAlpha(homeSecondary, 0.24)]}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 1, y: 0.7 }}
          style={[styles.colorHalf, styles.leftHalf]}
        />
        <LinearGradient
          colors={[withAlpha(awaySecondary, 0.24), withAlpha(awayPrimary, 0.28)]}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 1, y: 0.7 }}
          style={[styles.colorHalf, styles.rightHalf]}
        />
        <LinearGradient
          colors={['rgba(3,8,13,0.22)', 'rgba(3,8,13,0.72)', 'rgba(3,8,13,0.9)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.cardShade}
        />

        <View style={styles.topRow}>
          <Text style={styles.modeLabel}>{getModeLabel(mode)}</Text>
          <Text style={styles.leagueLabel} numberOfLines={1}>
            {league}
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.teamCol}>
            {homeLogo ? (
              <Image source={{ uri: homeLogo }} style={styles.logo} resizeMode="contain" fadeDuration={0} />
            ) : (
              <View style={[styles.logoFallback, { borderColor: withAlpha(homePrimary, 0.52), backgroundColor: withAlpha(homePrimary, 0.18) }]}>
                <Text style={styles.logoFallbackText}>{getFallbackAbbr(homeName)}</Text>
              </View>
            )}
            <Text
              style={[
                styles.teamName,
                { fontSize: teamNameSizing.fontSize, lineHeight: teamNameSizing.lineHeight },
              ]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={teamNameSizing.minimumFontScale}
            >
              {displayHomeName}
            </Text>
          </View>

          <View style={styles.centerCol}>
            <Text style={styles.centerLabel}>{getCenterLabel(mode)}</Text>
            <View style={styles.centerDivider} />
            <ActivityIndicator size="small" color="#7CC4FF" />
          </View>

          <View style={styles.teamCol}>
            {awayLogo ? (
              <Image source={{ uri: awayLogo }} style={styles.logo} resizeMode="contain" fadeDuration={0} />
            ) : (
              <View style={[styles.logoFallback, { borderColor: withAlpha(awayPrimary, 0.52), backgroundColor: withAlpha(awayPrimary, 0.18) }]}>
                <Text style={styles.logoFallbackText}>{getFallbackAbbr(awayName)}</Text>
              </View>
            )}
            <Text
              style={[
                styles.teamName,
                { fontSize: teamNameSizing.fontSize, lineHeight: teamNameSizing.lineHeight },
              ]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={teamNameSizing.minimumFontScale}
            >
              {displayAwayName}
            </Text>
          </View>
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
    paddingHorizontal: 20,
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  glowLeft: {
    left: -40,
    top: 100,
  },
  glowRight: {
    right: -40,
    bottom: 120,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    minHeight: 250,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#111821',
    borderWidth: 1,
    borderColor: 'rgba(133, 173, 212, 0.18)',
    shadowColor: '#000814',
    shadowOpacity: 0.34,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
  colorHalf: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '58%',
  },
  leftHalf: {
    left: 0,
  },
  rightHalf: {
    right: 0,
  },
  cardShade: {
    ...StyleSheet.absoluteFillObject,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  modeLabel: {
    color: '#8CC4FF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  leagueLabel: {
    color: '#E6EEF8',
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '56%',
    textAlign: 'right',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 22,
    paddingBottom: 28,
    gap: 8,
  },
  teamCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minWidth: 0,
  },
  logo: {
    width: 74,
    height: 74,
  },
  logoFallback: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    color: '#F5F8FC',
    fontSize: 20,
    fontWeight: '900',
  },
  teamName: {
    color: '#F5F8FC',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
    minWidth: 0,
    flexShrink: 1,
    width: '100%',
  },
  centerCol: {
    width: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    flexShrink: 0,
  },
  centerLabel: {
    color: '#F5F8FC',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
  },
  centerDivider: {
    width: 34,
    height: 1,
    backgroundColor: 'rgba(151, 190, 228, 0.42)',
  },
});
