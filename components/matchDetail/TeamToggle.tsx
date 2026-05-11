import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Side = 'home' | 'away';

type Props = {
  selected: Side;
  homeLogo?: string;
  awayLogo?: string;
  homeFormation?: string;
  awayFormation?: string;
  homeLabel?: string;
  awayLabel?: string;
  onSelect: (side: Side) => void;
};

export const TeamToggle = ({
  selected,
  homeLogo,
  awayLogo,
  homeFormation,
  awayFormation,
  homeLabel,
  awayLabel,
  onSelect,
}: Props) => {
  const homeText = homeLabel || homeFormation || '--';
  const awayText = awayLabel || awayFormation || '--';
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.segment, selected === 'home' && styles.segmentActive]}
        onPress={() => onSelect('home')}
      >
        {homeLogo ? <Image source={{ uri: homeLogo }} style={styles.logo} resizeMode="contain" /> : <View style={styles.logoPlaceholder} />}
        <Text style={[styles.segmentText, selected === 'home' && styles.segmentTextActive]} numberOfLines={1}>
          {homeText}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.segment, selected === 'away' && styles.segmentActive]}
        onPress={() => onSelect('away')}
      >
        <Text style={[styles.segmentText, selected === 'away' && styles.segmentTextActive]} numberOfLines={1}>
          {awayText}
        </Text>
        {awayLogo ? <Image source={{ uri: awayLogo }} style={styles.logo} resizeMode="contain" /> : <View style={styles.logoPlaceholder} />}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#101013',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  segmentActive: {
    backgroundColor: '#2C2C2E',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A1A1A6',
    flexShrink: 1,
    textAlign: 'center',
  },
  segmentTextActive: {
    color: '#E6E6E9',
  },
  logo: {
    width: 20,
    height: 20,
  },
  logoPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2C2C2E',
  },
});
