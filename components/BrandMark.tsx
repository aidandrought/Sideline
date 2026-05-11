import { Image, StyleSheet, Text, View } from 'react-native';

type Props = {
  title?: string;
  subtitle?: string;
  showBadge?: boolean;
  showWordmark?: boolean;
  centered?: boolean;
  dark?: boolean;
  iconSize?: number;
  wordmarkWidth?: number;
  wordmarkHeight?: number;
};

export function BrandMark({
  title = '',
  subtitle,
  showBadge = false,
  showWordmark = true,
  centered = true,
  dark = true,
  iconSize = 64,
  wordmarkWidth = 420,
  wordmarkHeight = 136,
}: Props) {
  const titleColor = dark ? '#F4F8FF' : '#0F172A';
  const subtitleColor = dark ? '#90A2B9' : '#475569';

  return (
    <View style={[styles.wrap, centered && styles.centered]}>
      {showWordmark ? (
        <View style={styles.lockup}>
          <Image
            source={require('../assets/images/Sideline logo with name.png')}
            style={[styles.wordmark, { width: wordmarkWidth, height: wordmarkHeight }]}
            resizeMode="contain"
          />
        </View>
      ) : null}
      {showBadge ? <View /> : null}
      {title ? <Text style={[styles.title, { color: titleColor }, centered && styles.textCenter]}>{title}</Text> : null}
      {subtitle ? (
        <Text style={[styles.subtitle, { color: subtitleColor }, centered && styles.textCenter]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-start',
  },
  centered: {
    alignItems: 'center',
  },
  lockup: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  wordmark: {
    width: 420,
    height: 136,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 330,
  },
  textCenter: {
    textAlign: 'center',
  },
});
