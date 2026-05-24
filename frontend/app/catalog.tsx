import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface Product {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  barcode: string;
  article_number: string;
  price: number;
  image_base64: string;
}

export default function CatalogScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/products`);
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      console.error('Error loading products:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить товары');
    } finally {
      setIsLoading(false);
    }
  };

  const searchProducts = async (query: string) => {
    if (!query.trim()) {
      loadProducts();
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/products/search/text?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      console.error('Error searching products:', error);
      Alert.alert('Ошибка', 'Не удалось выполнить поиск');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text.length > 2 || text.length === 0) {
      searchProducts(text);
    }
  };

  const renderProductCard = ({ item }: { item: Product }) => (
    <TouchableOpacity
      style={styles.productCard}
      activeOpacity={0.7}
      onPress={() => router.push({ pathname: '/product-detail', params: { productId: item.id } })}
    >
      <Image
        source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }}
        style={styles.productImage}
        resizeMode="cover"
      />
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.productCategory}>{item.category} • {item.subcategory}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.productPrice}>{item.price.toLocaleString('ru-RU')} ₸</Text>
          <Ionicons name="chevron-forward" size={20} color="#667eea" />
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>Каталог товаров</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6c757d" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск товаров..."
          value={searchQuery}
          onChangeText={handleSearch}
          placeholderTextColor="#adb5bd"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={20} color="#6c757d" />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
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
        </View>
      ) : (
        <FlatList
          data={products}
          renderItem={renderProductCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'white',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  productCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#f8f9fa',
  },
  productInfo: {
    padding: 16,
  },
  productName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  productCategory: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#667eea',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
  },
});
