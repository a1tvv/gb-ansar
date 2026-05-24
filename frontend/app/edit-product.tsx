import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const MAX_PHOTOS = 5;

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

export default function EditProductScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const [articleNumber, setArticleNumber] = useState('');
  const [price, setPrice] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (params.productId) {
      loadProduct(params.productId as string);
    }
  }, [params.productId]);

  useEffect(() => {
    if (params.scannedBarcode && typeof params.scannedBarcode === 'string') {
      setBarcode(params.scannedBarcode);
    }
  }, [params.scannedBarcode]);

  const loadProduct = async (productId: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/products/${productId}`);
      if (response.ok) {
        const data: Product = await response.json();
        setName(data.name);
        setCategory(data.category || '');
        setSubcategory(data.subcategory || '');
        setBarcode(data.barcode || '');
        setArticleNumber(data.article_number || '');
        setPrice(data.price.toString());
        setImages(data.images || []);
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

  const addImageFromGallery = async () => {
    if (images.length >= MAX_PHOTOS) {
      Alert.alert('Лимит фото', `Максимум ${MAX_PHOTOS} фотографий`);
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        setImages([...images, result.assets[0].base64]);
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось выбрать изображение');
    }
  };

  const addImageFromCamera = async () => {
    if (images.length >= MAX_PHOTOS) {
      Alert.alert('Лимит фото', `Максимум ${MAX_PHOTOS} фотографий`);
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Ошибка', 'Нужен доступ к камере');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        setImages([...images, result.assets[0].base64]);
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось сделать фото');
    }
  };

  const removeImage = (index: number) => {
    if (images.length <= 1) {
      Alert.alert('Ошибка', 'Должно быть минимум 1 фото');
      return;
    }
    setImages(images.filter((_, i) => i !== index));
  };

  const openBarcodeScanner = () => {
    router.push({
      pathname: '/barcode-scanner',
      params: { mode: 'capture' },
    });
  };

  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert('Ошибка', 'Введите название товара');
      return false;
    }
    if (!price.trim() || isNaN(Number(price)) || Number(price) <= 0) {
      Alert.alert('Ошибка', 'Введите корректную цену');
      return false;
    }
    if (images.length < 1) {
      Alert.alert('Ошибка', 'Добавьте минимум 1 фотографию товара');
      return false;
    }
    return true;
  };

  const saveProduct = async () => {
    if (!validateForm()) return;

    try {
      setIsSaving(true);
      const payload: any = {
        name: name.trim(),
        price: parseFloat(price),
        images: images,
        category: category.trim() || null,
        subcategory: subcategory.trim() || null,
        barcode: barcode.trim() || null,
        article_number: articleNumber.trim() || null,
      };

      const response = await fetch(`${API_URL}/api/products/${params.productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        Alert.alert('Успешно', 'Товар обновлён', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Ошибка', 'Не удалось обновить товар');
      }
    } catch (error) {
      console.error('Error updating product:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить изменения');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          <Text style={styles.title}>Редактировать товар</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Фотографии товара</Text>
              <Text style={styles.sectionCount}>{images.length}/{MAX_PHOTOS}</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.imagesScroll}
            >
              {images.map((img, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${img}` }}
                    style={styles.imageItem}
                  />
                  <TouchableOpacity
                    style={styles.removeImageBtn}
                    onPress={() => removeImage(index)}
                  >
                    <Ionicons name="close-circle" size={28} color="#f5576c" />
                  </TouchableOpacity>
                  {index === 0 && (
                    <View style={styles.mainBadge}>
                      <Text style={styles.mainBadgeText}>Главное</Text>
                    </View>
                  )}
                </View>
              ))}
              {images.length < MAX_PHOTOS && (
                <TouchableOpacity style={styles.addImageBtn} onPress={addImageFromGallery}>
                  <Ionicons name="add" size={40} color="#667eea" />
                  <Text style={styles.addImageText}>Добавить</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <View style={styles.imageButtons}>
              <TouchableOpacity
                style={[styles.imageBtn, images.length >= MAX_PHOTOS && styles.disabledBtn]}
                onPress={addImageFromCamera}
                disabled={images.length >= MAX_PHOTOS}
              >
                <Ionicons name="camera" size={20} color={images.length >= MAX_PHOTOS ? '#adb5bd' : '#667eea'} />
                <Text style={[styles.imageBtnText, images.length >= MAX_PHOTOS && { color: '#adb5bd' }]}>
                  Камера
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.imageBtn, images.length >= MAX_PHOTOS && styles.disabledBtn]}
                onPress={addImageFromGallery}
                disabled={images.length >= MAX_PHOTOS}
              >
                <Ionicons name="images" size={20} color={images.length >= MAX_PHOTOS ? '#adb5bd' : '#667eea'} />
                <Text style={[styles.imageBtnText, images.length >= MAX_PHOTOS && { color: '#adb5bd' }]}>
                  Галерея
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Основная информация</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Название товара <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Например: Белая тарелка Luminarc"
                value={name}
                onChangeText={setName}
                placeholderTextColor="#adb5bd"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Цена (₸) <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="3500"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                placeholderTextColor="#adb5bd"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Дополнительно (необязательно)</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Штрихкод</Text>
              <View style={styles.barcodeRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="4820023848211"
                  value={barcode}
                  onChangeText={setBarcode}
                  keyboardType="numeric"
                  placeholderTextColor="#adb5bd"
                />
                <TouchableOpacity style={styles.scanBtn} onPress={openBarcodeScanner}>
                  <Ionicons name="barcode" size={24} color="white" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Категория</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Посуда"
                  value={category}
                  onChangeText={setCategory}
                  placeholderTextColor="#adb5bd"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Подкатегория</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Тарелки"
                  value={subcategory}
                  onChangeText={setSubcategory}
                  placeholderTextColor="#adb5bd"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Артикул</Text>
              <TextInput
                style={styles.input}
                placeholder="PL-9281"
                value={articleNumber}
                onChangeText={setArticleNumber}
                placeholderTextColor="#adb5bd"
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={saveProduct}
            disabled={isSaving}
          >
            {isSaving ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="white" />
                <Text style={styles.saveButtonText}>Сохранение...</Text>
              </View>
            ) : (
              <Text style={styles.saveButtonText}>Сохранить изменения</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'white',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  content: { flex: 1 },
  section: { backgroundColor: 'white', padding: 20, marginBottom: 12, gap: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a' },
  sectionCount: { fontSize: 14, color: '#667eea', fontWeight: '600' },
  imagesScroll: { gap: 12, paddingRight: 12 },
  imageWrapper: { width: 120, height: 120, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  imageItem: { width: '100%', height: '100%' },
  removeImageBtn: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: 14,
  },
  mainBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(102, 126, 234, 0.9)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  mainBadgeText: { color: 'white', fontSize: 10, fontWeight: '600' },
  addImageBtn: {
    width: 120, height: 120, borderRadius: 12, backgroundColor: '#f8f9fa',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#dee2e6', borderStyle: 'dashed',
  },
  addImageText: { marginTop: 4, fontSize: 13, color: '#667eea', fontWeight: '600' },
  imageButtons: { flexDirection: 'row', gap: 12 },
  imageBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, backgroundColor: '#f8f9fa', gap: 8,
  },
  disabledBtn: { opacity: 0.5 },
  imageBtnText: { fontSize: 15, fontWeight: '600', color: '#667eea' },
  inputGroup: { gap: 6 },
  row: { flexDirection: 'row' },
  label: { fontSize: 14, fontWeight: '600', color: '#495057' },
  required: { color: '#f5576c' },
  input: {
    backgroundColor: '#f8f9fa', paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 12, fontSize: 16, color: '#1a1a1a',
    borderWidth: 1, borderColor: '#dee2e6',
  },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanBtn: {
    width: 50, height: 50, borderRadius: 12, backgroundColor: '#667eea',
    alignItems: 'center', justifyContent: 'center',
  },
  footer: { padding: 16, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#dee2e6' },
  saveButton: { backgroundColor: '#667eea', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { fontSize: 16, fontWeight: 'bold', color: 'white' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
