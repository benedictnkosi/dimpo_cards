import { HOST_URL } from '@/config/api';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export interface DeviceRegistrationResponse {
  success: boolean;
  message?: string;
  deviceId?: string;
}

export interface DeviceRegistrationInfo {
  id: number;
  deviceId: string;
  learnerUid?: string;
  learnerEmail?: string;
  registrationDate: string;
}

/**
 * Get a unique device identifier
 * Uses Device.deviceName + Device.modelName + Device.osVersion as a fallback
 * since Device.deviceId is not available in all environments
 */
export async function getDeviceId(): Promise<string> {
  try {
    // Try to get device-specific information
    const deviceName = Device.deviceName || 'Unknown';
    const modelName = Device.modelName || 'Unknown';
    const osVersion = Device.osVersion || 'Unknown';
    const platform = Platform.OS || 'Unknown';
    
    // Create a unique identifier based on available device information
    const deviceInfo = `${platform}-${deviceName}-${modelName}-${osVersion}`;
    
    // Generate a hash-like string from the device info
    const deviceId = Array.from(deviceInfo)
      .map(char => char.charCodeAt(0).toString(16))
      .join('')
      .slice(0, 16);
    
    return deviceId;
  } catch (error) {
    console.error('[DeviceRegistration] Error getting device ID:', error);
    // Fallback to a random string if device info is not available
    return Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  }
}

/**
 * Register device with the server
 */
export async function registerDevice(deviceId: string, learnerUid?: string): Promise<DeviceRegistrationResponse> {
  try {
    console.log('[DeviceRegistration] Registering device:', deviceId, 'with learner UID:', learnerUid);
    
    const requestBody: any = {
      deviceId: deviceId
    };
    
    if (learnerUid) {
      requestBody.learnerUid = learnerUid;
    }
    
    const response = await fetch(`${HOST_URL}/api/device-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DeviceRegistration] Server error:', response.status, errorText);
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[DeviceRegistration] Device registered successfully:', result);
    
    return {
      success: true,
      message: 'Device registered successfully',
      deviceId: deviceId
    };
  } catch (error) {
    console.error('[DeviceRegistration] Error registering device:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Complete device registration process
 * Gets device ID and registers it with the server
 */
export async function completeDeviceRegistration(learnerUid?: string): Promise<DeviceRegistrationResponse> {
  try {
    const deviceId = await getDeviceId();
    console.log('[DeviceRegistration] Device ID:', deviceId);
    return await registerDevice(deviceId, learnerUid);
  } catch (error) {
    console.error('[DeviceRegistration] Error in complete device registration:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Check if device is already registered
 */
export async function checkDeviceRegistration(deviceId: string): Promise<DeviceRegistrationInfo | null> {
  try {
    console.log('[DeviceRegistration] Checking device registration:', deviceId);
    
    const response = await fetch(`${HOST_URL}/api/device-registration/device/${deviceId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      console.log('[DeviceRegistration] Device not registered');
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DeviceRegistration] Server error:', response.status, errorText);
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[DeviceRegistration] Device registration info:', result);
    
    return result;
  } catch (error) {
    console.error('[DeviceRegistration] Error checking device registration:', error);
    return null;
  }
} 