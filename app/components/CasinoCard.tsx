import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from './ThemedText';

interface CasinoCardProps {
  suit: string;
  value: string;
  style?: any;
}

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const SUIT_COLORS: Record<string, string> = {
  hearts: '#e11d48',
  diamonds: '#e11d48',
  clubs: '#222',
  spades: '#222',
};

export default function CasinoCard({ suit, value, style = {} }: CasinoCardProps) {
  const symbol = SUIT_SYMBOLS[suit] || suit;
  const color = SUIT_COLORS[suit] || '#222';
  const flattenStyle = StyleSheet.flatten(style) || {};
  
  const isSmall = (flattenStyle.width ?? 56) < 64;
  if (isSmall) {
    return (
      <View style={[styles.card, styles.cardSmall, style]}>
        <View style={styles.centerSuitSmall}>
          <ThemedText style={styles.cornerTextSmall}>{value}</ThemedText>
          <ThemedText style={[styles.centerSuitTextSmall, { color }]}>{symbol}</ThemedText>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.card, style]}>
      {/* Top left corner */}
      <View style={styles.topLeft}>
        <ThemedText style={styles.cornerText}>{value}</ThemedText>
        <ThemedText style={[styles.cornerSuit, { color }]}>{symbol}</ThemedText>
      </View>
      
      {/* Center suit */}
      <View style={styles.centerSuit}>
        <ThemedText style={[styles.centerSuitText, { color }]}>{symbol}</ThemedText>
      </View>
      
      {/* Bottom right corner (rotated) */}
      <View style={styles.bottomRight}>
        <ThemedText style={styles.cornerText}>{value}</ThemedText>
        <ThemedText style={[styles.cornerSuit, { color }]}>{symbol}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 56,
    height: 80,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginHorizontal: 6,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 2,
    borderColor: '#e5e7eb',
    position: 'relative',
  },
  cardSmall: {
    width: 32,
    height: 44,
    borderRadius: 6,
    marginHorizontal: 2,
  },
  topLeft: {
    position: 'absolute',
    top: 4,
    left: 4,
    alignItems: 'center',
  },
  bottomRight: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    alignItems: 'center',
    transform: [{ rotate: '180deg' }],
  },
  cornerText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#222',
    lineHeight: 12,
  },
  cornerSuit: {
    fontSize: 16,
    lineHeight: 16,
  },
  centerSuit: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerSuitSmall: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerSuitText: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  centerSuitTextSmall: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  cornerTextSmall: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#222',
    lineHeight: 12,
    marginBottom: 0,
  },
}); 