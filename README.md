# Dimpo Cards

A React Native card game app with multiplayer functionality.

## Features

### Game Modes
- **Casino Game**: A strategic card game with building mechanics
- **Crazy 8s**: Classic Crazy 8s card game
- **Top 10**: Card collection game

### Multiplayer Features
- Real-time multiplayer gameplay
- Firebase integration for game state synchronization
- WhatsApp integration for opponent communication
- Game lobbies and matchmaking

### Card Interactions
- **Drag & Drop**: Drag cards from your hand directly to the discard pile to play them
- **Tap to Select**: Tap cards to select them for building or other actions
- **Visual Feedback**: Cards highlight when they can be played
- **Smooth Animations**: Cards animate smoothly when moving between areas

### Drag Functionality
The casino game now supports intuitive drag and drop:
- **Drag to Play**: Drag any playable card from your hand to the discard pile
- **Visual Indicators**: The discard pile highlights when you drag a card over it
- **Flick to Play**: Flick a card quickly to automatically play it
- **Fallback**: Traditional tap-to-select still works for building and other actions

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up Firebase configuration in `config/firebase.ts`

3. Start the development server:
```bash
npm start
```

4. Run on your device or simulator:
```bash
npm run ios
# or
npm run android
```

## Game Rules

### Casino Game
- Players take turns playing cards
- Cards can be played if they match the suit or value of the top card
- 8s are wild and allow suit changes
- Players can build temporary decks for strategic advantage
- Game ends when a player runs out of cards

### Crazy 8s
- Classic Crazy 8s rules
- 8s are wild cards
- First player to get rid of all cards wins

## Technical Details

- **Framework**: React Native with Expo
- **State Management**: React Context + Firebase
- **Animations**: React Native Reanimated
- **Gestures**: React Native Gesture Handler
- **Backend**: Firebase Firestore
- **Authentication**: Firebase Auth

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request