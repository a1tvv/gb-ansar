import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  FlatList,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ImageBackground,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const PAGE_SIZE = 20;
const BACKGROUND_IMAGE_URL = 'https://ansar-home.ams3.cdn.digitaloceanspaces.com/katalog_bg.jpg';

interface Product {
  id: string;
  name: string;
  category?: string;
  subcategory?: string;
  barcode?: string;
  article_number?: string;
  price: number;
  images: string[];
}

const SkeletonCard = () => (
  <View style={styles.productCard}>
    <View style={[styles.productImage, styles.skeleton]} />
    <View style={styles.productInfo}>
      <View style={[styles.skeletonLine, { width: '80%', height: 14 }]} />
      <View style={[styles.skeletonLine, { width: '50%', height: 12, marginTop: 8 }]} />
      <View style={[styles.skeletonLine, { width: '40%', height: 16, marginTop: 12 }]} />
    </View>
  </View>
);

function getPageNumbers(current: number, total: number): (number | 'dots')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | 'dots')[] = [];
  pages.push(1);
  if (current > 3) pages.push('dots');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('dots');
  pages.push(total);
  return pages;
}

export default function CatalogScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const flatListRef = useRef<FlatList>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(async (pageNum: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      setIsLoading(true);
      const response = await fetch(
        `${API_URL}/api/products/paged?page=${pageNum}&limit=${PAGE_SIZE}`
      );
      const data = await response.json();

      setProducts(data.items || []);
      setPage(data.page || pageNum);
      setTotalPages(data.pages || 1);
      setTotalItems(data.total || 0);

      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить товары');
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  const searchProducts = useCallback(async (query: string) => {
    if (!query.trim()) {
      loadPage(1);
      return;
    }
    try {
      setIsLoading(true);
      const response = await fetch(
        `${API_URL}/api/products/search/text?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      setProducts(data);
      setTotalPages(1);
      setTotalItems(data.length);
      setPage(1);
    } catch {
      Alert.alert('Ошибка', 'Не удалось выполнить поиск');
    } finally {
      setIsLoading(false);
    }
  }, [loadPage]);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      if (text.length > 1 || text.length === 0) {
        searchProducts(text);
      }
    }, 350);
  };

  useFocusEffect(
    useCallback(() => {
      loadPage(1);
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadPage(page);
  };

  const goToPage = (p: number) => {
    if (p === page || p < 1 || p > totalPages) return;
    loadPage(p);
  };

  const renderProductCard = ({ item }: { item: Product }) => {
    const mainImage = item.images && item.images.length > 0 ? item.images[0] : null;
    return (
      <TouchableOpacity
        style={styles.productCard}
        activeOpacity={0.7}
        onPress={() =>
          router.push({ pathname: '/product-detail', params: { productId: item.id } })
        }
        testID={`product-${item.id}`}
      >
        {mainImage ? (
          <Image
            source={{
              uri: mainImage.startsWith('http')
                ? mainImage
                : `data:image/jpeg;base64,${mainImage}`,
            }}
            style={styles.productImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.productImage, styles.noImage]}>
            <Ionicons name="image-outline" size={40} color="#adb5bd" />
          </View>
        )}
        {item.images && item.images.length > 1 && (
          <View style={styles.photoCount}>
            <Ionicons name="images" size={10} color="white" />
            <Text style={styles.photoCountText}>{item.images.length}</Text>
          </View>
        )}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>
          {(item.category || item.subcategory) && (
            <Text style={styles.productCategory} numberOfLines={1}>
              {[item.category, item.subcategory].filter(Boolean).join(' • ')}
            </Text>
          )}
          <View style={styles.priceRow}>
            <Text style={styles.productPrice}>{item.price.toLocaleString('ru-RU')} ₸</Text>
            <Ionicons name="chevron-forward" size={16} color="#667eea" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSkeletons = () => (
    <View style={styles.skeletonGrid}>
      {[...Array(6)].map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );

  const renderPagination = () => {
    if (searchQuery.trim() || totalPages <= 1) return null;

    const pages = getPageNumbers(page, totalPages);

    return (
      <View style={styles.paginationWrap}>
        <Text style={styles.paginationInfo}>
          Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalItems)} из {totalItems}
        </Text>
        <View style={styles.paginationRow}>
          <TouchableOpacity
            style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
            onPress={() => goToPage(page - 1)}
            disabled={page === 1}
          >
            <Ionicons name="chevron-back" size={18} color={page === 1 ? '#adb5bd' : '#667eea'} />
          </TouchableOpacity>

          {pages.map((p, idx) =>
            p === 'dots' ? (
              <Text key={`dots-${idx}`} style={styles.pageDots}>…</Text>
            ) : (
              <TouchableOpacity
                key={p}
                style={[styles.pageBtn, p === page && styles.pageBtnActive]}
                onPress={() => goToPage(p)}
              >
                <Text style={[styles.pageBtnText, p === page && styles.pageBtnTextActive]}>
                  {p}
                </Text>
              </TouchableOpacity>
            )
          )}

          <TouchableOpacity
            style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
            onPress={() => goToPage(page + 1)}
            disabled={page === totalPages}
          >
            <Ionicons
              name="chevron-forward"
              size={18}
              color={page === totalPages ? '#adb5bd' : '#667eea'}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ImageBackground
      source={{ uri: BACKGROUND_IMAGE_URL }}
      style={styles.background}
      resizeMode="cover"
    >
      {/* Затемняющий слой поверх фона, чтобы карточки читались */}
      <View style={styles.overlay} />

      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Каталог товаров</Text>
          <TouchableOpacity
            style={styles.barcodeBtn}
            onPress={() => router.push('/barcode-scanner')}
            testID="catalog-barcode-btn"
          >
            <Ionicons name="barcode" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#fff" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск товаров..."
            value={searchQuery}
            onChangeText={handleSearch}
            placeholderTextColor="rgba(255, 255, 255, 0.7)"
            testID="search-input"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {isLoading && !refreshing ? (
          renderSkeletons()
        ) : products.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={80} color="rgba(255,255,255,0.5)" />
            <Text style={styles.emptyTitle}>Товары не найдены</Text>
            <Text style={styles.emptyText}>
              {searchQuery ? 'Попробуйте изменить запрос' : 'Каталог пока пуст'}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={products}
            renderItem={renderProductCard}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
            }
            ListFooterComponent={renderPagination}
          />
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)', // затемнение, чтобы белые карточки читались
  },
  container: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  barcodeBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  title: {
    fontSize: 20, fontWeight: 'bold', color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    marginHorizontal: 16, marginVertical: 16, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  searchIcon: { marginRight: 12 },
  searchInput: { flex: 1, fontSize: 16, color: '#fff', fontWeight: '500' },

  listContent: { paddingHorizontal: 8, paddingBottom: 24 },
  row: { justifyContent: 'space-between', paddingHorizontal: 8 },
  productCard: {
    backgroundColor: 'white', borderRadius: 12, marginBottom: 12,
    width: '48%', overflow: 'hidden', position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  productImage: { width: '100%', height: 185, backgroundColor: '#f8f9fa' },
  noImage: { alignItems: 'center', justifyContent: 'center' },
  photoCount: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  photoCountText: { color: 'white', fontSize: 10, fontWeight: '600' },
  productInfo: { padding: 10, flex: 1, justifyContent: 'space-between' },
  productName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
  productCategory: { fontSize: 12, color: '#6c757d', marginBottom: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
  productPrice: { fontSize: 16, fontWeight: 'bold', color: '#667eea' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: {
    fontSize: 24, fontWeight: 'bold', color: '#fff', marginTop: 16, marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  emptyText: {
    fontSize: 16, color: 'rgba(255, 255, 255, 0.85)', textAlign: 'center', marginBottom: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  // Pagination
  paginationWrap: {
    paddingVertical: 20, alignItems: 'center', gap: 12,
  },
  paginationInfo: {
    fontSize: 12, color: 'rgba(255, 255, 255, 0.85)',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  paginationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    justifyContent: 'center', paddingHorizontal: 8,
  },
  pageBtn: {
    minWidth: 36, height: 36, borderRadius: 8,
    backgroundColor: 'white',
    borderWidth: 1, borderColor: 'rgba(102, 126, 234, 0.2)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pageBtnActive: {
    backgroundColor: '#667eea', borderColor: '#667eea',
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    fontSize: 14, fontWeight: '600', color: '#667eea',
  },
  pageBtnTextActive: {
    color: 'white',
  },
  pageDots: {
    fontSize: 16, color: 'rgba(255, 255, 255, 0.7)', paddingHorizontal: 4,
  },

  // Skeleton
  skeletonGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', paddingHorizontal: 16,
  },
  skeleton: { backgroundColor: '#e9ecef' },
  skeletonLine: { backgroundColor: '#e9ecef', borderRadius: 4 },
});