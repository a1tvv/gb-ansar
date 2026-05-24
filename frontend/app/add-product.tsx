import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

export default function AddProductScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const [articleNumber, setArticleNumber] = useState('');
  const [price, setPrice] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setImageBase64(result.assets[0].base64);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Ошибка', 'Не удалось выбрать изображение');
    }
  };

  const takePicture = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Ошибка', 'Нужен доступ к камере');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setImageBase64(result.assets[0].base64);
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Ошибка', 'Не удалось сделать фото');
    }
  };

  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert('Ошибка', 'Введите название товара');
      return false;
    }
    if (!category.trim()) {
      Alert.alert('Ошибка', 'Введите категорию');
      return false;
    }
    if (!subcategory.trim()) {
      Alert.alert('Ошибка', 'Введите подкатегорию');
      return false;
    }
    if (!barcode.trim()) {
      Alert.alert('Ошибка', 'Введите штрихкод');
      return false;
    }
    if (!articleNumber.trim()) {
      Alert.alert('Ошибка', 'Введите артикул');
      return false;
    }
    if (!price.trim() || isNaN(Number(price))) {
      Alert.alert('Ошибка', 'Введите корректную цену');
      return false;
    }
    if (!imageBase64) {
      Alert.alert('Ошибка', 'Добавьте фотографию товара');
      return false;
    }
    return true;
  };

  const saveProduct = async () => {
    if (!validateForm()) return;

    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          category: category.trim(),
          subcategory: subcategory.trim(),
          barcode: barcode.trim(),
          article_number: articleNumber.trim(),
          price: parseFloat(price),
          image_base64: imageBase64,
        }),
      });

      if (response.ok) {
        Alert.alert('Успешно', 'Товар добавлен в каталог', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Ошибка', 'Не удалось добавить товар');
      }
    } catch (error) {
      console.error('Error saving product:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить товар');
    } finally {
      setIsLoading(false);
    }
  };

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
          <Text style={styles.title}>Добавить товар</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.imageSection}>
            {imageBase64 ? (
              <View style={styles.imagePreview}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
                  style={styles.image}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={styles.removeImageBtn}
                  onPress={() => setImageBase64('')}
                >
                  <Ionicons name="close-circle" size={32} color="white" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="image-outline" size={48} color="#adb5bd" />
                <Text style={styles.placeholderText}>Фото товара</Text>
              </View>
            )}
            <View style={styles.imageButtons}>
              <TouchableOpacity style={styles.imageBtn} onPress={takePicture}>
                <Ionicons name="camera" size={24} color="#667eea" />
                <Text style={styles.imageBtnText}>Камера</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageBtn} onPress={pickImage}>
                <Ionicons name="images" size={24} color="#667eea" />
                <Text style={styles.imageBtnText}>Галерея</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Название товара</Text>
              <TextInput
                style={styles.input}
                placeholder="Например: Белая тарелка Luminarc"
                value={name}
                onChangeText={setName}
                placeholderTextColor="#adb5bd"
              />
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
              <Text style={styles.label}>Штрихкод</Text>
              <TextInput
                style={styles.input}
                placeholder="4820023848211"
                value={barcode}
                onChangeText={setBarcode}
                keyboardType="numeric"
                placeholderTextColor="#adb5bd"
              />
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

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Цена (₸)</Text>
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
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
            onPress={saveProduct}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.saveButtonText}>Сохранить товар</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  content: {
    flex: 1,
  },
  imageSection: {
    backgroundColor: 'white',
    padding: 24,
    marginBottom: 16,
  },
  imagePreview: {
    width: '100%',
    height: 250,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 16,
  },
  imagePlaceholder: {
    width: '100%',
    height: 250,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#dee2e6',
    borderStyle: 'dashed',
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 16,
    color: '#adb5bd',
  },
  imageButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  imageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
    gap: 8,
  },
  imageBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#667eea',
  },
  form: {
    backgroundColor: 'white',
    padding: 24,
    gap: 20,
  },
  row: {
    flexDirection: 'row',
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
  },
  input: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 16,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  footer: {
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#dee2e6',
  },
  saveButton: {
    backgroundColor: '#667eea',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
});
