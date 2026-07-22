import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

async function compressBase64(base64: string, maxWidth = 800, quality = 0.6): Promise<string> {
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

export default function SubmitPendingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ prefillName?: string; prefillImage?: string }>();

  const [images, setImages] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [articleNumber, setArticleNumber] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Предзаполнение из camera.tsx — если пришли параметры, заранее подставляем
  useEffect(() => {
    if (params.prefillName && typeof params.prefillName === 'string') {
      setName(params.prefillName);
    }
    if (params.prefillImage && typeof params.prefillImage === 'string') {
      setImages([params.prefillImage]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickImage = async () => {
    if (images.length >= 5) {
      Alert.alert('Ограничение', 'Максимум 5 фото на заявку');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        const compressed = await compressBase64(result.assets[0].base64);
        setImages((prev) => [...prev, compressed]);
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить фото');
    }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (images.length === 0) {
      Alert.alert('Нужно фото', 'Прикрепите хотя бы одно фото товара');
      return;
    }
    if (!name.trim() && !barcode.trim() && !articleNumber.trim()) {
      Alert.alert('Мало данных', 'Укажите хотя бы что-то одно: название, штрихкод или артикул');
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_URL}/api/pending-products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || null,
          barcode: barcode.trim() || null,
          article_number: articleNumber.trim() || null,
          note: note.trim() || null,
          images,
        }),
      });
      if (!response.ok) throw new Error('bad status');

      if (Platform.OS === 'web') {
        window.alert('Заявка отправлена! Админ склада её проверит.');
      } else {
        Alert.alert('Готово', 'Заявка отправлена! Админ склада её проверит.');
      }
      router.back();
    } catch {
      Alert.alert('Ошибка', 'Не удалось отправить заявку. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>Товар на рассмотрение</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.hint}>
          Не нашли товар в каталоге? Пришлите фото и любую инфу — админ склада оформит.
        </Text>

        <Text style={styles.label}>Фото товара</Text>
        <View style={styles.photosRow}>
          {images.map((img, idx) => (
            <View key={idx} style={styles.photoWrap}>
              <Image source={{ uri: `data:image/jpeg;base64,${img}` }} style={styles.photo} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => removeImage(idx)}>
                <Ionicons name="close-circle" size={24} color="#f5576c" />
              </TouchableOpacity>
            </View>
          ))}
          {images.length < 5 && (
            <TouchableOpacity style={styles.photoAdd} onPress={pickImage}>
              <Ionicons name="camera" size={32} color="#667eea" />
              <Text style={styles.photoAddText}>Добавить</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.label}>Название (если знаете)</Text>
        <TextInput
          style={styles.input}
          placeholder="Например: Мочалка Leevan"
          value={name}
          onChangeText={setName}
          placeholderTextColor="#adb5bd"
        />

        <Text style={styles.label}>Штрихкод</Text>
        <TextInput
          style={styles.input}
          placeholder="Числа с упаковки"
          value={barcode}
          onChangeText={setBarcode}
          keyboardType="numeric"
          placeholderTextColor="#adb5bd"
        />

        <Text style={styles.label}>Артикул</Text>
        <TextInput
          style={styles.input}
          placeholder="Если есть на упаковке"
          value={articleNumber}
          onChangeText={setArticleNumber}
          placeholderTextColor="#adb5bd"
        />

        <Text style={styles.label}>Комментарий</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          placeholder="Любая полезная информация"
          value={note}
          onChangeText={setNote}
          multiline
          placeholderTextColor="#adb5bd"
        />

        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="send" size={20} color="white" />
              <Text style={styles.submitBtnText}>Отправить заявку</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  title: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  hint: {
    fontSize: 14, color: '#6c757d', marginBottom: 20, lineHeight: 20,
    backgroundColor: '#e7f0ff', padding: 12, borderRadius: 12,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#1a1a1a',
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoWrap: { position: 'relative' },
  photo: { width: 100, height: 100, borderRadius: 12, backgroundColor: '#dee2e6' },
  photoRemove: { position: 'absolute', top: -8, right: -8, backgroundColor: 'white', borderRadius: 12 },
  photoAdd: {
    width: 100, height: 100, borderRadius: 12, borderWidth: 2, borderColor: '#667eea',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  photoAddText: { fontSize: 12, color: '#667eea', fontWeight: '600' },
  submitBtn: {
    marginTop: 24, backgroundColor: '#667eea', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
  },
  submitBtnText: { color: 'white', fontSize: 16, fontWeight: '600' },
});