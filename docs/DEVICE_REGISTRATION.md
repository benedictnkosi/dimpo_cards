# Device Registration

This document describes the device registration feature implemented in the Dimpo Reads app.

## Overview

The device registration feature automatically registers each user's device with the server when they:
- Create a new account (registration)
- Log in to an existing account
- Continue as a guest user

## Implementation

### Service Layer

The device registration is handled by the `services/deviceRegistration.ts` service which provides:

- `getDeviceId()`: Generates a unique device identifier based on device information
- `registerDevice(deviceId)`: Registers a device ID with the server
- `completeDeviceRegistration()`: Complete workflow that gets device ID and registers it

### Device ID Generation

The device ID is generated using a combination of:
- Platform (iOS/Android)
- Device name
- Model name  
- OS version

If device information is unavailable, it falls back to a random 16-character string.

### API Endpoint

The device registration uses the following endpoint:
```
POST {{host}}/api/device-registration
Content-Type: application/json

{
    "deviceId": "your-device-id-here"
}
```

### Integration Points

Device registration is integrated into:

1. **Registration Flow** (`app/components/RegisterForm.tsx`)
   - Called after successful user registration
   - Does not block registration if device registration fails

2. **Login Flow** (`app/login.tsx`)
   - Called after successful authentication
   - Does not block login if device registration fails

3. **Guest Account Creation** (`app/onboarding.tsx`)
   - Called after guest account creation
   - Does not block guest account creation if device registration fails

## Error Handling

Device registration failures are logged but do not block the main user flows:
- Registration continues even if device registration fails
- Login continues even if device registration fails
- Guest account creation continues even if device registration fails

This ensures a smooth user experience while still attempting to register devices for analytics and tracking purposes.

## Testing

A test script is available at `scripts/test-device-registration.js` to verify the device registration endpoint:

```bash
node scripts/test-device-registration.js
```

## Configuration

The device registration service uses the `HOST_URL` from `config/api.ts` to determine the server endpoint.

## Dependencies

- `expo-device`: For accessing device information
- `react-native`: For platform detection
- `fetch`: For HTTP requests

## Security Considerations

- Device IDs are generated locally and do not contain sensitive information
- The registration request is sent over HTTPS
- Failed device registration does not affect core app functionality
- No personal user data is sent with device registration requests 