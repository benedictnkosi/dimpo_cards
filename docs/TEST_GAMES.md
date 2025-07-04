# Real-time Test Games

This feature demonstrates Firebase real-time synchronization across multiple devices using the `testgames` collection.

## Features

- **Real-time synchronization**: All connected devices see the same game state instantly
- **Multi-device support**: Multiple users can join the same game
- **Live animations**: Card animations are synchronized across devices
- **Game management**: Create, join, and reset games

## How it Works

### Firebase Collection: `testgames`

Each game document contains:
```typescript
{
  id: string;              // Auto-generated document ID
  cards: number[];         // Current cards in hand
  discarded: number[];     // Cards in discard pile
  animatingCard: number | null;  // Currently animating card
  createdAt: Date;         // Game creation timestamp
  updatedAt: Date;         // Last update timestamp
  createdBy: string;       // User ID who created the game
}
```

### Real-time Updates

The app uses Firebase `onSnapshot` listeners to:
1. Listen for changes to the current game
2. Update the UI immediately when changes occur
3. Sync animations and game state across all connected devices

### Usage

1. **Create a new game**: Tap "Create New Game" to start a fresh game
2. **Join existing game**: Select from the list of recent games
3. **Play cards**: Tap cards to animate them to the discard pile
4. **Reset game**: Use the reset button to start over
5. **Switch games**: Use the back button to return to the game list

## Technical Implementation

### Services

- `services/testGamesService.ts`: Firebase operations for test games
- `app/components/TestGameList.tsx`: UI component for game selection
- `app/TestReanimatedPage.tsx`: Main game interface with real-time sync

### Key Functions

- `createTestGame()`: Creates a new game in Firebase
- `updateTestGame()`: Updates game state in real-time
- `subscribeToTestGame()`: Sets up real-time listener for game changes
- `subscribeToRecentTestGames()`: Lists recent games for joining

### Authentication

Requires user authentication to:
- Create games (tied to user ID)
- Join games
- Update game state

## Testing Multi-device Sync

1. Open the app on two different devices
2. Create a game on one device
3. Join the same game on the second device
4. Play cards on either device
5. Observe real-time synchronization

## Error Handling

- Network connectivity issues
- Firebase authentication errors
- Game not found scenarios
- Real-time listener failures

## Performance Considerations

- Games are automatically cleaned up when the component unmounts
- Real-time listeners are properly disposed
- Optimistic updates for better UX
- Error boundaries for graceful failure handling 