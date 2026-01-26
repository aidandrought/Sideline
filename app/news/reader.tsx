import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, ActivityIndicator, Platform, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';

export default function ArticleViewer() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const url = typeof params.url === 'string' ? params.url : '';
  const title = typeof params.title === 'string' ? params.title : 'Article';
  const [loading, setLoading] = useState(true);

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </Pressable>
      </View>
      <View style={styles.headerCenter}>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {title || 'Article'}
        </Text>
      </View>
      <View style={styles.headerSide}>
        {url && loading ? <ActivityIndicator size="small" color="#FFF" /> : null}
      </View>
    </View>
  );

  if (!url) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>Unable to open article.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>Article viewing is only available in the app.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      <View style={styles.webviewContainer}>
        <WebView
          source={{ uri: url }}
          cacheEnabled
          startInLoadingState
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => setLoading(false)}
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#0066CC" />
              <Text style={styles.loadingText}>Loading article...</Text>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E'
  },
  header: {
    backgroundColor: '#2C2C2E',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10
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
    color: '#FFF'
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: '#1C1C1E'
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999'
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  fallbackText: {
    color: '#999',
    fontSize: 16,
    textAlign: 'center'
  }
});
