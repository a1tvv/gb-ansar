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
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function CameraScreen() {
  const router = useRouter();
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

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
              testID="open-settings-btn"
            >
              <Text style={styles.permissionButtonText}>Открыть настройки</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={requestPermission}
              testID="request-permission-btn"
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
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      await searchProduct(photo.base64);
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Ошибка', 'Не удалось сделать фото');
      setIsLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setLoadingMessage('AI анализирует товар...');
        setIsLoading(true);
        await searchProduct(result.assets[0].base64);
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

      if (data.products && data.products.length > 0) {
        router.replace({
          pathname: '/product-detail',
          params: { productId: data.products[0].id },
        });
      } else {
        const aiInfo = data.ai_analysis
          ? `\n\nAI увидел:\n${data.ai_analysis.substring(0, 200)}...`
          : '';
        Alert.alert(
          'Товар не найден',
          `Не удалось найти подходящий товар в каталоге.${aiInfo}\n\n💡 Совет: фотографируйте товар на чистом фоне, чтобы AI лучше распознавал товар.`,
          [
            { text: 'OK', onPress: () => setIsLoading(false) },
            {
              text: 'Добавить в каталог',
              onPress: () => {
                setIsLoading(false);
                router.replace('/add-product');
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error searching product:', error);
      Alert.alert('Ошибка', 'Не удалось выполнить поиск');
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <CameraView style={styles.camera} ref={cameraRef} facing="back">
        <SafeAreaView style={styles.cameraOverlay}>
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              testID="back-btn"
            >
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
            <TouchableOpacity
              style={styles.galleryBtn}
              onPress={pickImage}
              disabled={isLoading}
              testID="gallery-btn"
            >
              <Ionicons name="images" size={28} color="white" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.captureBtn}
              onPress={takePicture}
              disabled={isLoading}
              testID="capture-btn"
            >
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
              testID="barcode-btn"
            >
              <Ionicons name="barcode" size={28} color="white" />
            </TouchableOpacity>
          </View>

          {isLoading && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingCard}>
                <ActivityIndicator size="large" color="#667eea" />
                <Text style={styles.loadingTitle}>{loadingMessage}</Text>
                <Text style={styles.loadingSubtitle}>
                  AI анализирует товар на изображении
                </Text>
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
  frameCorner: {
    position: 'absolute', width: 60, height: 60, borderColor: 'white',
  },
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
  loadingTitle: {
    marginTop: 16, fontSize: 18, fontWeight: '600', color: '#1a1a1a',
  },
  loadingSubtitle: {
    marginTop: 4, fontSize: 14, color: '#6c757d', textAlign: 'center',
  },
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
  backButton: {
    backgroundColor: 'transparent', borderWidth: 2, borderColor: '#667eea',
  },
});
