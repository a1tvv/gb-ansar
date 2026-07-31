import React, { useMemo, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';

// Таблицы кодировки EAN-13
const L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
const G = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];
const R = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100',
];
const PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

/**
 * Кодирует 13-значный код в строку битов EAN-13 (95 модулей).
 * 12 цифр (UPC-A) дополняется ведущим нулём.
 */
function encodeEAN13(raw: string): string | null {
  const code = (raw || '').replace(/\D/g, '');
  let value = code;
  if (value.length === 12) value = '0' + value;
  if (value.length !== 13) return null;

  const d = value.split('').map(Number);
  const parity = PARITY[d[0]];

  let bits = '101'; // левый guard
  for (let i = 1; i <= 6; i++) {
    bits += parity[i - 1] === 'L' ? L[d[i]] : G[d[i]];
  }
  bits += '01010'; // центральный guard
  for (let i = 7; i <= 12; i++) {
    bits += R[d[i]];
  }
  bits += '101'; // правый guard

  return bits;
}

interface BarcodeProps {
  value: string;
  height?: number;
}

export default function Barcode({ value, height = 120 }: BarcodeProps) {
  const [containerWidth, setContainerWidth] = useState(0);

  const bits = useMemo(() => encodeEAN13(value), [value]);

  // Схлопываем соседние одинаковые биты в один блок — меньше элементов, быстрее рендер
  const runs = useMemo(() => {
    if (!bits) return [];
    const out: { black: boolean; count: number }[] = [];
    let current = bits[0];
    let count = 1;
    for (let i = 1; i < bits.length; i++) {
      if (bits[i] === current) {
        count++;
      } else {
        out.push({ black: current === '1', count });
        current = bits[i];
        count = 1;
      }
    }
    out.push({ black: current === '1', count });
    return out;
  }, [bits]);

  const onLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  // 95 модулей штрихкода + по 9 модулей белого поля с каждой стороны
  const TOTAL_MODULES = 95 + 18;
  const moduleWidth = containerWidth > 0
    ? Math.max(1, containerWidth / TOTAL_MODULES)
    : 0;

  // Код не EAN-13 — рисовать нечего
  if (!bits) {
    return <View style={[styles.container, { height }]} onLayout={onLayout} />;
  }

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {moduleWidth > 0 && (
        <View style={styles.row}>
          {/* левое белое поле */}
          <View style={{ width: moduleWidth * 9, height: '100%' }} />
          {runs.map((r, i) => (
            <View
              key={i}
              style={{
                width: moduleWidth * r.count,
                height: '100%',
                backgroundColor: r.black ? '#000000' : '#FFFFFF',
              }}
            />
          ))}
          {/* правое белое поле */}
          <View style={{ width: moduleWidth * 9, height: '100%' }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    height: '100%',
  },
});