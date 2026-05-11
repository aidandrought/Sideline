import { Platform } from 'react-native';

type ShadowOptions = {
  x?: number;
  y: number;
  blur: number;
  opacity: number;
  color?: string;
  elevation?: number;
};

type TextShadowOptions = {
  x?: number;
  y: number;
  blur: number;
  color: string;
};

export function shadow(options: ShadowOptions) {
  const {
    x = 0,
    y,
    blur,
    opacity,
    color = '#000',
    elevation = 2
  } = options;

  if (Platform.OS === 'web') {
    return {
      boxShadow: `${x}px ${y}px ${blur}px rgba(0,0,0,${opacity})`
    };
  }

  return {
    shadowColor: color,
    shadowOffset: { width: x, height: y },
    shadowOpacity: opacity,
    shadowRadius: blur,
    elevation
  };
}

export function textShadow(options: TextShadowOptions) {
  const { x = 0, y, blur, color } = options;

  if (Platform.OS === 'web') {
    return {
      textShadow: `${x}px ${y}px ${blur}px ${color}`
    };
  }

  return {
    textShadowColor: color,
    textShadowOffset: { width: x, height: y },
    textShadowRadius: blur
  };
}
