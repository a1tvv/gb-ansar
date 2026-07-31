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
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import Barcode from './Barcode';

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
  const [copied, setCopied] = useState(false);

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

  const onImageScroll = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentImageIndex(index);
  };

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        // На нативе fallback — текст всё равно выделяемый вручную
        return;
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // молча — пользователь всегда может выделить текст руками
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
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
        animationType="fade"
        transparent={true}
        onRequestClose={() => setBarcodeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setBarcodeModalVisible(false)}
            >
              <Ionicons name="close" size={26} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{product.name}</Text>
            <Text style={styles.modalSubtitle}>Поднесите сканер к экрану</Text>

            <View style={styles.barcodeWrap}>
              <Barcode value={product.barcode || ''} height={130} />
            </View>

            <Text style={styles.modalBarcodeNumber} selectable>
              {product.barcode}
            </Text>

            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => copyToClipboard(product.barcode || '')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copied ? '#059669' : '#4F46E5'}
              />
              <Text style={[styles.copyBtnText, copied && { color: '#059669' }]}>
                {copied ? 'Скопировано' : 'Копировать'}
              </Text>
            </TouchableOpacity>
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
                      uri: img && img.startsWith('http') ? img : `data:image/jpeg;base64,${img}`,
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
              <Ionicons name="image-outline" size={80} color="#D1D5DB" />
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
          </SafeAreaView>
        </View>

        <View style={styles.content}>
          <View style={styles.headerInfo}>
            <Text style={styles.productName} selectable>{product.name}</Text>
            <Text style={styles.productPrice}>{product.price.toLocaleString('ru-RU')} ₸</Text>
          </View>

          {(product.category || product.subcategory) && (
            <View style={styles.section}>
              {product.category && (
                <InfoCard icon="pricetag" label="Категория" value={product.category} color="#4F46E5" />
              )}
              {product.subcategory && (
                <InfoCard icon="albums" label="Подкатегория" value={product.subcategory} color="#DB2777" />
              )}
            </View>
          )}

          {(product.barcode || product.article_number) && (
            <View style={styles.section}>
              {product.barcode && (
                <View style={styles.barcodeCard}>
                  <View style={[styles.iconContainer, { backgroundColor: '#DBEAFE' }]}>
                    <Ionicons name="barcode" size={24} color="#2563EB" />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>Штрихкод</Text>
                    <Text style={styles.infoValue} selectable>{product.barcode}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.scanBadge}
                    onPress={() => setBarcodeModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="scan" size={16} color="#2563EB" />
                    <Text style={styles.scanBadgeText}>Сканировать</Text>
                  </TouchableOpacity>
                </View>
              )}
              {product.article_number && (
                <InfoCard
                  icon="document-text"
                  label="Артикул"
                  value={product.article_number}
                  color="#059669"
                />
              )}
            </View>
          )}

          {product.ai_features && (
            <View style={styles.aiSection}>
              <View style={styles.aiHeader}>
                <Ionicons name="sparkles" size={20} color="#4F46E5" />
                <Text style={styles.aiTitle}>AI Характеристики</Text>
              </View>
              <Text style={styles.aiText} selectable>{product.ai_features}</Text>
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
      <Text style={styles.infoValue} selectable>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },
  imageContainer: { width: '100%', height: 400, position: 'relative', backgroundColor: '#000' },
  productImage: { width: SCREEN_WIDTH, height: 400 },
  noImage: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
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
  pagination: {
    position: 'absolute', bottom: 16, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  paginationDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  paginationDotActive: { backgroundColor: 'white', width: 24 },

  content: { padding: 20 },
  headerInfo: { marginBottom: 24 },
  productName: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 6 },
  productPrice: { fontSize: 30, fontWeight: '700', color: '#4F46E5' },
  section: { gap: 10, marginBottom: 14 },
  infoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  barcodeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  iconContainer: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  infoContent: { flex: 1 },
  infoLabel: {
    fontSize: 11, color: '#6B7280', marginBottom: 3,
    textTransform: 'uppercase', fontWeight: '600', letterSpacing: 0.3,
  },
  infoValue: { fontSize: 16, fontWeight: '600', color: '#111827' },
  scanBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 8,
  },
  scanBadgeText: { fontSize: 11, color: '#2563EB', fontWeight: '700' },
  aiSection: {
    backgroundColor: 'white', padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: '#E0E7FF',
  },
  aiHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
  },
  aiTitle: { fontSize: 15, fontWeight: '700', color: '#4F46E5' },
  aiText: { fontSize: 13, color: '#4B5563', lineHeight: 20 },

  // Модалка штрихкода
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalContent: {
    backgroundColor: 'white', borderRadius: 20, padding: 24,
    width: '100%', alignItems: 'center',
  },
  modalClose: {
    position: 'absolute', top: 12, right: 12,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '700', color: '#111827',
    marginBottom: 4, textAlign: 'center', paddingHorizontal: 40,
  },
  modalSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 20 },
  barcodeWrap: { width: '100%', marginBottom: 14 },
  modalBarcodeNumber: {
    fontSize: 20, fontWeight: '700', color: '#111827', letterSpacing: 3,
    marginBottom: 12,
  },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#EEF2FF', borderRadius: 10,
  },
  copyBtnText: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
});