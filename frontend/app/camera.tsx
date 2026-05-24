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
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

export default function CameraScreen() {
  const router = useRouter();
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isLoading, setIsLoading] = useState(false);

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={80} color="#667eea" />
          <Text style={styles.permissionTitle}>Нужен доступ к камере</Text>
          <Text style={styles.permissionText}>
            Разрешите доступ к камере для поиска товаров
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Разрешить доступ</Text>
          </TouchableOpacity>
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
      setIsLoading(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });

      // Search for product
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
        setIsLoading(true);
        await searchProduct(result.assets[0].base64);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Ошибка', 'Не удалось выбрать изображение');
    }
  };

  const searchProduct = async (base64Image: string) => {
    try {
      const response = await fetch(`${API_URL}/api/products/search/photo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: base64Image,
        }),
      });

      const data = await response.json();

      if (data.products && data.products.length > 0) {
        // Navigate to product detail with the found product
        router.push({
          pathname: '/product-detail',
          params: { productId: data.products[0].id },
        });
      } else {
        Alert.alert(
          'Товар не найден',
          'К сожалению, не удалось найти подходящий товар. Попробуйте сфотографировать товар с другого ракурса или добавьте его в каталог.'
        );
      }
    } catch (error) {
      console.error('Error searching product:', error);
      Alert.alert('Ошибка', 'Не удалось выполнить поиск');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <CameraView style={styles.camera} ref={cameraRef} facing="back">
        <SafeAreaView style={styles.cameraOverlay}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={28} color="white" />
            </TouchableOpacity>
            <Text style={styles.title}>Поиск товара</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.centerFrame}>
            <View style={styles.frameCorner} style={[styles.frameCorner, styles.topLeft]} />
            <View style={[styles.frameCorner, styles.topRight]} />
            <View style={[styles.frameCorner, styles.bottomLeft]} />
            <View style={[styles.frameCorner, styles.bottomRight]} />
          </View>

          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.galleryBtn} onPress={pickImage}>
              <Ionicons name="images" size={28} color="white" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.captureBtn}
              onPress={takePicture}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="large" color="white" />
              ) : (
                <View style={styles.captureBtnInner} />
              )}
            </TouchableOpacity>

            <View style={{ width: 60 }} />
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
  centerFrame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  frameCorner: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderColor: 'white',
  },
  topLeft: {
    top: '25%',
    left: 40,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: '25%',
    right: 40,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: '25%',
    left: 40,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: '25%',
    right: 40,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  galleryBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  captureBtnInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#667eea',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginTop: 24,
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 32,
  },
  permissionButton: {
    width: '100%',
    backgroundColor: '#667eea',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  backButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#667eea',
  },
});
