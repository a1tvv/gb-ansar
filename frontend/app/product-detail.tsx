import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const SCREEN_WIDTH = Dimensions.get('window').width;

interface Product {
  id: string;
  name: string;
  category?: string;
  subcategory?: string;
  barcode?: string;
  article_number?: string;
  price: number;
  images: string[];
  ai_features?: string;
}

export default function ProductDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [barcodeModalVisible, setBarcodeModalVisible] = useState(false);

  const loadProduct = useCallback(async (productId: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/products/${productId}`);
      if (response.ok) {
        const data = await response.json();
        setProduct(data);
      } else {
        Alert.alert('Ошибка', 'Товар не найден');
        router.back();
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить товар');
      router.back();
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      if (params.productId) {
        loadProduct(params.productId as string);
      }
    }, [params.productId, loadProduct])
  );

  const deleteProduct = async () => {
    Alert.alert(
      'Удаление товара',
      'Вы уверены, что хотите удалить этот товар?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/products/${product?.id}`, {
                method: 'DELETE',
              });
              if (response.ok) {
                Alert.alert('Успешно', 'Товар удалён', [
                  { text: 'OK', onPress: () => router.back() },
                ]);
              } else {
                Alert.alert('Ошибка', 'Не удалось удалить товар');
              }
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось удалить товар');
            }
          },
        },
      ]
    );
  };

  const onImageScroll = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentImageIndex(index);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  if (!product) return null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Модалка со штрихкодом */}
      <Modal
        visible={barcodeModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setBarcodeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setBarcodeModalVisible(false)}
            >
              <Ionicons name="close" size={28} color="#1a1a1a" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{product.name}</Text>
            <Text style={styles.modalSubtitle}>Поднесите сканер к экрану</Text>
            <Image
              source={{ uri: `https://barcodeapi.org/api/auto/${product.barcode}` }}
              style={styles.modalBarcodeImage}
              resizeMode="contain"
            />
            <Text style={styles.modalBarcodeNumber}>{product.barcode}</Text>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.imageContainer}>
          {product.images && product.images.length > 0 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onImageScroll}
              >
                {product.images.map((img, index) => (
                  <Image
                    key={index}
                    source={{
                      uri: img && img.startsWith('http') ? img : `data:image/jpeg;base64,${img}`
                    }}
                    style={styles.productImage}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
              {product.images.length > 1 && (
                <View style={styles.pagination}>
                  {product.images.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.paginationDot,
                        currentImageIndex === index && styles.paginationDotActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={[styles.productImage, styles.noImage]}>
              <Ionicons name="image-outline" size={80} color="#adb5bd" />
            </View>
          )}

          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'transparent']}
            style={styles.topGradient}
          />

          <SafeAreaView style={styles.imageHeader}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() =>
                  router.push({ pathname: '/edit-product', params: { productId: product.id } })
                }
              >
                <Ionicons name="create-outline" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerBtn} onPress={deleteProduct}>
                <Ionicons name="trash-outline" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>

        <View style={styles.content}>
          <View style={styles.headerInfo}>
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={styles.productPrice}>{product.price.toLocaleString('ru-RU')} ₸</Text>
          </View>

          {(product.category || product.subcategory) && (
            <View style={styles.section}>
              {product.category && (
                <InfoCard icon="pricetag" label="Категория" value={product.category} color="#667eea" />
              )}
              {product.subcategory && (
                <InfoCard icon="albums" label="Подкатегория" value={product.subcategory} color="#f093fb" />
              )}
            </View>
          )}

          {(product.barcode || product.article_number) && (
            <View style={styles.section}>
              {product.barcode && (
                <TouchableOpacity onPress={() => setBarcodeModalVisible(true)} activeOpacity={0.8}>
                  <View style={styles.barcodeCard}>
                    <View style={[styles.iconContainer, { backgroundColor: '#4facfe20' }]}>
                      <Ionicons name="barcode" size={24} color="#4facfe" />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Штрихкод</Text>
                      <Text style={styles.infoValue}>{product.barcode}</Text>
                    </View>
                    <View style={styles.scanBadge}>
                      <Ionicons name="scan" size={16} color="#4facfe" />
                      <Text style={styles.scanBadgeText}>Сканировать</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              {product.article_number && (
                <InfoCard
                  icon="document-text"
                  label="Артикул"
                  value={product.article_number}
                  color="#43e97b"
                />
              )}
            </View>
          )}

          {product.ai_features && (
            <View style={styles.aiSection}>
              <View style={styles.aiHeader}>
                <Ionicons name="sparkles" size={20} color="#667eea" />
                <Text style={styles.aiTitle}>AI Характеристики</Text>
              </View>
              <Text style={styles.aiText}>{product.ai_features}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const InfoCard = ({
  icon, label, value, color,
}: { icon: any; label: string; value: string; color: string }) => (
  <View style={styles.infoCard}>
    <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },
  imageContainer: { width: '100%', height: 400, position: 'relative', backgroundColor: '#000' },
  productImage: { width: SCREEN_WIDTH, height: 400 },
  noImage: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa' },
  topGradient: {
    position: 'absolute', left: 0, right: 0, top: 0, height: 100,
  },
  imageHeader: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16,
  },
  headerBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', gap: 12 },
  pagination: {
    position: 'absolute', bottom: 16, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  paginationDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  paginationDotActive: {
    backgroundColor: 'white', width: 24,
  },
  content: { padding: 24 },
  headerInfo: { marginBottom: 28 },
  productName: { fontSize: 28, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 8 },
  productPrice: { fontSize: 32, fontWeight: 'bold', color: '#667eea' },
  section: { gap: 12, marginBottom: 16 },
  infoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', padding: 20, borderRadius: 16,
  },
  barcodeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', padding: 20, borderRadius: 16,
    borderWidth: 2, borderColor: '#4facfe30',
  },
  iconContainer: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  infoContent: { flex: 1 },
  infoLabel: {
    fontSize: 12, color: '#6c757d', marginBottom: 4,
    textTransform: 'uppercase', fontWeight: '600',
  },
  infoValue: { fontSize: 18, fontWeight: '600', color: '#1a1a1a' },
  scanBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#4facfe15', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10,
  },
  scanBadgeText: { fontSize: 12, color: '#4facfe', fontWeight: '700' },
  aiSection: {
    backgroundColor: 'white', padding: 20, borderRadius: 16,
    borderWidth: 2, borderColor: '#667eea20',
  },
  aiHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  aiTitle: { fontSize: 16, fontWeight: 'bold', color: '#667eea' },
  aiText: { fontSize: 14, color: '#495057', lineHeight: 20 },

  // Модалка
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalContent: {
    backgroundColor: 'white', borderRadius: 24, padding: 32,
    width: '100%', alignItems: 'center',
  },
  modalClose: {
    position: 'absolute', top: 16, right: 16,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f8f9fa', alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20, fontWeight: 'bold', color: '#1a1a1a',
    marginBottom: 4, textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14, color: '#6c757d', marginBottom: 24,
  },
  modalBarcodeImage: {
    width: '100%', height: 150, marginBottom: 16,
  },
  modalBarcodeNumber: {
    fontSize: 22, fontWeight: '700', color: '#1a1a1a', letterSpacing: 3,
  },
});