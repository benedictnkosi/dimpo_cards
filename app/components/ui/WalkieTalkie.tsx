import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
// REMOVE: import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
// REMOVE: import { storage } from '@/config/firebase';
import * as FileSystem from 'expo-file-system';
import { MaterialIcons } from '@expo/vector-icons';
import { HOST_URL } from '@/config/api';

interface WalkieTalkieProps {
  userId: string;
  opponentId: string;
  onAudioSent?: (url: string) => void;
  incomingAudioUrl?: string | null;
  onAudioPlayed?: () => void;
}

const WalkieTalkie: React.FC<WalkieTalkieProps> = ({
  userId,
  opponentId,
  onAudioSent,
  incomingAudioUrl,
  onAudioPlayed,
}) => {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackObj, setPlaybackObj] = useState<Audio.Sound | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Start recording
  const startRecording = async () => {
    try {
      setError(null);
      console.log('[WalkieTalkie] Requesting audio permissions...');
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      // Use the lowest quality preset
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      setIsRecording(true);
      console.log('[WalkieTalkie] Started recording');
    } catch (e) {
      setError('Failed to start recording.');
      console.log('[WalkieTalkie] Failed to start recording:', e);
    }
  };

  // Stop recording and upload via REST API
  const stopRecording = async () => {
    try {
      if (!recording) return;
      await recording.stopAndUnloadAsync();
      setIsRecording(false);
      const uri = recording.getURI();
      if (!uri) throw new Error('No recording URI');
      setIsUploading(true);
      console.log('[WalkieTalkie] Stopped recording. URI:', uri);
      // Upload to REST API
      const formData = new FormData();
      // @ts-ignore
      formData.append('file', {
        uri,
        name: `walkie_${userId}_to_${opponentId}_${Date.now()}.m4a`,
        type: 'audio/m4a',
      });
      const uploadUrl = `${HOST_URL}/api/cards/audio/upload`;
      console.log('[WalkieTalkie] Uploading audio to API:', uploadUrl);
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });
      const result = await response.json();
      setIsUploading(false);
      setRecording(null);
      if (result && result.filename) {
        const downloadUrl = `${HOST_URL}/api/cards/audio/download/${result.filename}`;
        console.log('[WalkieTalkie] Audio uploaded. Download URL:', downloadUrl);
        if (onAudioSent) onAudioSent(downloadUrl);
      } else {
        setError('Failed to upload audio.');
        console.log('[WalkieTalkie] Upload API did not return filename:', result);
      }
    } catch (e) {
      setError('Failed to upload audio.');
      setIsUploading(false);
      console.log('[WalkieTalkie] Failed to upload audio:', e);
    }
  };

  // Start recording on press in
  const handlePressIn = async () => {
    if (!isRecording && !isUploading) {
      await startRecording();
    }
  };

  // Stop recording and upload on press out
  const handlePressOut = async () => {
    if (isRecording) {
      await stopRecording();
    }
  };

  // Helper to extract filename from download URL
  const getFilenameFromUrl = (url: string) => {
    const parts = url.split('/');
    return parts[parts.length - 1];
  };

  useEffect(() => {
    let isMounted = true;
    const playAndDelete = async () => {
      if (incomingAudioUrl && !isPlaying) {
        setIsPlaying(true);
        try {
          console.log('[WalkieTalkie] Incoming audio detected. URL:', incomingAudioUrl);
          // Set audio mode to play through loudspeaker
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            interruptionModeIOS: 1, // 1 = DO_NOT_MIX
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false, // This is the key for Android
          });
          const { sound } = await Audio.Sound.createAsync({ uri: incomingAudioUrl });
          setPlaybackObj(sound);
          await sound.playAsync();
          console.log('[WalkieTalkie] Playing incoming audio...');
          sound.setOnPlaybackStatusUpdate(async (status) => {
            if (status.isLoaded && status.didJustFinish && isMounted) {
              console.log('[WalkieTalkie] Playback finished. Deleting audio...');
              // Delete audio after playback
              try {
                const filename = getFilenameFromUrl(incomingAudioUrl);
                const deleteUrl = `${HOST_URL}/api/cards/audio/delete/${filename}`;
                const res = await fetch(deleteUrl, { method: 'DELETE' });
                const json = await res.json();
                console.log('[WalkieTalkie] Delete response:', json);
              } catch (err) {
                console.log('[WalkieTalkie] Failed to delete audio:', err);
              }
              if (onAudioPlayed) onAudioPlayed();
              setIsPlaying(false);
              setPlaybackObj(null);
            }
          });
        } catch (err) {
          setError('Failed to play audio');
          setIsPlaying(false);
        }
      }
    };
    playAndDelete();
    return () => {
      isMounted = false;
      if (playbackObj) {
        playbackObj.unloadAsync();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingAudioUrl]);

  return (
    <View style={[styles.container, { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }]}>
      <TouchableOpacity
        style={[
          styles.recordButton,
          isRecording ? styles.recording : null,
          isUploading ? styles.disabled : null,
        ]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isUploading}
        activeOpacity={0.7}
      >
        {isRecording ? (
          <MaterialIcons name="mic" size={36} color="#fff" />
        ) : isUploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <MaterialIcons name="keyboard-voice" size={36} color="#fff" />
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#19C37D',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    elevation: 2,
  },
  buttonActive: {
    backgroundColor: '#dc2626',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  statusText: {
    color: '#19C37D',
    marginLeft: 12,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#dc2626',
    marginLeft: 12,
    fontWeight: 'bold',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 30,
    backgroundColor: '#19C37D',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    marginRight: 10,
  },
  recording: {
    backgroundColor: '#dc2626',
  },
  disabled: {
    opacity: 0.7,
  },
  label: {
    marginLeft: 12,
    fontSize: 14,
    color: '#555',
  },
});

export default WalkieTalkie; 