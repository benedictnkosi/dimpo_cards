import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { subscribeToRecentTestGames, TestGame } from '@/services/testGamesService';
import { useAuth } from '@/contexts/AuthContext';

interface TestGameListProps {
  onJoinGame: (gameId: string) => void;
}

export default function TestGameList({ onJoinGame }: TestGameListProps) {
  const { user } = useAuth();
  const [games, setGames] = useState<TestGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToRecentTestGames(
      10,
      (recentGames) => {
        setGames(recentGames);
        setIsLoading(false);
      },
      (error) => {
        console.error('[TestGameList] Error loading games:', error);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const renderGame = ({ item }: { item: TestGame }) => (
    <TouchableOpacity
      style={styles.gameItem}
      onPress={() => onJoinGame(item.id)}
    >
      <View style={styles.gameHeader}>
        <Text style={styles.gameId}>Game: {item.id.slice(0, 8)}...</Text>
        <Text style={styles.gameStatus}>
          {item.cards.length} cards left • {item.discarded.length} discarded
        </Text>
      </View>
      <View style={styles.gameDetails}>
        <Text style={styles.gameInfo}>
          Created: {item.createdAt.toLocaleTimeString()}
        </Text>
        <Text style={styles.gameInfo}>
          Updated: {item.updatedAt.toLocaleTimeString()}
        </Text>
        {item.animatingCard !== null && (
          <Text style={styles.animatingText}>🎬 Animating...</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading recent games...</Text>
      </View>
    );
  }

  if (games.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No recent games found</Text>
        <Text style={styles.emptySubtext}>Create a new game to get started</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recent Test Games</Text>
      <Text style={styles.subtitle}>Tap to join and sync in real-time</Text>
      <FlatList
        data={games}
        renderItem={renderGame}
        keyExtractor={(item) => item.id}
        style={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
    color: '#666',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    color: '#999',
  },
  list: {
    flex: 1,
  },
  gameItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gameId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#19C37D',
  },
  gameStatus: {
    fontSize: 12,
    color: '#666',
  },
  gameDetails: {
    gap: 4,
  },
  gameInfo: {
    fontSize: 12,
    color: '#888',
  },
  animatingText: {
    fontSize: 12,
    color: '#ff6b6b',
    fontWeight: 'bold',
  },
}); 