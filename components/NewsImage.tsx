import { Image, ImageResizeMode, StyleProp, View, ViewStyle } from 'react-native';
import { useEffect, useState } from 'react';
import { analyticsService } from '../services/analyticsService';

type Props = {
  uri?: string;
  style: StyleProp<ViewStyle> | any;
  resizeMode?: ImageResizeMode;
  rounded?: boolean;
};

const toProxyImageUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
  return `https://images.weserv.nl/?url=${encodeURIComponent(withoutProtocol)}&w=1400&output=jpg`;
};

export function NewsImage({ uri, style, resizeMode = 'cover' }: Props) {
  const [resolvedUri, setResolvedUri] = useState(uri || '');
  const [triedProxy, setTriedProxy] = useState(false);
  const [hardFailed, setHardFailed] = useState(false);

  useEffect(() => {
    setResolvedUri(uri || '');
    setTriedProxy(false);
    setHardFailed(false);
  }, [uri]);

  if (!uri) {
    return <View style={[style, styles.placeholder]} />;
  }

  if (hardFailed || !resolvedUri) {
    return <View style={[style, styles.placeholder]} />;
  }

  return (
    <Image
      source={{ uri: resolvedUri }}
      style={style}
      resizeMode={resizeMode}
      onError={() => {
        if (!triedProxy && uri) {
          const proxied = toProxyImageUrl(uri);
          if (proxied && proxied !== resolvedUri) {
            setResolvedUri(proxied);
            setTriedProxy(true);
            return;
          }
        }
        setHardFailed(true);
        analyticsService.track('image_load_failed', { type: 'news', host: (() => { try { return new URL(uri || '').hostname; } catch { return ''; } })() });
      }}
    />
  );
}

const styles = {
  placeholder: {
    backgroundColor: '#111827',
  } satisfies ViewStyle,
};
