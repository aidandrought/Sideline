import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { teamPrimaryColor } from '../../services/teamTint';

type ScorerLine = {
  icon: 'goal' | 'yellow' | 'red';
  text: string;
};

type Props = {
  homeName: string;
  awayName: string;
  homeAbbr: string;
  awayAbbr: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore: number;
  awayScore: number;
  statusLabel: string;
  minuteLabel?: string;
  homeRecord?: string;
  awayRecord?: string;
  homeLines: ScorerLine[];
  awayLines: ScorerLine[];
  showRecords?: boolean;
  compact?: boolean;
  lightMode?: boolean;
  showScorersToggle?: boolean;
  centerLabel?: string;
  aggregateLabel?: string;
  detailRows?: Array<{ icon: string; text: string }>;
  competitionLabel?: string;
  debugGoalPreview?: { nonce: number; side: 'home' | 'away' } | null;
  animateGoalOnScoreChange?: boolean;
  hideLiveStatus?: boolean;
  minuteAtBottom?: boolean;
  hideChevronChip?: boolean;
};

const renderLineIcon = (type: ScorerLine['icon'], compact: boolean) => {
  if (type === 'goal') {
    return <Text style={[styles.lineIcon, compact && styles.lineIconCompact]}>{'\u26BD'}</Text>;
  }
  if (type === 'yellow') {
    return <View style={[styles.cardIcon, compact && styles.cardIconCompact, styles.cardIconYellow]} />;
  }
  return <View style={[styles.cardIcon, compact && styles.cardIconCompact, styles.cardIconRed]} />;
};

const hexToRgba = (hex: string, alpha: number) => {
  const cleaned = hex.replace('#', '');
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type GradientColorTuple = readonly [string, string, string, string];

type GoalPalette = {
  primary: string;
  secondary: string;
  tertiary: string;
  chip: string;
};

const getCornerPalette = (teamName: string, lightMode: boolean): GradientColorTuple => {
  const key = teamName.toLowerCase();
  const dualColorTeams: Array<{ match: string[]; corner: string; center: string }> = [
    // Requested: Barca red on corner, blue toward center.
    { match: ['barcelona'], corner: '#A50044', center: '#003B7A' },
    // Requested example: BVB black + yellow.
    { match: ['borussia dortmund', 'bvb', 'dortmund'], corner: '#111111', center: '#FDE100' },
    // Other common 2-color clubs.
    { match: ['atletico madrid'], corner: '#C4122E', center: '#1E3A8A' },
    { match: ['inter milan', 'inter'], corner: '#111111', center: '#0068A8' },
    { match: ['ac milan', 'milan'], corner: '#D71920', center: '#111111' },
    { match: ['roma', 'as roma'], corner: '#8C1D40', center: '#F7B500' },
    { match: ['stuttgart', 'vfb stuttgart', 'vfb'], corner: '#E30613', center: '#FFFFFF' },
    { match: ['juventus'], corner: '#111111', center: '#BFC5CC' },
    { match: ['newcastle'], corner: '#111111', center: '#C7CDD4' },
    { match: ['crystal palace'], corner: '#C4122E', center: '#1B458F' },
    { match: ['athletic club'], corner: '#D71920', center: '#C7CDD4' },
    { match: ['bayern munich', 'bayern'], corner: '#DC052D', center: '#1E40AF' },
    { match: ['west ham'], corner: '#6A1F2B', center: '#57A0D3' },
    { match: ['inter miami'], corner: '#F7A3C4', center: '#111111' },
    { match: ['lafc', 'los angeles fc'], corner: '#111111', center: '#C39E6D' },
    { match: ['la galaxy'], corner: '#00245D', center: '#F6C64B' },
    { match: ['seattle', 'sounders'], corner: '#00573F', center: '#5D9732' },
    { match: ['atlanta united'], corner: '#A71930', center: '#111111' },
    { match: ['club america', 'america'], corner: '#F7E214', center: '#0B1F41' },
    { match: ['monterrey'], corner: '#002B7F', center: '#E5E7EB' },
    { match: ['tigres'], corner: '#FDD000', center: '#1F3C88' },
    { match: ['cruz azul'], corner: '#0054A6', center: '#E5E7EB' },
    { match: ['pumas'], corner: '#0B1F41', center: '#C9A227' },
    { match: ['yokohama f marinos', 'yokohama marinos'], corner: '#003B7A', center: '#D71920' },
    { match: ['cerezo osaka'], corner: '#E4007F', center: '#1E2A5A' },
    { match: ['kashiwa reysol'], corner: '#FCD400', center: '#111111' },
    { match: ['vissel kobe'], corner: '#900028', center: '#111111' },
    { match: ['sporting cp', 'sporting lisbon'], corner: '#00994D', center: '#FFFFFF' },
    { match: ['porto'], corner: '#005BAC', center: '#E5E7EB' },
    { match: ['benfica'], corner: '#D71920', center: '#111111' },
    { match: ['braga'], corner: '#D71920', center: '#FFFFFF' },
  ];

  const dual = dualColorTeams.find((entry) => entry.match.some((token) => key.includes(token)));
  if (dual) {
    const strong = lightMode ? 0.72 : 0.68;
    const mid = lightMode ? 0.50 : 0.44;
    const soft = lightMode ? 0.20 : 0.16;
    return [
      hexToRgba(dual.corner, strong),
      hexToRgba(dual.center, mid),
      hexToRgba(dual.center, soft),
      'rgba(255,255,255,0)',
    ] as const;
  }

  const base = teamPrimaryColor(teamName);
  const strong = lightMode ? 0.68 : 0.62;
  const mid = lightMode ? 0.42 : 0.36;
  const soft = lightMode ? 0.16 : 0.13;
  return [
    hexToRgba(base, strong),
    hexToRgba(base, mid),
    hexToRgba(base, soft),
    'rgba(255,255,255,0)',
  ] as const;
};

const getGoalPalette = (teamName: string): GoalPalette => {
  const key = teamName.toLowerCase();
  const presets: Array<{ match: string[]; palette: GoalPalette }> = [
    { match: ['barcelona'], palette: { primary: '#A50044', secondary: '#004D98', tertiary: '#1D2330', chip: '#5B148D' } },
    { match: ['liverpool'], palette: { primary: '#C8102E', secondary: '#6D1A36', tertiary: '#1A1F2B', chip: '#5B148D' } },
    { match: ['real madrid'], palette: { primary: '#D4AF37', secondary: '#F3F4F6', tertiary: '#7C8798', chip: '#5B148D' } },
    { match: ['galatasaray'], palette: { primary: '#A32638', secondary: '#F0A300', tertiary: '#4B1F28', chip: '#5B148D' } },
    { match: ['arsenal'], palette: { primary: '#DB0007', secondary: '#9C824A', tertiary: '#3A1C1E', chip: '#5B148D' } },
    { match: ['chelsea'], palette: { primary: '#034694', secondary: '#1D428A', tertiary: '#1A2130', chip: '#5B148D' } },
  ];
  const preset = presets.find((entry) => entry.match.some((token) => key.includes(token)));
  if (preset) return preset.palette;
  const base = teamPrimaryColor(teamName);
  return {
    primary: base,
    secondary: hexToRgba(base, 0.72),
    tertiary: '#1A1F2B',
    chip: '#5B148D',
  };
};

const getLatestGoalScorer = (lines: ScorerLine[]) => {
  const latestGoal = lines.filter((line) => line.icon === 'goal').slice(-1)[0];
  if (!latestGoal) return '';
  return latestGoal.text
    .replace(/\s*-\s*\d+(?:\+\d+)?'?(?:\s*Pen)?$/i, '')
    .trim();
};

export const MatchResultHeaderCard = ({
  homeName,
  awayName,
  homeAbbr,
  awayAbbr,
  homeLogo,
  awayLogo,
  homeScore,
  awayScore,
  statusLabel,
  minuteLabel,
  homeRecord,
  awayRecord,
  homeLines,
  awayLines,
  showRecords = true,
  compact = false,
  lightMode = false,
  showScorersToggle = true,
  centerLabel,
  aggregateLabel,
  detailRows = [],
  competitionLabel,
  debugGoalPreview,
  animateGoalOnScoreChange = true,
  hideLiveStatus = false,
  minuteAtBottom = false,
  hideChevronChip = false,
}: Props) => {
  const isLive = statusLabel === 'LIVE';
  const [scorersOpen, setScorersOpen] = useState(false);
  const [displayHomeScore, setDisplayHomeScore] = useState(homeScore);
  const [displayAwayScore, setDisplayAwayScore] = useState(awayScore);
  const scoreAnim = useRef(new Animated.Value(1)).current;
  const goalTakeoverAnim = useRef(new Animated.Value(0)).current;
  const goalContentAnim = useRef(new Animated.Value(0)).current;
  const prevScoresRef = useRef({ home: homeScore, away: awayScore });
  const [goalSide, setGoalSide] = useState<'home' | 'away' | null>(null);
  const { width } = useWindowDimensions();
  const isCompact = width <= 480;
  const canShowScorers = showScorersToggle && (homeLines.length > 0 || awayLines.length > 0);
  const goalPalette = goalSide ? getGoalPalette(goalSide === 'home' ? homeName : awayName) : null;
  const goalScorer = goalSide
    ? getLatestGoalScorer(goalSide === 'home' ? homeLines : awayLines)
    : '';

  const playGoalAnimation = (side: 'home' | 'away') => {
    setGoalSide(side);
    goalTakeoverAnim.stopAnimation();
    goalContentAnim.stopAnimation();
    goalTakeoverAnim.setValue(0);
    goalContentAnim.setValue(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(goalTakeoverAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.delay(1760),
        Animated.timing(goalTakeoverAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(180),
        Animated.timing(goalContentAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.delay(1520),
        Animated.timing(goalContentAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]),
    ]).start(() => setGoalSide(null));
  };

  useEffect(() => {
    if (displayHomeScore === homeScore && displayAwayScore === awayScore) return;
    Animated.sequence([
      Animated.timing(scoreAnim, { toValue: 0.85, duration: 110, useNativeDriver: true }),
      Animated.timing(scoreAnim, { toValue: 1, duration: 170, useNativeDriver: true }),
    ]).start();
    setDisplayHomeScore(homeScore);
    setDisplayAwayScore(awayScore);
  }, [homeScore, awayScore, displayHomeScore, displayAwayScore, scoreAnim]);

  useEffect(() => {
    const prev = prevScoresRef.current;
    const homeScored = homeScore > prev.home;
    const awayScored = awayScore > prev.away;
    prevScoresRef.current = { home: homeScore, away: awayScore };

    if (!animateGoalOnScoreChange || !isLive || (!homeScored && !awayScored)) return;

    playGoalAnimation(homeScored ? 'home' : 'away');
  }, [homeScore, awayScore, isLive, animateGoalOnScoreChange]);

  useEffect(() => {
    if (!debugGoalPreview) return;
    playGoalAnimation(debugGoalPreview.side);
  }, [debugGoalPreview]);

  return (
    <View style={[styles.container, lightMode && styles.containerLight, compact && styles.containerCompact]}>
      <View pointerEvents="none" style={[styles.topTintLayer, compact && styles.topTintLayerCompact]}>
        <LinearGradient
          colors={getCornerPalette(homeName, lightMode)}
          locations={[0, 0.16, 0.48, 1]}
          style={[styles.cornerTint, compact && styles.cornerTintCompact, styles.cornerLeft]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <LinearGradient
          colors={getCornerPalette(awayName, lightMode)}
          locations={[0, 0.16, 0.48, 1]}
          style={[styles.cornerTint, compact && styles.cornerTintCompact, styles.cornerRight]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      </View>

      <View style={[styles.scoreRow, compact && styles.scoreRowCompact]}>
        {goalSide && goalPalette ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.goalTakeover,
              compact && styles.goalTakeoverCompact,
              {
                opacity: goalTakeoverAnim,
                transform: [{ scale: goalTakeoverAnim.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }],
              },
            ]}
          >
            <LinearGradient
              colors={[
                goalPalette.primary,
                goalPalette.secondary,
                goalPalette.tertiary,
                goalPalette.secondary,
                goalPalette.primary,
              ]}
              locations={[0, 0.24, 0.5, 0.76, 1]}
              start={{ x: 0, y: 0.45 }}
              end={{ x: 1, y: 0.55 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View
              style={[
                styles.goalTakeoverBand,
                goalSide === 'home' ? styles.goalTakeoverBandHome : styles.goalTakeoverBandAway,
                { backgroundColor: hexToRgba(goalPalette.tertiary, 0.34) },
              ]}
            />
            {(goalSide === 'home' ? homeLogo : awayLogo) ? (
              <Animated.Image
                source={{ uri: goalSide === 'home' ? homeLogo : awayLogo }}
                resizeMode="contain"
                style={[
                  styles.goalTakeoverLogo,
                  compact && styles.goalTakeoverLogoCompact,
                  goalSide === 'home' ? styles.goalTakeoverLogoHome : styles.goalTakeoverLogoAway,
                  {
                    opacity: goalContentAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.92] }),
                    transform: [
                      { translateX: goalContentAnim.interpolate({ inputRange: [0, 1], outputRange: [goalSide === 'home' ? -18 : 18, 0] }) },
                      { scale: goalContentAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
                    ],
                  },
                ]}
              />
            ) : null}
            <Animated.View
              style={[
                styles.goalTakeoverContent,
                goalSide === 'home' ? styles.goalTakeoverContentHome : styles.goalTakeoverContentAway,
                {
                  opacity: goalContentAnim,
                  transform: [{ translateX: goalContentAnim.interpolate({ inputRange: [0, 1], outputRange: [goalSide === 'home' ? 20 : -20, 0] }) }],
                },
              ]}
            >
              <Text style={[styles.goalTakeoverWord, compact && styles.goalTakeoverWordCompact]}>GOAL</Text>
              {!!goalScorer && (
                <Text style={[styles.goalTakeoverScorer, compact && styles.goalTakeoverScorerCompact]} numberOfLines={1}>
                  {goalScorer}
                </Text>
              )}
            </Animated.View>
            {!!minuteLabel && (
              <Animated.View
                style={[
                  styles.goalTakeoverMinuteChip,
                  compact && styles.goalTakeoverMinuteChipCompact,
                  goalSide === 'home' ? styles.goalTakeoverMinuteChipHome : styles.goalTakeoverMinuteChipAway,
                  { backgroundColor: goalPalette.chip, opacity: goalContentAnim },
                ]}
              >
                <Text style={[styles.goalTakeoverMinuteText, compact && styles.goalTakeoverMinuteTextCompact]} numberOfLines={1}>
                  {minuteLabel}
                </Text>
              </Animated.View>
            )}
          </Animated.View>
        ) : null}
        <View style={[styles.scoreRowContent, compact && styles.scoreRowContentCompact, goalSide && styles.scoreRowContentHidden]}>
        <View style={[styles.teamBlock, compact && styles.teamBlockCompact]}>
          {homeLogo ? <Image source={{ uri: homeLogo }} style={[styles.logo, compact && styles.logoCompact]} resizeMode="contain" /> : <View style={[styles.logoPlaceholder, compact && styles.logoCompact, lightMode && styles.logoPlaceholderLight]} />}
          <Text style={[styles.teamAbbr, compact && styles.teamAbbrCompact, lightMode && styles.teamAbbrLight]} numberOfLines={1} ellipsizeMode="tail">{homeAbbr}</Text>
          {showRecords && homeRecord ? <Text style={[styles.recordText, compact && styles.recordTextCompact, lightMode && styles.recordTextLight]}>{homeRecord}</Text> : null}
        </View>

        <View style={styles.scoreCenter}>
          <TouchableOpacity
            style={[styles.scoreMainRow, compact && styles.scoreMainRowCompact, canShowScorers && styles.scoreMainRowPressable]}
            activeOpacity={canShowScorers ? 0.78 : 1}
            disabled={!canShowScorers}
            onPress={() => setScorersOpen((prev) => !prev)}
            accessibilityRole={canShowScorers ? 'button' : undefined}
            accessibilityLabel={canShowScorers ? 'Show goal scorers' : undefined}
          >
            {centerLabel ? (
              <View style={styles.statusStack}>
                {!hideLiveStatus && (
                  <View style={[styles.statusPill, compact && styles.statusPillCompact, lightMode && styles.statusPillLight]}>
                    {isLive && <View style={styles.liveDot} />}
                    <Text style={[styles.statusText, lightMode && styles.statusTextLight]}>{statusLabel}</Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.previewCenterLabel,
                    compact && styles.previewCenterLabelCompact,
                    isCompact && styles.previewCenterLabelCompact,
                    lightMode && styles.previewCenterLabelLight,
                  ]}
                >
                  {centerLabel}
                </Text>
                {!!minuteLabel && !minuteAtBottom && (
                  <Text style={[styles.minuteText, compact && styles.minuteTextCompact, lightMode && styles.minuteTextLight]}>
                    {minuteLabel}
                  </Text>
                )}
                {!!aggregateLabel && (
                  <Text style={[styles.aggregateText, compact && styles.aggregateTextCompact, lightMode && styles.aggregateTextLight]}>
                    {aggregateLabel}
                  </Text>
                )}
                {canShowScorers && !hideChevronChip && (
                  <View style={[styles.scoreChevronChip, lightMode && styles.scoreChevronChipLight]}>
                    <Ionicons name={scorersOpen ? 'chevron-up' : 'chevron-down'} size={14} color={lightMode ? '#475569' : '#D1D5DB'} />
                  </View>
                )}
              </View>
            ) : (
              <>
                <Animated.Text
                  style={[
                    styles.scoreText,
                    compact && styles.scoreTextCompact,
                    isCompact && styles.scoreTextCompact,
                    lightMode && styles.scoreTextLight,
                    {
                      opacity: scoreAnim,
                      transform: [{ scale: scoreAnim }],
                    },
                  ]}
                >
                  {displayHomeScore}
                </Animated.Text>
                  <View style={styles.statusStack}>
                    {!hideLiveStatus && (
                      <View style={[styles.statusPill, compact && styles.statusPillCompact, lightMode && styles.statusPillLight]}>
                        {isLive && <View style={styles.liveDot} />}
                        <Text style={[styles.statusText, lightMode && styles.statusTextLight]}>{statusLabel}</Text>
                      </View>
                    )}
                    {!!minuteLabel && !minuteAtBottom && <Text style={[styles.minuteText, compact && styles.minuteTextCompact, lightMode && styles.minuteTextLight]}>{minuteLabel}</Text>}
                    {!!aggregateLabel && (
                      <Text style={[styles.aggregateText, compact && styles.aggregateTextCompact, lightMode && styles.aggregateTextLight]}>
                        {aggregateLabel}
                      </Text>
                    )}
                    {canShowScorers && !hideChevronChip && (
                      <View style={[styles.scoreChevronChip, compact && styles.scoreChevronChipCompact, lightMode && styles.scoreChevronChipLight]}>
                        <Ionicons name={scorersOpen ? 'chevron-up' : 'chevron-down'} size={14} color={lightMode ? '#475569' : '#D1D5DB'} />
                      </View>
                    )}
                  </View>
                <Animated.Text
                  style={[
                    styles.scoreText,
                    compact && styles.scoreTextCompact,
                    isCompact && styles.scoreTextCompact,
                    lightMode && styles.scoreTextLight,
                    {
                      opacity: scoreAnim,
                      transform: [{ scale: scoreAnim }],
                    },
                  ]}
                >
                  {displayAwayScore}
                </Animated.Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.teamBlock, compact && styles.teamBlockCompact]}>
          {awayLogo ? <Image source={{ uri: awayLogo }} style={[styles.logo, compact && styles.logoCompact]} resizeMode="contain" /> : <View style={[styles.logoPlaceholder, compact && styles.logoCompact, lightMode && styles.logoPlaceholderLight]} />}
          <Text style={[styles.teamAbbr, compact && styles.teamAbbrCompact, lightMode && styles.teamAbbrLight]} numberOfLines={1} ellipsizeMode="tail">{awayAbbr}</Text>
          {showRecords && awayRecord ? <Text style={[styles.recordText, compact && styles.recordTextCompact, lightMode && styles.recordTextLight]}>{awayRecord}</Text> : null}
        </View>
        </View>
        {canShowScorers && hideChevronChip && !goalSide && (
          <TouchableOpacity style={styles.recordChevronInline} onPress={() => setScorersOpen((prev) => !prev)} activeOpacity={0.7}>
            <Ionicons name={scorersOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {detailRows.length > 0 && (
        <View style={[styles.detailRowsWrap, compact && styles.detailRowsWrapCompact, lightMode && styles.detailRowsWrapLight]}>
          {detailRows.map((row, index) => (
            <View key={`${row.icon}-${index}`} style={styles.detailRow}>
              <Ionicons name={row.icon as any} size={14} color={lightMode ? '#475569' : '#CBD5E1'} />
              <Text style={[styles.detailRowText, lightMode && styles.detailRowTextLight]} numberOfLines={1}>
                {row.text}
              </Text>
            </View>
          ))}
        </View>
      )}

      {showScorersToggle && !compact && !hideChevronChip && (
        <TouchableOpacity style={styles.scorersToggle} onPress={() => setScorersOpen((prev) => !prev)}>
          <Ionicons name={scorersOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#A1A1A6" />
        </TouchableOpacity>
      )}

      {minuteAtBottom && !!minuteLabel && (
        <Text style={[styles.minuteBottomText, lightMode && styles.minuteBottomTextLight]}>
          {minuteLabel}
        </Text>
      )}

      {canShowScorers && scorersOpen && (
        <View style={styles.linesRow}>
          <View style={styles.linesCol}>
            {homeLines.map((line, index) => (
              <View key={`home-${index}`} style={[styles.lineRow, styles.lineRowLeft]}>
                <Text style={[styles.lineText, styles.lineTextLeft, isCompact && styles.lineTextCompact, lightMode && styles.lineTextLight]}>{line.text}</Text>
                <View style={styles.lineIconWrap}>{renderLineIcon(line.icon, isCompact)}</View>
              </View>
            ))}
          </View>

          <View style={[styles.divider, lightMode && styles.dividerLight]} />

          <View style={styles.linesCol}>
            {awayLines.map((line, index) => (
              <View key={`away-${index}`} style={[styles.lineRow, styles.lineRowRight]}>
                <View style={styles.lineIconWrap}>{renderLineIcon(line.icon, isCompact)}</View>
                <Text style={[styles.lineText, styles.lineTextRight, isCompact && styles.lineTextCompact, lightMode && styles.lineTextLight]}>{line.text}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginBottom: 16,
  },
  containerLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  containerCompact: {
    paddingTop: 9,
    paddingBottom: 7,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  topTintLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 170,
  },
  topTintLayerCompact: {
    height: 138,
  },
  cornerTint: {
    position: 'absolute',
    width: '122%',
    height: '245%',
    top: '-112%',
    opacity: 1,
  },
  cornerTintCompact: {
    width: '122%',
  },
  cornerLeft: {
    top: 0,
    left: '-22%',
  },
  cornerRight: {
    top: 0,
    right: '-22%',
  },
  scoreRow: {
    position: 'relative',
    minHeight: 74,
  },
  scoreRowCompact: {
    minHeight: 64,
  },
  scoreRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  scoreRowContentHidden: {
    opacity: 0,
  },
  scoreRowContentCompact: {
    gap: 4,
  },
  goalTakeover: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 2,
  },
  goalTakeoverCompact: {
    borderRadius: 10,
  },
  goalTakeoverBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '24%',
  },
  goalTakeoverBandHome: {
    left: '23%',
    transform: [{ skewX: '-18deg' }],
  },
  goalTakeoverBandAway: {
    right: '23%',
    transform: [{ skewX: '18deg' }],
  },
  goalTakeoverLogo: {
    position: 'absolute',
    top: '18%',
    width: 56,
    height: 56,
  },
  goalTakeoverLogoCompact: {
    width: 44,
    height: 44,
    top: '16%',
  },
  goalTakeoverLogoHome: {
    left: '30%',
  },
  goalTakeoverLogoAway: {
    right: '30%',
  },
  goalTakeoverContent: {
    position: 'absolute',
    top: '15%',
    width: '48%',
  },
  goalTakeoverContentHome: {
    right: '7%',
    alignItems: 'flex-start',
  },
  goalTakeoverContentAway: {
    left: '7%',
    alignItems: 'flex-end',
  },
  goalTakeoverWord: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: '#FFFFFF',
  },
  goalTakeoverWordCompact: {
    fontSize: 28,
    letterSpacing: 1.2,
  },
  goalTakeoverScorer: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
    maxWidth: '100%',
  },
  goalTakeoverScorerCompact: {
    fontSize: 12,
    marginTop: 1,
  },
  goalTakeoverMinuteChip: {
    position: 'absolute',
    bottom: 0,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  goalTakeoverMinuteChipCompact: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  goalTakeoverMinuteChipHome: {
    left: 0,
  },
  goalTakeoverMinuteChipAway: {
    right: 0,
  },
  goalTakeoverMinuteText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  goalTakeoverMinuteTextCompact: {
    fontSize: 12,
  },
  teamBlock: {
    width: 86,
    alignItems: 'center',
    gap: 6,
  },
  teamBlockCompact: {
    width: 76,
    gap: 2,
  },
  logo: {
    width: 36,
    height: 36,
  },
  logoCompact: {
    width: 30,
    height: 30,
  },
  logoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2C2C2E',
  },
  logoPlaceholderLight: {
    backgroundColor: '#F3F4F6',
  },
  teamAbbr: {
    fontSize: 16,
    fontWeight: '800',
    color: '#E6E6E9',
  },
  teamAbbrCompact: {
    fontSize: 14,
  },
  recordText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A1A1A6',
  },
  recordTextCompact: {
    fontSize: 10,
  },
  scoreCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scoreMainRowPressable: {
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  scoreMainRowCompact: {
    gap: 8,
  },
  statusStack: {
    alignItems: 'center',
    gap: 4,
  },
  scoreChevronChip: {
    width: 24,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  scoreChevronChipCompact: {
    width: 22,
    height: 18,
    borderRadius: 9,
  },
  scoreChevronChipLight: {
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  scoreText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#E6E6E9',
  },
  scoreTextCompact: {
    fontSize: 28,
  },
  previewCenterLabel: {
    fontSize: 28,
    fontWeight: '900',
    color: '#E6E6E9',
    letterSpacing: 1.2,
  },
  previewCenterLabelCompact: {
    fontSize: 22,
    letterSpacing: 0.8,
  },
  previewCenterLabelLight: {
    color: '#111827',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
  },
  statusPillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E6E6E9',
  },
  minuteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A1A1A6',
  },
  minuteBottomText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A1A1A6',
    textAlign: 'center',
    marginTop: 6,
  },
  minuteBottomTextLight: {
    color: '#64748B',
  },
  minuteTextCompact: {
    fontSize: 11,
  },
  aggregateText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8CC4FF',
    letterSpacing: 0.2,
  },
  aggregateTextCompact: {
    fontSize: 9,
  },
  aggregateTextLight: {
    color: '#2563EB',
  },
  scorersToggle: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorersToggleCompact: {
    marginTop: 3,
  },
  scorersToggleTiny: {
    marginTop: 1,
    paddingVertical: 2,
  },
  recordChevronInline: {
    position: 'absolute',
    left: '50%',
    bottom: 0,
    width: 28,
    height: 18,
    marginLeft: -14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailRowsWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
    gap: 6,
  },
  detailRowsWrapCompact: {
    marginTop: 8,
    paddingTop: 8,
    gap: 5,
  },
  detailRowsWrapLight: {
    borderTopColor: '#E5E7EB',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailRowText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  detailRowTextLight: {
    color: '#475569',
  },
  linesRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 10,
  },
  linesCol: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  dividerLight: {
    backgroundColor: '#B8C0CC',
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
    width: '100%',
  },
  lineRowLeft: {
    justifyContent: 'flex-end',
  },
  lineRowRight: {
    justifyContent: 'flex-start',
  },
  lineIcon: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 1,
  },
  lineIconCompact: {
    fontSize: 8,
    lineHeight: 11,
  },
  lineIconWrap: {
    width: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 1,
  },
  cardIcon: {
    width: 9,
    height: 13,
    borderRadius: 1.5,
  },
  cardIconCompact: {
    width: 7,
    height: 11,
  },
  cardIconYellow: {
    backgroundColor: '#F5C542',
  },
  cardIconRed: {
    backgroundColor: '#FF453A',
  },
  lineText: {
    fontSize: 10,
    lineHeight: 14,
    color: '#C7C7CC',
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  lineTextCompact: {
    fontSize: 9,
    lineHeight: 12,
  },
  lineTextLeft: {
    textAlign: 'right',
    paddingRight: 5,
  },
  lineTextRight: {
    textAlign: 'left',
    paddingLeft: 5,
  },
  teamAbbrLight: {
    color: '#111827',
  },
  recordTextLight: {
    color: '#6B7280',
  },
  scoreTextLight: {
    color: '#111827',
  },
  statusPillLight: {
    backgroundColor: '#E5E7EB',
  },
  statusTextLight: {
    color: '#111827',
  },
  minuteTextLight: {
    color: '#6B7280',
  },
  lineTextLight: {
    color: '#374151',
  },
});
