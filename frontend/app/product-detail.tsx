import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

export default function ProductDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (params.productId) {
      loadProduct(params.productId as string);
    }
  }, [params.productId]);

  const loadProduct = async (productId: string) => {
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
      console.error('Error loading product:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить товар');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

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
              console.error('Error deleting product:', error);
              Alert.alert('Ошибка', 'Не удалось удалить товар');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  if (!product) {
    return null;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: `data:image/jpeg;base64,${product.image_base64}` }}
            style={styles.productImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={styles.imageGradient}
          />
          <SafeAreaView style={styles.imageHeader}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => router.push({ pathname: '/edit-product', params: { productId: product.id } })}
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

          <View style={styles.section}>
            <InfoCard
              icon="pricetag"
              label="Категория"
              value={product.category}
              color="#667eea"
            />
            <InfoCard
              icon="albums"
              label="Подкатегория"
              value={product.subcategory}
              color="#f093fb"
            />
          </View>

          <View style={styles.section}>
            <InfoCard
              icon="barcode"
              label="Штрихкод"
              value={product.barcode}
              color="#4facfe"
            />
            <InfoCard
              icon="document-text"
              label="Артикул"
              value={product.article_number}
              color="#43e97b"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const InfoCard = ({
  icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
}) => (
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
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    width: '100%',
    height: 400,
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
  },
  imageHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  content: {
    padding: 24,
    paddingTop: 32,
  },
  headerInfo: {
    marginBottom: 32,
  },
  productName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#667eea',
  },
  section: {
    gap: 16,
    marginBottom: 24,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
});
