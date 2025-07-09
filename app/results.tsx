import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import ThemedText from './components/ThemedText';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export default function ResultsPage() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const player1Total = Number(params.player1Total) || 0;
  const player2Total = Number(params.player2Total) || 0;
  const player1Name = params.player1Name || 'Player 1';
  const player2Name = params.player2Name || 'Player 2';
  const player1Breakdown = params.player1Breakdown ? JSON.parse(params.player1Breakdown as string) : {};
  const player2Breakdown = params.player2Breakdown ? JSON.parse(params.player2Breakdown as string) : {};
  const winner = params.winner as string;

  return (
    <View style={styles.container}>
      <View style={styles.overlayCentered}>
        <View style={styles.nicePointsModalContent}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.push('/')}
            activeOpacity={0.7}
          >
            <MaterialIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {/* Gradient header with trophy */}
          <LinearGradient
            colors={["#FFD700", "#FFB300", "#FF9800"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modalHeaderGradient}
          >
            <MaterialIcons name="emoji-events" size={32} color="#fff" style={{ marginRight: 8 }} />
            <ThemedText style={styles.niceModalTitle}>Game Results</ThemedText>
          </LinearGradient>
          <ScrollView style={styles.pointsScrollView} showsVerticalScrollIndicator={false}>
            <View style={styles.modalBody}>
              {/* Player 1 */}
              <View style={styles.playerPointsContainer}>
                <ThemedText style={styles.playerName}>{player1Name}</ThemedText>
                <ThemedText style={styles.totalPoints}>Total: {player1Total} points</ThemedText>
                <View style={styles.pointsBreakdown}>
                  {Object.entries(player1Breakdown).map(([reason, points]) => (
                    <View key={reason} style={styles.pointsRow}>
                      <ThemedText style={styles.pointsReason}>{reason}</ThemedText>
                      <ThemedText style={styles.pointsValue}>+{points}</ThemedText>
                    </View>
                  ))}
                  {Object.keys(player1Breakdown).length === 0 && (
                    <ThemedText style={styles.noPointsText}>No point cards</ThemedText>
                  )}
                </View>
              </View>

              {/* Player 2 */}
              <View style={styles.playerPointsContainer}>
                <ThemedText style={styles.playerName}>{player2Name}</ThemedText>
                <ThemedText style={styles.totalPoints}>Total: {player2Total} points</ThemedText>
                <View style={styles.pointsBreakdown}>
                  {Object.entries(player2Breakdown).map(([reason, points]) => (
                    <View key={reason} style={styles.pointsRow}>
                      <ThemedText style={styles.pointsReason}>{reason}</ThemedText>
                      <ThemedText style={styles.pointsValue}>+{points}</ThemedText>
                    </View>
                  ))}
                  {Object.keys(player2Breakdown).length === 0 && (
                    <ThemedText style={styles.noPointsText}>No point cards</ThemedText>
                  )}
                </View>
              </View>

              {/* Winner */}
              <View style={styles.niceWinnerContainer}>
                <ThemedText style={styles.niceWinnerText}>
                  {winner
                    ? `🎉 ${winner} wins!`
                    : player1Total === player2Total
                    ? "🤝 It's a tie!"
                    : ''}
                </ThemedText>
              </View>
            </View>
          </ScrollView>
          <TouchableOpacity
            style={styles.niceModalButton}
            onPress={() => router.push('/')}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.niceModalButtonText}>Back to Menu</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(31,41,55,0.98)',
  },
  overlayCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nicePointsModalContent: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: 'rgba(31,41,55,0.98)',
    borderRadius: 28,
    paddingBottom: 24,
    paddingTop: 0,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
    overflow: 'hidden',
    marginTop: 32,
    marginBottom: 32,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
    padding: 4,
  },
  modalHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 8,
    width: '100%',
  },
  niceModalTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: 1,
    textAlign: 'center',
  },
  pointsScrollView: {
    maxHeight: 600,
  },
  modalBody: {
    alignItems: 'center',
    marginBottom: 24,
  },
  playerPointsContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    width: '70%',
  },
  playerName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  totalPoints: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  pointsBreakdown: {
    gap: 8,
  },
  pointsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  pointsReason: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  pointsValue: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  noPointsText: {
    color: '#9ca3af',
    fontSize: 14,
    fontStyle: 'italic',
  },
  niceWinnerContainer: {
    marginTop: 24,
    alignItems: 'center',
    padding: 18,
    backgroundColor: 'rgba(255, 215, 0, 0.18)',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  niceWinnerText: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  niceModalButton: {
    backgroundColor: '#19C37D',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 18,
    marginHorizontal: 24,
    shadowColor: '#19C37D',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  niceModalButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
}); 