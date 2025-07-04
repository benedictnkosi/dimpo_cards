# TapToSelectQuestion Component

A Duolingo-inspired tap-to-select question component for React Native with smooth animations, theming support, and feedback states.

## Features

- 🎨 **Duolingo-inspired design** with modern UI elements
- 🌙 **Dark/Light theme support** with automatic color adaptation
- ✨ **Smooth animations** including press feedback and shake animations for wrong answers
- 🎯 **Accessibility support** with proper labels and roles
- 📱 **Responsive design** that works on different screen sizes
- 🔄 **State management** with proper feedback handling

## Usage

```tsx
import { TapToSelectQuestion } from './TapToSelectQuestion';

const questionData = {
  id: "sci_q1",
  type: "tap-to-select",
  prompt: "Is Rent Income an income or an expense?",
  options: [
    "Income",
    "Expense"
  ],
  answer: "Income"
};

function MyQuestionScreen() {
  const [isQuestionAnswered, setIsQuestionAnswered] = useState(false);

  return (
    <TapToSelectQuestion
      id={questionData.id}
      prompt={questionData.prompt}
      options={questionData.options}
      answer={questionData.answer}
      setIsQuestionAnswered={setIsQuestionAnswered}
    />
  );
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the question |
| `prompt` | `string` | Yes | The question text to display |
| `options` | `string[]` | Yes | Array of answer options |
| `answer` | `string` | Yes | The correct answer (must match one of the options) |
| `setOnCheck` | `(fn: () => void) => void` | No | Callback to set the check function |
| `setOnContinue` | `(fn: () => void) => void` | No | Callback to set the continue function |
| `setIsQuestionAnswered` | `(answered: boolean) => void` | Yes | Callback to update question answered state |

## Integration with Feedback System

The component integrates with the app's feedback system using the `useFeedback` hook. It automatically:

- Shows correct/incorrect feedback
- Displays the correct answer when wrong
- Provides visual feedback with colors and animations
- Handles question state management

## Styling

The component uses the app's theme system and automatically adapts to:

- **Light/Dark mode** with appropriate colors
- **Primary colors** for selected states
- **Success/Error colors** for feedback states
- **Consistent spacing** and typography

## Animations

- **Press animation**: Scale down on press for tactile feedback
- **Shake animation**: Wrong answers trigger a shake effect
- **Smooth transitions**: All state changes are animated

## Accessibility

- Proper `accessibilityRole` and `accessibilityLabel` for each option
- Screen reader friendly with descriptive labels
- Keyboard navigation support (if applicable)

## Example with Complete Integration

See `TapToSelectExample.tsx` for a complete example showing how to integrate with the feedback button and theme system.

## Dependencies

- React Native core components
- App theme context (`useTheme`)
- App feedback context (`useFeedback`)
- Themed components (`ThemedText`, `ThemedView`) 