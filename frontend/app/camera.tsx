import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Сжатие ТОЛЬКО на web. На мобилке нативная камера уже возвращает сжатое фото.
async function compressBase64(base64: string, maxWidth = 600, quality = 0.5): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return base64;
  }
  return new Promise((resolve) => {
    try {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl.split(',')[1] || base64);
      };
      img.onerror = () => resolve(base64);
      img.src = `data:image/jpeg;base64,${base64}`;
    } catch {
      resolve(base64);
    }
  });
}

interface SearchProduct {
  id: string;
  name: string;
  price: number;
  images: string[];
  barcode?: string;
}

export default function CameraScreen() {
  const router = useRouter();
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const [showChoice, setShowChoice] = useState(false);
  const [choiceProducts, setChoiceProducts] = useState<SearchProduct[]>([]);
  const [choiceRecognized, setChoiceRecognized] = useState<string | null>(null);

  const [showNotFound, setShowNotFound] = useState(false);
  const [notFoundRecognized, setNotFoundRecognized] = useState<string | null>(null);
  const [notFoundImage, setNotFoundImage] = useState<string | null>(null);

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionWrapper}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={80} color="#667eea" />
          <Text style={styles.permissionTitle}>Нужен доступ к камере</Text>
          <Text style={styles.permissionText}>
            Разрешите доступ к камере для AI поиска товаров
          </Text>
          {!permission.canAskAgain ? (
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={() => Linking.openSettings()}
            >
              <Text style={styles.permissionButtonText}>Открыть настройки</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={requestPermission}
            >
              <Text style={styles.permissionButtonText}>Разрешить доступ</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.permissionButton, styles.backButton]}
            onPress={() => router.back()}
          >
            <Text style={[styles.permissionButtonText, { color: '#667eea' }]}>Назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      setLoadingMessage('Делаем снимок...');
      setIsLoading(true);
      // На мобилке quality 0.5 сразу — камера сама сожмёт, canvas не будет молотить
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
      });
      const compressed = await compressBase64(photo.base64);
      await searchProduct(compressed);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось сделать фото');
      setIsLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        setLoadingMessage('AI анализирует товар...');
        setIsLoading(true);
        const compressed = await compressBase64(result.assets[0].base64);
        await searchProduct(compressed);
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось выбрать изображение');
    }
  };

  const searchProduct = async (base64Image: string) => {
    try {
      setLoadingMessage('AI анализирует товар...');
      const response = await fetch(`${API_URL}/api/products/search/photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64Image }),
      });
      const data = await response.json();
      setIsLoading(false);

      const products: SearchProduct[] = data.products || [];
      const recognized: string | null = data.recognized_name || null;

      if (products.length === 0) {
        setNotFoundRecognized(recognized);
        setNotFoundImage(base64Image);
        setShowNotFound(true);
        return;
      }

      if (products.length === 1) {
        router.replace({
          pathname: '/product-detail',
          params: { productId: products[0].id },
        });
        return;
      }

      setChoiceProducts(products);
      setChoiceRecognized(recognized);
      setShowChoice(true);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось выполнить поиск');
      setIsLoading(false);
    }
  };

  const goToPendingForm = () => {
    setShowNotFound(false);
    router.push({
      pathname: '/submit-pending',
      params: {
        prefillName: notFoundRecognized || '',
        prefillImage: notFoundImage || '',
      },
    });
  };

  const pickChoice = (productId: string) => {
    setShowChoice(false);
    router.replace({
      pathname: '/product-detail',
      params: { productId },
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <Modal visible={showChoice} animationType="slide" onRequestClose={() => setShowChoice(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity style={styles.modalBack} onPress={() => setShowChoice(false)}>
              <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Найдено несколько</Text>
              {choiceRecognized && (
                <Text style={styles.modalSubtitle}>Распознано: {choiceRecognized}</Text>
              )}
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={styles.hintText}>
              AI нашёл {choiceProducts.length} похожих товаров. Выберите нужный:
            </Text>
            {choiceProducts.map((p) => {
              const img = p.images && p.images[0];
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.choiceCard}
                  onPress={() => pickChoice(p.id)}
                  activeOpacity={0.8}
                >
                  {img ? (
                    <Image
                      source={{
                        uri: img.startsWith('http') ? img : `data:image/jpeg;base64,${img}`,
                      }}
                      style={styles.choiceImage}
                    />
                  ) : (
                    <View style={[styles.choiceImage, styles.choiceImageEmpty]}>
                      <Ionicons name="image-outline" size={32} color="#adb5bd" />
                    </View>
                  )}
                  <View style={styles.choiceInfo}>
                    <Text style={styles.choiceName} numberOfLines={2}>{p.name}</Text>
                    <Text style={styles.choicePrice}>{p.price.toLocaleString('ru-RU')} ₸</Text>
                    {p.barcode && (
                      <Text style={styles.choiceBarcode}>Штрихкод: {p.barcode}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={22} color="#667eea" />
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.pendingCta}
              onPress={() => {
                setShowChoice(false);
                setNotFoundRecognized(choiceRecognized);
                router.push({
                  pathname: '/submit-pending',
                  params: { prefillName: choiceRecognized || '' },
                });
              }}
            >
              <Ionicons name="send" size={18} color="white" />
              <Text style={styles.pendingCtaText}>Нет нужного? Отправить на рассмотрение</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={showNotFound} animationType="slide" onRequestClose={() => setShowNotFound(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity style={styles.modalBack} onPress={() => setShowNotFound(false)}>
              <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Товар не найден</Text>
          </View>
          <View style={styles.notFoundBody}>
            <View style={styles.notFoundIconWrap}>
              <Ionicons name="alert-circle" size={80} color="#f5576c" />
            </View>
            <Text style={styles.notFoundTitle}>
              Этого товара нет в каталоге
            </Text>
            {notFoundRecognized && (
              <Text style={styles.notFoundHint}>
                AI распознал как: «{notFoundRecognized}»
              </Text>
            )}
            <Text style={styles.notFoundDescription}>
              Отправьте товар на рассмотрение — админ склада проверит и добавит его в каталог.
            </Text>

            <TouchableOpacity style={styles.notFoundCta} onPress={goToPendingForm}>
              <Ionicons name="send" size={20} color="white" />
              <Text style={styles.notFoundCtaText}>Отправить на рассмотрение</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notFoundSecondary}
              onPress={() => setShowNotFound(false)}
            >
              <Text style={styles.notFoundSecondaryText}>Попробовать ещё раз</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <CameraView style={styles.camera} ref={cameraRef} facing="back">
        <SafeAreaView style={styles.cameraOverlay}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={28} color="white" />
            </TouchableOpacity>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>AI Поиск</Text>
              <Text style={styles.subtitle}>Сфотографируйте товар</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.centerFrame}>
            <View style={[styles.frameCorner, styles.topLeft]} />
            <View style={[styles.frameCorner, styles.topRight]} />
            <View style={[styles.frameCorner, styles.bottomLeft]} />
            <View style={[styles.frameCorner, styles.bottomRight]} />
            <View style={styles.tipContainer}>
              <Text style={styles.tipText}>💡 Лучше фотографировать на чистом фоне</Text>
            </View>
          </View>

          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.galleryBtn} onPress={pickImage} disabled={isLoading}>
              <Ionicons name="images" size={28} color="white" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.captureBtn} onPress={takePicture} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator size="large" color="#667eea" />
              ) : (
                <View style={styles.captureBtnInner} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.scannerBtn}
              onPress={() => router.push('/barcode-scanner')}
              disabled={isLoading}
            >
              <Ionicons name="barcode" size={28} color="white" />
            </TouchableOpacity>
          </View>

          {isLoading && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingCard}>
                <ActivityIndicator size="large" color="#667eea" />
                <Text style={styles.loadingTitle}>{loadingMessage}</Text>
                <Text style={styles.loadingSubtitle}>AI анализирует товар</Text>
              </View>
            </View>
          )}
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, backgroundColor: 'transparent' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  titleContainer: { alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  centerFrame: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, position: 'relative',
  },
  frameCorner: { position: 'absolute', width: 60, height: 60, borderColor: 'white' },
  topLeft: {
    top: '25%', left: 40,
    borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8,
  },
  topRight: {
    top: '25%', right: 40,
    borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: '25%', left: 40,
    borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: '25%', right: 40,
    borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8,
  },
  tipContainer: {
    position: 'absolute', bottom: '15%',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
  },
  tipText: { color: 'white', fontSize: 13, textAlign: 'center' },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingBottom: 40, paddingHorizontal: 24,
  },
  galleryBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  scannerBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  captureBtn: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'white',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  captureBtnInner: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: 'white',
    borderWidth: 2, borderColor: '#667eea',
  },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  loadingCard: {
    backgroundColor: 'white', padding: 32, borderRadius: 20,
    alignItems: 'center', minWidth: 250,
  },
  loadingTitle: { marginTop: 16, fontSize: 18, fontWeight: '600', color: '#1a1a1a' },
  loadingSubtitle: { marginTop: 4, fontSize: 14, color: '#6c757d', textAlign: 'center' },

  permissionWrapper: { flex: 1, backgroundColor: '#f8f9fa' },
  permissionContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  permissionTitle: {
    fontSize: 24, fontWeight: 'bold', color: '#1a1a1a',
    marginTop: 24, marginBottom: 12,
  },
  permissionText: {
    fontSize: 16, color: '#6c757d', textAlign: 'center', marginBottom: 32,
  },
  permissionButton: {
    width: '100%', backgroundColor: '#667eea',
    paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12,
  },
  permissionButtonText: { fontSize: 16, fontWeight: '600', color: 'white' },
  backButton: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#667eea' },

  modalContainer: { flex: 1, backgroundColor: '#f8f9fa' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16,
    backgroundColor: 'white', gap: 12,
  },
  modalBack: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  modalSubtitle: { fontSize: 13, color: '#6c757d', marginTop: 2 },

  hintText: {
    fontSize: 14, color: '#495057', marginBottom: 12,
    backgroundColor: 'white', padding: 12, borderRadius: 12,
  },
  choiceCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', borderRadius: 12,
    padding: 12, marginBottom: 10, gap: 12,
  },
  choiceImage: {
    width: 70, height: 70, borderRadius: 10, backgroundColor: '#dee2e6',
  },
  choiceImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  choiceInfo: { flex: 1 },
  choiceName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
  choicePrice: { fontSize: 16, fontWeight: 'bold', color: '#667eea' },
  choiceBarcode: { fontSize: 12, color: '#6c757d', marginTop: 2 },

  pendingCta: {
    marginTop: 12, backgroundColor: '#fa709a',
    padding: 16, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  pendingCtaText: { color: 'white', fontSize: 14, fontWeight: '600' },

  notFoundBody: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  notFoundIconWrap: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#f5576c15', alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  notFoundTitle: {
    fontSize: 22, fontWeight: 'bold', color: '#1a1a1a',
    textAlign: 'center', marginBottom: 8,
  },
  notFoundHint: {
    fontSize: 14, color: '#6c757d', marginBottom: 16, fontStyle: 'italic',
  },
  notFoundDescription: {
    fontSize: 15, color: '#495057', textAlign: 'center',
    marginBottom: 32, lineHeight: 22,
  },
  notFoundCta: {
    width: '100%',
    backgroundColor: '#667eea', paddingVertical: 16, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginBottom: 12,
  },
  notFoundCtaText: { color: 'white', fontSize: 16, fontWeight: '600' },
  notFoundSecondary: { paddingVertical: 12 },
  notFoundSecondaryText: {
    color: '#667eea', fontSize: 14, fontWeight: '600',
  },
});