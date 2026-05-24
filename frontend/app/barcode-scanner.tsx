import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function BarcodeScannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  // mode: 'search' (find product) or 'capture' (return barcode to previous screen)
  const mode = (params.mode as string) || 'search';

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned || isLoading) return;
    setScanned(true);
    await processBarcode(data);
  };

  const processBarcode = async (barcode: string) => {
    if (mode === 'capture') {
      // Return barcode to previous screen
      router.replace({
        pathname: '/add-product',
        params: { scannedBarcode: barcode },
      });
      return;
    }

    // mode === 'search' - find product by barcode
    try {
      setIsLoading(true);
      const response = await fetch(
        `${API_URL}/api/products/search/barcode?barcode=${encodeURIComponent(barcode)}`
      );

      if (response.ok) {
        const product = await response.json();
        router.replace({
          pathname: '/product-detail',
          params: { productId: product.id },
        });
      } else {
        Alert.alert(
          'Товар не найден',
          `Штрихкод ${barcode} не найден в каталоге`,
          [
            { text: 'Сканировать снова', onPress: () => { setScanned(false); setIsLoading(false); } },
            { text: 'Назад', onPress: () => router.back(), style: 'cancel' },
          ]
        );
      }
    } catch (error) {
      console.error('Error searching by barcode:', error);
      Alert.alert('Ошибка', 'Не удалось выполнить поиск', [
        { text: 'OK', onPress: () => { setScanned(false); setIsLoading(false); } },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = () => {
    if (!manualBarcode.trim()) {
      Alert.alert('Ошибка', 'Введите штрихкод');
      return;
    }
    setShowManualInput(false);
    processBarcode(manualBarcode.trim());
  };

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
          <Ionicons name="barcode-outline" size={80} color="#667eea" />
          <Text style={styles.permissionTitle}>Нужен доступ к камере</Text>
          <Text style={styles.permissionText}>
            Разрешите доступ к камере для сканирования штрихкодов
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
            style={[styles.permissionButton, styles.outlineButton]}
            onPress={() => setShowManualInput(true)}
            testID="manual-input-btn"
          >
            <Text style={[styles.permissionButtonText, { color: '#667eea' }]}>
              Ввести вручную
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>Назад</Text>
          </TouchableOpacity>
        </View>

        <ManualInputModal
          visible={showManualInput}
          value={manualBarcode}
          onChange={setManualBarcode}
          onSubmit={handleManualSubmit}
          onCancel={() => setShowManualInput(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: [
            'ean13',
            'ean8',
            'upc_a',
            'upc_e',
            'code128',
            'code39',
            'code93',
            'codabar',
            'itf14',
            'qr',
            'pdf417',
            'aztec',
            'datamatrix',
          ],
        }}
      >
        <SafeAreaView style={styles.cameraOverlay}>
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              testID="back-btn"
            >
              <Ionicons name="arrow-back" size={28} color="white" />
            </TouchableOpacity>
            <Text style={styles.title}>
              {mode === 'capture' ? 'Сканер штрихкода' : 'Поиск по штрихкоду'}
            </Text>
            <TouchableOpacity
              style={styles.manualBtn}
              onPress={() => setShowManualInput(true)}
              testID="manual-btn"
            >
              <Ionicons name="keypad" size={24} color="white" />
            </TouchableOpacity>
          </View>

          <View style={styles.centerFrame}>
            <View style={styles.scanArea}>
              <View style={[styles.frameCorner, styles.topLeft]} />
              <View style={[styles.frameCorner, styles.topRight]} />
              <View style={[styles.frameCorner, styles.bottomLeft]} />
              <View style={[styles.frameCorner, styles.bottomRight]} />
              <View style={styles.scanLine} />
            </View>
            <Text style={styles.scanInstructions}>
              Наведите камеру на штрихкод
            </Text>
          </View>

          <View style={styles.bottomBar}>
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="white" />
                <Text style={styles.loadingText}>Поиск товара...</Text>
              </View>
            )}
            {scanned && !isLoading && (
              <TouchableOpacity
                style={styles.rescanBtn}
                onPress={() => setScanned(false)}
                testID="rescan-btn"
              >
                <Text style={styles.rescanBtnText}>Сканировать снова</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </CameraView>

      <ManualInputModal
        visible={showManualInput}
        value={manualBarcode}
        onChange={setManualBarcode}
        onSubmit={handleManualSubmit}
        onCancel={() => setShowManualInput(false)}
      />
    </View>
  );
}

interface ManualInputModalProps {
  visible: boolean;
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function ManualInputModal({ visible, value, onChange, onSubmit, onCancel }: ManualInputModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={modalStyles.backdrop}
      >
        <View style={modalStyles.modal}>
          <Text style={modalStyles.title}>Ввести штрихкод</Text>
          <Text style={modalStyles.subtitle}>
            Введите номер штрихкода вручную
          </Text>
          <TextInput
            style={modalStyles.input}
            placeholder="4820023848211"
            value={value}
            onChangeText={onChange}
            keyboardType="numeric"
            autoFocus
            placeholderTextColor="#adb5bd"
            testID="manual-barcode-input"
          />
          <View style={modalStyles.buttons}>
            <TouchableOpacity
              style={[modalStyles.button, modalStyles.cancelButton]}
              onPress={onCancel}
              testID="modal-cancel-btn"
            >
              <Text style={modalStyles.cancelButtonText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.button, modalStyles.submitButton]}
              onPress={onSubmit}
              testID="modal-submit-btn"
            >
              <Text style={modalStyles.submitButtonText}>Найти</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  },
  scanArea: {
    width: 280,
    height: 180,
    position: 'relative',
  },
  frameCorner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#00f2fe',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  scanLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#00f2fe',
    opacity: 0.8,
  },
  scanInstructions: {
    marginTop: 32,
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  loadingOverlay: {
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  rescanBtn: {
    backgroundColor: 'white',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  rescanBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#f8f9fa',
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
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#667eea',
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  backText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
  },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 18,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#dee2e6',
    marginBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6c757d',
  },
  submitButton: {
    backgroundColor: '#667eea',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
