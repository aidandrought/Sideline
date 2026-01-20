import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_CONFIG } from '../../constants/config';

interface ExtractedArticle {
  title?: string;
  author?: string;
  publishedAt?: string;
  source?: string;
  leadImageUrl?: string;
  contentHtml?: string;
  contentText?: string;
  url: string;
}

const toParagraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

const formatDate = (value?: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString();
};

export default function ArticleReader() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerOffset = insets.top + 54;
  const params = useLocalSearchParams();
  const url = typeof params.url === 'string' ? params.url : '';
  const fallbackTitle = typeof params.title === 'string' ? params.title : '';
  const fallbackSource = typeof params.source === 'string' ? params.source : '';
  const fallbackAuthor = typeof params.author === 'string' ? params.author : '';
  const fallbackPublishedAt = typeof params.publishedAt === 'string' ? params.publishedAt : '';
  const fallbackImageUrl = typeof params.imageUrl === 'string' ? params.imageUrl : '';

  const [state, setState] = useState<'loading' | 'native' | 'web' | 'error'>('loading');
  const [article, setArticle] = useState<ExtractedArticle | null>(null);
  const [error, setError] = useState<string>('');
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);

  const effectiveArticle = useMemo(() => {
    return article || {
      title: fallbackTitle,
      author: fallbackAuthor,
      publishedAt: fallbackPublishedAt,
      source: fallbackSource,
      leadImageUrl: fallbackImageUrl,
      contentText: '',
      url
    };
  }, [article, fallbackAuthor, fallbackImageUrl, fallbackPublishedAt, fallbackSource, fallbackTitle, url]);

  useEffect(() => {
    if (!url) {
      setError('Missing article URL.');
      setState('error');
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const fetchArticle = async () => {
      try {
        const response = await fetch(`${API_CONFIG.EXTRACTOR_BASE_URL}/api/article/extract`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error('Extraction failed');
        }

        const data = (await response.json()) as ExtractedArticle;
        if (!data?.contentHtml && !data?.contentText) {
          throw new Error('No content');
        }

        if (isActive) {
          setArticle(data);
          setState('native');
        }
      } catch (err) {
        if (isActive) {
          setState('web');
        }
      } finally {
        clearTimeout(timeout);
      }
    };

    fetchArticle();

    return () => {
      isActive = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [url]);

  useEffect(() => {
    if (Platform.OS !== 'web' || state !== 'web') return;
    setIframeReady(false);
    setIframeFailed(false);
    const timeout = setTimeout(() => {
      setIframeFailed(true);
    }, 7000);
    return () => clearTimeout(timeout);
  }, [state, url]);

  const onShare = async () => {
    if (!url) return;
    try {
      await Share.share({ title: effectiveArticle.title || 'Article', message: url });
    } catch (err) {
      console.log('Share failed');
    }
  };

  const onOpenInBrowser = async () => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch (err) {
      console.log('Failed to open browser');
    }
  };

  const onOpenInNewTab = () => {
    if (typeof window !== 'undefined' && url) {
      window.open(url, '_blank');
    }
  };

  const renderHeader = () => (
    <View style={[styles.overlayHeader, { paddingTop: insets.top }]}> 
      <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backArrow}>←</Text>
      </Pressable>
      <View style={styles.headerSpacer} />
      <Pressable onPress={onShare} style={styles.shareButton}>
        <Text style={styles.shareText}>Share</Text>
      </Pressable>
    </View>
  );

  if (state === 'loading') {
    return (
      <View style={styles.root}>
        {renderHeader()}
        <View style={[styles.loadingContainer, { paddingTop: headerOffset }]}> 
          <ActivityIndicator size="large" color="#1a1a1a" />
          <Text style={styles.loadingText}>Loading article...</Text>
        </View>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.root}>
        {renderHeader()}
        <View style={[styles.loadingContainer, { paddingTop: headerOffset }]}> 
          <Text style={styles.errorText}>{error || 'Unable to load article.'}</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (state === 'web') {
    return (
      <View style={styles.root}>
        {renderHeader()}
        <View style={[styles.webContainer, { paddingTop: headerOffset }]}> 
          <View style={styles.webBanner}>
            <Text style={styles.webBannerText}>Showing web version</Text>
            <Pressable onPress={onShare} style={styles.bannerButton}>
              <Text style={styles.bannerButtonText}>Share</Text>
            </Pressable>
          </View>
          {Platform.OS === 'web' ? (
            <View style={styles.webIframeWrapper}>
              {!iframeReady && (
                <View style={styles.webFallbackNotice}>
                  <ActivityIndicator size="small" color="#1a1a1a" />
                  <Text style={styles.webFallbackText}>Loading embedded article...</Text>
                </View>
              )}
              {iframeFailed && (
                <View style={styles.webFallbackNotice}>
                  <Text style={styles.webFallbackText}>This site blocks embedding.</Text>
                  <Pressable style={styles.primaryButton} onPress={onOpenInNewTab}>
                    <Text style={styles.primaryButtonText}>Open in new tab</Text>
                  </Pressable>
                </View>
              )}
              {!iframeFailed && (
                <iframe
                  title={effectiveArticle.title || 'Article'}
                  src={url}
                  style={styles.webIframe as any}
                  onLoad={() => setIframeReady(true)}
                  onError={() => setIframeFailed(true)}
                />
              )}
            </View>
          ) : (
            <WebView source={{ uri: url }} startInLoadingState />
          )}
        </View>
      </View>
    );
  }

  const contentText = effectiveArticle.contentText || '';
  const paragraphs = toParagraphs(contentText || '');
  const displayDate = formatDate(effectiveArticle.publishedAt);
  const meta = [effectiveArticle.source, displayDate, effectiveArticle.author]
    .filter(Boolean)
    .join(' • ');

  return (
    <View style={styles.root}>
      {renderHeader()}
      <ScrollView style={styles.container} contentContainerStyle={[styles.contentContainer, { paddingTop: headerOffset }]}> 
        <Text style={styles.title}>{effectiveArticle.title || fallbackTitle || 'Article'}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}

        {(effectiveArticle.leadImageUrl || fallbackImageUrl) ? (
          <Image
            source={{ uri: effectiveArticle.leadImageUrl || fallbackImageUrl }}
            style={styles.heroImage}
          />
        ) : null}

        {paragraphs.length > 0 ? (
          paragraphs.map((paragraph, index) => (
            <Text key={`${index}-paragraph`} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))
        ) : (
          <Text style={styles.paragraph}>Full article unavailable. Please use the web view.</Text>
        )}

        <Pressable style={styles.secondaryButton} onPress={onOpenInBrowser}>
          <Text style={styles.secondaryButtonText}>Open in browser</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40
  },
  overlayHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee'
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  backArrow: {
    fontSize: 22,
    color: '#111111'
  },
  headerSpacer: {
    flex: 1
  },
  shareButton: {
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 24
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#444444'
  },
  errorText: {
    fontSize: 16,
    color: '#c0392b',
    marginBottom: 16,
    textAlign: 'center'
  },
  shareText: {
    fontSize: 16,
    color: '#1a1a1a'
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 8
  },
  meta: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 16
  },
  heroImage: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    marginBottom: 20
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1f1f1f',
    marginBottom: 16
  },
  primaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#111111'
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600'
  },
  secondaryButton: {
    marginTop: 24,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#dddddd',
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#111111',
    fontWeight: '600'
  },
  webContainer: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  webBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  webBannerText: {
    color: '#444444',
    fontSize: 14
  },
  webIframeWrapper: {
    flex: 1
  },
  webIframe: {
    borderWidth: 0,
    width: '100%',
    height: '100%'
  },
  webFallbackNotice: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  webFallbackText: {
    color: '#444444',
    fontSize: 14
  },
  bannerButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#111111',
    borderRadius: 14
  },
  bannerButtonText: {
    color: '#ffffff',
    fontSize: 12
  }
});
