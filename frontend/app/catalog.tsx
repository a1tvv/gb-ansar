import React, { useState, useCallback } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
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

export default function CatalogScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadProducts = useCallback(async (reset = false) => {
    const currentSkip = reset ? 0 : skip;
    if (!reset && (isLoadingMore || !hasMore)) return;

    try {
      if (reset) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      const response = await fetch(
        `${API_URL}/api/products?skip=${currentSkip}&limit=${PAGE_SIZE}`
      );
      const data = await response.json();

      if (reset) {
        setProducts(data);
        setSkip(PAGE_SIZE);
      } else {
        setProducts(prev => [...prev, ...data]);
        setSkip(prev => prev + PAGE_SIZE);
      }

      setHasMore(data.length === PAGE_SIZE);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить товары');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      setRefreshing(false);
    }
  }, [skip, isLoadingMore, hasMore]);

  useFocusEffect(
    useCallback(() => {
      setSkip(0);
      setHasMore(true);
      loadProducts(true);
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    setSkip(0);
    setHasMore(true);
    loadProducts(true);
  };

  const searchProducts = async (query: string) => {
    if (!query.trim()) {
      setSkip(0);
      setHasMore(true);
      loadProducts(true);
      return;
    }
    try {
      setIsLoading(true);
      const response = await fetch(
        `${API_URL}/api/products/search/text?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      setProducts(data);
      setHasMore(false);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось выполнить поиск');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text.length > 1 || text.length === 0) {
      searchProducts(text);
    }
  };

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#667eea" />
        <Text style={styles.footerLoaderText}>Загрузка...</Text>
      </View>
    );
  };

  const renderProductCard = ({ item }: { item: Product }) => {
    const mainImage = item.images && item.images.length > 0 ? item.images[0] : null;
    return (
      <TouchableOpacity
        style={styles.productCard}
        activeOpacity={0.7}
        onPress={() => router.push({ pathname: '/product-detail', params: { productId: item.id } })}
        testID={`product-${item.id}`}
      >
        {mainImage ? (
          <Image
            source={{
              uri: mainImage.startsWith('http') ? mainImage : `data:image/jpeg;base64,${mainImage}`
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
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>Каталог товаров</Text>
        <TouchableOpacity
          style={styles.barcodeBtn}
          onPress={() => router.push('/barcode-scanner')}
          testID="catalog-barcode-btn"
        >
          <Ionicons name="barcode" size={24} color="#667eea" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#667eea" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск товаров..."
          value={searchQuery}
          onChangeText={handleSearch}
          placeholderTextColor="rgba(102, 126, 234, 0.6)"
          testID="search-input"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={20} color="#667eea" />
          </TouchableOpacity>
        )}
      </View>

      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>Загрузка товаров...</Text>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={80} color="#dee2e6" />
          <Text style={styles.emptyTitle}>Товары не найдены</Text>
          <Text style={styles.emptyText}>
            {searchQuery ? 'Попробуйте изменить запрос' : 'Добавьте первый товар в каталог'}
          </Text>
          {!searchQuery && (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.push('/add-product')}
            >
              <Ionicons name="add" size={20} color="white" />
              <Text style={styles.addBtnText}>Добавить товар</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={products}
          renderItem={renderProductCard}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#667eea" />
          }
          onEndReached={() => {
            if (!searchQuery && hasMore && !isLoadingMore) {
              loadProducts(false);
            }
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16, backgroundColor: 'white',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  barcodeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  
  // Обновленный фиолетовый поисковик
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: 'rgba(102, 126, 234, 0.08)', 
    marginHorizontal: 16, marginVertical: 16, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.2)',
  },
  searchIcon: { marginRight: 12 },
  searchInput: { flex: 1, fontSize: 16, color: '#667eea', fontWeight: '500' },
  
  // Сетка и карточки
  listContent: { paddingHorizontal: 8, paddingBottom: 24 },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  productCard: {
    backgroundColor: 'white', 
    borderRadius: 12, 
    marginBottom: 12,
    width: '48%',
    overflow: 'hidden', 
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
  
  // Системные контейнеры
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#6c757d' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 16, color: '#6c757d', textAlign: 'center', marginBottom: 24 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#667eea', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12,
  },
  addBtnText: { color: 'white', fontSize: 16, fontWeight: '600' },
  footerLoader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 8,
  },
  footerLoaderText: { fontSize: 14, color: '#6c757d' },
});