import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  initial: string;
  onPress: () => void;
  dark?: boolean;
  size?: number;
  accessibilityLabel?: string;
  photoURL?: string | null;
};

export function BrandProfileButton({
  initial,
  onPress,
  dark = false,
  size = 42,
  accessibilityLabel = 'Open profile',
  photoURL,
}: Props) {
  const outerRadius = size / 2;
  const innerSize = size - 8;
  const innerRadius = innerSize / 2;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        {
          width: size,
          height: size,
          borderRadius: outerRadius,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <LinearGradient
        colors={dark ? ['#030915', '#0B2D54', '#1B84E5'] : ['#FDFEFF', '#E8F4FF', '#A9D4FF']}
        start={{ x: 0.12, y: 0 }}
        end={{ x: 0.88, y: 1 }}
        style={[
          styles.outerShell,
          {
            borderRadius: outerRadius,
            borderColor: dark ? 'rgba(145, 210, 255, 0.28)' : 'rgba(13, 108, 207, 0.14)',
          },
        ]}
      >
        {photoURL ? (
          <Image
            source={{ uri: photoURL }}
            style={{ width: innerSize, height: innerSize, borderRadius: innerRadius }}
          />
        ) : (
          <View
            style={[
              styles.innerCore,
              {
                width: innerSize,
                height: innerSize,
                borderRadius: innerRadius,
                backgroundColor: dark ? 'rgba(3, 11, 20, 0.9)' : 'rgba(255, 255, 255, 0.92)',
                borderColor: dark ? 'rgba(147, 213, 255, 0.14)' : 'rgba(13, 108, 207, 0.12)',
              },
            ]}
          >
            <Text
              style={[
                styles.initial,
                {
                  color: dark ? '#EAF7FF' : '#0E66C4',
                  fontSize: size >= 46 ? 15 : 14,
                },
              ]}
            >
              {(initial || 'U').slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    shadowColor: '#04111C',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  outerShell: {
    flex: 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCore: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  initial: {
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});
