import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  homeName: string;
  awayName: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  statusLabel: string;
  minuteLabel?: string;
  onBack: () => void;
};

export const MatchScoreHeader = ({
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  homeScore,
  awayScore,
  statusLabel,
  minuteLabel,
  onBack,
}: Props) => {
  const scoreHome = homeScore ?? 0;
  const scoreAway = awayScore ?? 0;
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Ionicons name="chevron-back" size={22} color="#E6E6E9" />
      </TouchableOpacity>

      <View style={styles.scoreRow}>
        <View style={styles.teamCol}>
          {homeLogo ? (
            <Image source={{ uri: homeLogo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
          <Text style={styles.teamName} numberOfLines={1}>{homeName}</Text>
        </View>

        <View style={styles.scoreCenter}>
          <Text style={styles.scoreText}>{scoreHome}</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
          <Text style={styles.scoreText}>{scoreAway}</Text>
          {minuteLabel ? <Text style={styles.minuteText}>{minuteLabel}</Text> : null}
        </View>

        <View style={styles.teamCol}>
          {awayLogo ? (
            <Image source={{ uri: awayLogo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
          <Text style={styles.teamName} numberOfLines={1}>{awayName}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1C1C1E',
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  teamCol: {
    width: 88,
    alignItems: 'center',
    gap: 6,
  },
  logo: {
    width: 34,
    height: 34,
  },
  logoPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2C2C2E',
  },
  teamName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E6E6E9',
  },
  scoreCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  scoreText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#E6E6E9',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E6E6E9',
  },
  minuteText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A1A1A6',
  },
});
