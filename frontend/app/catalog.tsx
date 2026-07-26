import React, { useState, useCallback, useRef, useEffect } from 'react';
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
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const PAGE_SIZE = 20;

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
  const params = useLocalSearchParams<{ q?: string }>();

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
  const didHandleParamRef = useRef(false);

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

  // Если пришёл ?q= из URL — подставляем и ищем
  useEffect(() => {
    if (didHandleParamRef.current) return;
    if (params.q && typeof params.q === 'string' && params.q.trim()) {
      didHandleParamRef.current = true;
      setSearchQuery(params.q);
      searchProducts(params.q);
    }
  }, [params.q, searchProducts]);

  useFocusEffect(
    useCallback(() => {
      // Если параметра нет — грузим первую страницу как обычно
      if (!params.q) {
        loadPage(1);
      }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onRefresh = () => {
    setRefreshing(true);
    if (searchQuery.trim()) {
      searchProducts(searchQuery);
    } else {
      loadPage(page);
    }
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
            <Ionicons name="chevron-forward" size={16} color="#4F46E5" />
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
            <Ionicons name="chevron-back" size={18} color={page === 1 ? '#adb5bd' : '#4F46E5'} />
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
              color={page === totalPages ? '#adb5bd' : '#4F46E5'}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Каталог товаров</Text>
        <TouchableOpacity
          style={styles.barcodeBtn}
          onPress={() => router.push('/barcode-scanner')}
          testID="catalog-barcode-btn"
        >
          <Ionicons name="barcode" size={24} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск товаров..."
          value={searchQuery}
          onChangeText={handleSearch}
          placeholderTextColor="#9CA3AF"
          testID="search-input"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {isLoading && !refreshing ? (
        renderSkeletons()
      ) : products.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={80} color="#D1D5DB" />
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
          }
          ListFooterComponent={renderPagination}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16, backgroundColor: 'white',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  barcodeBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 16, marginVertical: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
    gap: 8,
  },
  searchIcon: {},
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },

  listContent: { paddingHorizontal: 8, paddingBottom: 24 },
  row: { justifyContent: 'space-between', paddingHorizontal: 8 },
  productCard: {
    backgroundColor: 'white', borderRadius: 12, marginBottom: 12,
    width: '48%', overflow: 'hidden', position: 'relative',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  productImage: { width: '100%', height: 165, backgroundColor: '#F3F4F6' },
  noImage: { alignItems: 'center', justifyContent: 'center' },
  photoCount: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  photoCountText: { color: 'white', fontSize: 10, fontWeight: '600' },
  productInfo: { padding: 10, flex: 1, justifyContent: 'space-between' },
  productName: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 4 },
  productCategory: { fontSize: 11, color: '#6B7280', marginBottom: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
  productPrice: { fontSize: 15, fontWeight: '700', color: '#4F46E5' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24 },

  paginationWrap: { paddingVertical: 20, alignItems: 'center', gap: 12 },
  paginationInfo: { fontSize: 12, color: '#6B7280' },
  paginationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    justifyContent: 'center', paddingHorizontal: 8,
  },
  pageBtn: {
    minWidth: 36, height: 36, borderRadius: 8,
    backgroundColor: 'white',
    borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pageBtnActive: {
    backgroundColor: '#4F46E5', borderColor: '#4F46E5',
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: 14, fontWeight: '600', color: '#4F46E5' },
  pageBtnTextActive: { color: 'white' },
  pageDots: { fontSize: 16, color: '#9CA3AF', paddingHorizontal: 4 },

  skeletonGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', paddingHorizontal: 16,
  },
  skeleton: { backgroundColor: '#E5E7EB' },
  skeletonLine: { backgroundColor: '#E5E7EB', borderRadius: 4 },
});