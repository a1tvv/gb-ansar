import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
  Linking,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Product {
  id: string;
  name: string;
  price: number;
  images: string[];
}

export default function HomeScreen() {
  const router = useRouter();
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    if ((window as any).deferredPWAPrompt) {
      setShowInstallBanner(true);
    }

    const onInstallable = () => setShowInstallBanner(true);
    const onInstalled = () => {
      setShowInstallBanner(false);
      setIsInstalled(true);
    };

    window.addEventListener('pwa-installable', onInstallable);
    window.addEventListener('pwa-installed', onInstalled);

    return () => {
      window.removeEventListener('pwa-installable', onInstallable);
      window.removeEventListener('pwa-installed', onInstalled);
    };
  }, []);

  // Загружаем "Интересное" при каждом входе на экран
  const loadFeatured = useCallback(async () => {
    try {
      setFeaturedLoading(true);
      const [latestResp, randomResp] = await Promise.all([
        fetch(`${API_URL}/api/products?limit=4`),
        fetch(`${API_URL}/api/products/random?limit=4`),
      ]);
      const latest: Product[] = await latestResp.json();
      const random: Product[] = await randomResp.json();

      // Убираем дубли (если случайный совпал со свежим)
      const seenIds = new Set(latest.map((p) => p.id));
      const uniqueRandom = random.filter((p) => !seenIds.has(p.id));
      setFeaturedProducts([...latest, ...uniqueRandom].slice(0, 8));
    } catch (e) {
      setFeaturedProducts([]);
    } finally {
      setFeaturedLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFeatured();
    }, [loadFeatured])
  );

  const handleInstall = async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const prompt = (window as any).deferredPWAPrompt;
    if (!prompt) return;
    prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    (window as any).deferredPWAPrompt = null;
  };

  const submitSearch = () => {
    const q = searchQuery.trim();
    if (!q) return;
    router.push({ pathname: '/catalog', params: { q } });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Хедер */}
        <View style={styles.header}>
          <Text style={styles.title}>Ansar HomeWear</Text>
          <Text style={styles.subtitle}>Каталог и поиск товаров</Text>
        </View>

        {showInstallBanner && Platform.OS === 'web' && (
          <TouchableOpacity
            style={styles.installBanner}
            onPress={handleInstall}
            activeOpacity={0.8}
            testID="install-pwa-btn"
          >
            <View style={styles.installIconWrap}>
              <Ionicons name="download-outline" size={20} color="#4F46E5" />
            </View>
            <View style={styles.installContent}>
              <Text style={styles.installTitle}>Установить на телефон</Text>
              <Text style={styles.installSubtitle}>Быстрый доступ</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        {/* Две крупные квадратные плитки */}
        <View style={styles.tilesRow}>
          <TouchableOpacity
            style={[styles.bigTile, { backgroundColor: '#4F46E5' }]}
            onPress={() => router.push('/camera')}
            activeOpacity={0.85}
            testID="menu-1"
          >
            <View style={styles.bigTileIconWrap}>
              <Ionicons name="camera" size={26} color="#fff" />
            </View>
            <View style={styles.bigTileTextWrap}>
              <Text style={styles.bigTileTitle}>Поиск по фото</Text>
              <Text style={styles.bigTileSubtitle}>Сфотографируйте товар</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.bigTile, { backgroundColor: '#059669' }]}
            onPress={() => router.push('/barcode-scanner')}
            activeOpacity={0.85}
            testID="menu-2"
          >
            <View style={styles.bigTileIconWrap}>
              <Ionicons name="barcode" size={26} color="#fff" />
            </View>
            <View style={styles.bigTileTextWrap}>
              <Text style={styles.bigTileTitle}>Сканер кода</Text>
              <Text style={styles.bigTileSubtitle}>Штрихкод с упаковки</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Каталог + pending — компактный список */}
        <TouchableOpacity
          style={styles.listRow}
          onPress={() => router.push('/catalog')}
          activeOpacity={0.7}
          testID="menu-3"
        >
          <View style={[styles.listIcon, { backgroundColor: '#F3F4F6' }]}>
            <Ionicons name="grid-outline" size={20} color="#374151" />
          </View>
          <View style={styles.listContent}>
            <Text style={styles.listTitle}>Каталог товаров</Text>
            <Text style={styles.listHint}>Все товары склада</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        <View style={styles.groupedList}>
          <TouchableOpacity
            style={[styles.groupedRow, styles.groupedDivider]}
            onPress={() => router.push('/submit-pending')}
            activeOpacity={0.7}
            testID="menu-4"
          >
            <View style={[styles.groupedIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="add" size={18} color="#D97706" />
            </View>
            <View style={styles.groupedContent}>
              <Text style={styles.groupedTitle}>Отправить товар</Text>
              <Text style={styles.groupedHint}>Проблемный товар админу</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.groupedRow}
            onPress={() => router.push('/pending-list')}
            activeOpacity={0.7}
            testID="menu-5"
          >
            <View style={[styles.groupedIcon, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="clipboard-outline" size={18} color="#2563EB" />
            </View>
            <View style={styles.groupedContent}>
              <Text style={styles.groupedTitle}>Заявки на рассмотрение</Text>
              <Text style={styles.groupedHint}>Для админов склада</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Строка поиска */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по названию или артикулу"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={submitSearch}>
              <Ionicons name="arrow-forward" size={18} color="#4F46E5" />
            </TouchableOpacity>
          )}
        </View>

        {/* Интересное */}
        <Text style={styles.sectionLabel}>ИНТЕРЕСНОЕ</Text>
        {featuredLoading ? (
          <View style={styles.featuredLoading}>
            <ActivityIndicator size="small" color="#4F46E5" />
          </View>
        ) : featuredProducts.length === 0 ? (
          <View style={styles.featuredEmpty}>
            <Text style={styles.featuredEmptyText}>Товары появятся здесь</Text>
          </View>
        ) : (
          <View style={styles.featuredGrid}>
            {featuredProducts.map((p) => {
              const img = p.images && p.images[0];
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.featuredCard}
                  activeOpacity={0.75}
                  onPress={() =>
                    router.push({ pathname: '/product-detail', params: { productId: p.id } })
                  }
                >
                  {img ? (
                    <Image
                      source={{
                        uri: img.startsWith('http') ? img : `data:image/jpeg;base64,${img}`,
                      }}
                      style={styles.featuredImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.featuredImage, styles.featuredNoImage]}>
                      <Ionicons name="image-outline" size={28} color="#adb5bd" />
                    </View>
                  )}
                  <View style={styles.featuredInfo}>
                    <Text style={styles.featuredName} numberOfLines={2}>
                      {p.name}
                    </Text>
                    <Text style={styles.featuredPrice}>
                      {p.price.toLocaleString('ru-RU')} ₸
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Футер */}
        <View style={styles.footer}>
          {isInstalled ? (
            <Text style={styles.footerText}>✓ Установлено как приложение · v2.0</Text>
          ) : (
            <Text style={styles.footerText}>
              Разработчики{' '}
              <Text
                style={styles.devLink}
                onPress={() => Linking.openURL('https://instagram.com/ab.dussi')}
              >
                ab.dussi
              </Text>
              {', '}
              <Text
                style={styles.devLink}
                onPress={() => Linking.openURL('https://instagram.com/du.z.r')}
              >
                du.z.r
              </Text>
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  scrollContent: { paddingBottom: 24, paddingHorizontal: 20 },

  header: { paddingTop: 20, paddingBottom: 16 },
  title: {
    fontSize: 24, fontWeight: '700', color: '#111827', letterSpacing: -0.5,
  },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },

  installBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 14, backgroundColor: 'white', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 12, gap: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  installIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
  },
  installContent: { flex: 1 },
  installTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  installSubtitle: { fontSize: 11, color: '#6B7280', marginTop: 1 },

  // Две крупные плитки
  tilesRow: {
    flexDirection: 'row', gap: 10, marginBottom: 12,
  },
  bigTile: {
    flex: 1, aspectRatio: 1, borderRadius: 16,
    padding: 14, justifyContent: 'space-between',
  },
  bigTileIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  bigTileTextWrap: { marginTop: 4 },
  bigTileTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  bigTileSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },

  // Каталог (одиночная строка)
  listRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', borderRadius: 12,
    padding: 12, gap: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  listIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  listContent: { flex: 1 },
  listTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  listHint: { fontSize: 11, color: '#6B7280', marginTop: 1 },

  // Группа pending
  groupedList: {
    backgroundColor: 'white', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
    marginBottom: 14,
  },
  groupedRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, gap: 12,
  },
  groupedDivider: {
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  groupedIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  groupedContent: { flex: 1 },
  groupedTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  groupedHint: { fontSize: 11, color: '#6B7280', marginTop: 1 },

  // Поисковая строка
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, gap: 8,
    borderWidth: 1, borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: '#111827',
    padding: 0,
  },

  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#6B7280',
    letterSpacing: 0.5, marginBottom: 10, paddingHorizontal: 4,
  },

  featuredLoading: {
    paddingVertical: 32, alignItems: 'center',
  },
  featuredEmpty: {
    paddingVertical: 24, alignItems: 'center',
    backgroundColor: 'white', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  featuredEmptyText: { fontSize: 13, color: '#9CA3AF' },

  featuredGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  featuredCard: {
    width: '48%', backgroundColor: 'white',
    borderRadius: 12, marginBottom: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  featuredImage: {
    width: '100%', aspectRatio: 1, backgroundColor: '#F3F4F6',
  },
  featuredNoImage: {
    alignItems: 'center', justifyContent: 'center',
  },
  featuredInfo: { padding: 10 },
  featuredName: {
    fontSize: 13, fontWeight: '600', color: '#111827',
    marginBottom: 4,
  },
  featuredPrice: { fontSize: 14, fontWeight: '700', color: '#4F46E5' },

  footer: {
    alignItems: 'center', paddingTop: 12,
  },
  footerText: { fontSize: 11, color: '#9CA3AF' },
  devLink: { color: '#4F46E5', fontWeight: '600' },
});