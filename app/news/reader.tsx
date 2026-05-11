import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../context/ThemeContext';
import { analyticsService } from '../../services/analyticsService';
import { getCachedArticleHtml, prefetchArticleHtml } from '../../services/articleCache';

export default function ArticleViewer() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isDark } = useTheme();
  const url = typeof params.url === 'string' ? params.url : '';
  const title = typeof params.title === 'string' ? params.title : 'Article';
  const insets = useSafeAreaInsets();
  const initialCachedHtml = useMemo(() => (url ? getCachedArticleHtml(url) : null), [url]);
  const [cachedHtml, setCachedHtml] = useState<string | null>(initialCachedHtml);
  const hasCachedHtml = Boolean(cachedHtml);
  const [loading, setLoading] = useState(!hasCachedHtml);
  const [pageLoaded, setPageLoaded] = useState(hasCachedHtml);
  const [showFallback, setShowFallback] = useState(false);
  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#050B14',
            card: '#050B14',
            text: '#F8FBFF',
            subtext: '#94A3B8',
            border: '#1E293B',
            button: '#E5EEF8',
            buttonText: '#111827',
          }
        : {
            background: '#FFFFFF',
            card: '#FFFFFF',
            text: '#111827',
            subtext: '#6B7280',
            border: '#E5E7EB',
            button: '#111827',
            buttonText: '#FFFFFF',
          },
    [isDark]
  );

  const themeInjection = useMemo(
    () => `
      (function() {
        try {
          var root = document.documentElement;
          root.setAttribute('data-theme', '${isDark ? 'dark' : 'light'}');
          document.body.style.backgroundColor = '${isDark ? '#050B14' : '#FFFFFF'}';
          document.body.style.color = '${isDark ? '#E5EEF8' : '#111827'}';
        } catch (e) {}
        true;
      })();
    `,
    [isDark]
  );

  useEffect(() => {
    const nextCached = url ? getCachedArticleHtml(url) : null;
    setCachedHtml(nextCached);
    const isCached = Boolean(nextCached);
    setLoading(!isCached);
    setPageLoaded(isCached);
    setShowFallback(false);
    if (!url || isCached) return;
    void prefetchArticleHtml(url).then(() => {
      const warmed = getCachedArticleHtml(url);
      if (warmed) {
        setCachedHtml(warmed);
        setLoading(false);
      }
    });
    const timeout = setTimeout(() => setShowFallback(true), 6000);
    return () => clearTimeout(timeout);
  }, [url]);

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), backgroundColor: palette.card, borderBottomColor: palette.border }]}>
      <View style={styles.headerSide}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </Pressable>
      </View>
      <View style={styles.headerCenter}>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: palette.text }]}>
          {title || 'Article'}
        </Text>
      </View>
      <View style={styles.headerSide}>
        {url && loading ? <ActivityIndicator size="small" color={palette.subtext} /> : null}
      </View>
    </View>
  );

  if (!url) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
        {renderHeader()}
        <View style={styles.fallback}>
          <Text style={[styles.fallbackText, { color: palette.subtext }]}>Unable to open article.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
        {renderHeader()}
        <View style={styles.fallback}>
          <Text style={[styles.fallbackText, { color: palette.subtext }]}>Article viewing is only available in the app.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderLoadingState = () => (
    <View style={styles.loadingOverlay}>
      <ActivityIndicator size="small" color={palette.subtext} />
      {showFallback && (
        <Pressable style={styles.openExternalButton} onPress={() => {
          analyticsService.track('article_open_external', { url });
          Linking.openURL(url);
        }}>
          <Text style={[styles.openExternalText, { color: palette.buttonText }]}>Open in Browser</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['bottom']}>
      {renderHeader()}
      <View style={[styles.webviewContainer, { backgroundColor: palette.background }]}>
        <WebView
          source={cachedHtml ? { html: cachedHtml, baseUrl: url } : { uri: url }}
          cacheEnabled
          startInLoadingState={false}
          setSupportMultipleWindows={false}
          style={[styles.webview, { backgroundColor: palette.background }]}
          onLoadStart={() => {
            setLoading(true);
            if (hasCachedHtml) setPageLoaded(false);
          }}
          cacheMode={Platform.OS === 'android' ? 'LOAD_CACHE_ELSE_NETWORK' : undefined}
          injectedJavaScriptBeforeContentLoaded={themeInjection}
          injectedJavaScript={themeInjection}
          onLoadEnd={() => {
            setLoading(false);
            setPageLoaded(true);
            analyticsService.track(hasCachedHtml ? 'article_load_success' : 'article_load_fallback', { url });
          }}
          onError={() => {
            setLoading(false);
            setPageLoaded(false);
            analyticsService.track('article_load_fallback', { url, reason: 'webview_error' });
          }}
        />
        {!pageLoaded && showFallback && renderLoadingState()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF'
  },
  header: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB'
  },
  headerSide: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  backButton: {
    width: 44,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827'
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF'
  },
  webview: {
    backgroundColor: '#FFFFFF'
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24
  },
  openExternalButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#111827'
  },
  openExternalText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700'
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  fallbackText: {
    color: '#6B7280',
    fontSize: 16,
    textAlign: 'center'
  }
});
