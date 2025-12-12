import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase'; // Adjust this path to match your project structure

type Car = {
  id: string;
  make: string;
  model: string;
  year?: number;
  currentMileage?: number;
  oilChangeInterval?: number;
  lastOilChangeMileage?: number;
  tireRotationInterval?: number;
  lastTireRotationMileage?: number;
  airFilterInterval?: number;
  lastAirFilterMileage?: number;
  cabinFilterInterval?: number;
  lastCabinFilterMileage?: number;
  coolantFlushInterval?: number;
  lastCoolantFlushMileage?: number;
  sparkPlugInterval?: number;
  lastSparkPlugMileage?: number;
  brakeInspectionInterval?: number;
  lastBrakeInspectionMileage?: number;
  brakeFluidInterval?: number;
  lastBrakeFluidMileage?: number;
  transmissionServiceInterval?: number;
  lastTransmissionServiceMileage?: number;
  differentialServiceInterval?: number;
  lastDifferentialServiceMileage?: number;
};

const getScottyMessage = (serviceName: string, milesOverdue: number, car: Car) => {
  const carName = `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim() || 'your car';

  if (milesOverdue < 0) {
    const overdueMessages = [
      `🚨 Scotty here! Your ${carName}'s ${serviceName.toLowerCase()} is ${Math.abs(milesOverdue).toLocaleString()} miles overdue. Don't ignore this!`,
      `⚠️ Scotty says: Your ${serviceName.toLowerCase()} should've been done ${Math.abs(milesOverdue).toLocaleString()} miles ago!`,
      `🔧 Hey! Scotty noticed your ${carName} needs ${serviceName.toLowerCase()} - you're ${Math.abs(milesOverdue).toLocaleString()} miles overdue!`,
      `🚗💨 Scotty's Warning: ${serviceName} is seriously overdue by ${Math.abs(milesOverdue).toLocaleString()} miles. Take care of your ride!`,
    ];
    return overdueMessages[Math.floor(Math.random() * overdueMessages.length)];
  } else {
    const dueSoonMessages = [
      `🔔 Scotty recommends: Schedule your ${serviceName.toLowerCase()} soon - only ${milesOverdue.toLocaleString()} miles left!`,
      `👋 Hey! Scotty here. Your ${carName} will need ${serviceName.toLowerCase()} in ${milesOverdue.toLocaleString()} miles.`,
      `🔧 Scotty's Tip: ${serviceName} coming up in ${milesOverdue.toLocaleString()} miles. Plan ahead!`,
      `🚗 Scotty says: Don't forget - ${serviceName.toLowerCase()} due in ${milesOverdue.toLocaleString()} miles!`,
    ];
    return dueSoonMessages[Math.floor(Math.random() * dueSoonMessages.length)];
  }
};

// Register for push notifications and store token
export async function registerForPushNotifications(userId: string) {
  if (!Device.isDevice) {
    console.log('Must use physical device for Push Notifications');
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({
      projectId: 'b51c33c1-2276-4d1a-916f-aafe0c888374'
    })).data;

    // Store token in Firestore
    await updateDoc(doc(db, 'users', userId), {
      expoPushToken: token,
      updatedAt: new Date()
    });
    
    console.log('Push token saved:', token);

    // Configure Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#E11D48',
      });
    }

    return token;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
  }
}

// Send push notification to a user (with preference checks)
export async function sendPushNotification(
  recipientUserId: string,
  notification: {
    title: string;
    body: string;
    data?: any;
    notificationType?: 'builds' | 'replies' | 'scottyCheckins' | 'community';
  }
) {
  try {
    // Get recipient's push token and preferences from Firestore
    const userDoc = await getDoc(doc(db, 'users', recipientUserId));
    const userData = userDoc.data();
    const pushToken = userData?.expoPushToken;

    if (!pushToken) {
      console.log('No push token found for user:', recipientUserId);
      return;
    }

   // Check notification preferences
   const notifBuilds = userData?.notifBuilds ?? true;
   const notifReplies = userData?.notifReplies ?? true;
   const notifScottyCheckins = userData?.notifScottyCheckins ?? true;
   const notifCommunity = userData?.notifCommunity ?? true;

   // Respect user preferences
   if (notification.notificationType === 'builds' && !notifBuilds) {
     console.log('User has disabled build notifications');
     return;
   }
   if (notification.notificationType === 'replies' && !notifReplies) {
     console.log('User has disabled reply notifications');
     return;
   }
   if (notification.notificationType === 'scottyCheckins' && !notifScottyCheckins) {
     console.log('User has disabled Scotty check-in notifications');
     return;
   }
   if (notification.notificationType === 'community' && !notifCommunity) {
     console.log('User has disabled community notifications');
     return;
   }

    // Send push notification via Expo API
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      }),
    });

    const result = await response.json();
    console.log('Push notification sent:', result);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

// Check and schedule maintenance notifications (with push support)
export async function checkAndScheduleNotifications(carData: Car, userId: string) {
  if (!carData.currentMileage) return;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const services = [
    { name: 'Oil Change', interval: carData.oilChangeInterval, lastMileage: carData.lastOilChangeMileage || 0 },
    { name: 'Tire Rotation', interval: carData.tireRotationInterval, lastMileage: carData.lastTireRotationMileage || 0 },
    { name: 'Air Filter', interval: carData.airFilterInterval, lastMileage: carData.lastAirFilterMileage || 0 },
    { name: 'Cabin Filter', interval: carData.cabinFilterInterval, lastMileage: carData.lastCabinFilterMileage || 0 },
    { name: 'Coolant Flush', interval: carData.coolantFlushInterval, lastMileage: carData.lastCoolantFlushMileage || 0 },
    { name: 'Spark Plugs', interval: carData.sparkPlugInterval, lastMileage: carData.lastSparkPlugMileage || 0 },
    { name: 'Brake Inspection', interval: carData.brakeInspectionInterval, lastMileage: carData.lastBrakeInspectionMileage || 0 },
    { name: 'Brake Fluid', interval: carData.brakeFluidInterval, lastMileage: carData.lastBrakeFluidMileage || 0 },
    { name: 'Transmission Service', interval: carData.transmissionServiceInterval, lastMileage: carData.lastTransmissionServiceMileage || 0 },
    { name: 'Differential Service', interval: carData.differentialServiceInterval, lastMileage: carData.lastDifferentialServiceMileage || 0 },
  ];

  for (const service of services) {
    if (!service.interval) continue;

    const nextDue = service.lastMileage + service.interval;
    const remaining = nextDue - carData.currentMileage;

    if (remaining <= 500) {
      const message = getScottyMessage(service.name, remaining, carData);
      
      // Schedule local notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🔧 Scotty's Garage Alert`,
          body: message,
          sound: true,
          data: { carId: carData.id, serviceType: service.name, screen: 'maintenance' },
        },
        trigger: null,
      });

      // Also send push notification (respects user preferences)
      await sendPushNotification(userId, {
        title: `🔧 Scotty's Garage Alert`,
        body: message,
        data: { carId: carData.id, serviceType: service.name, screen: 'maintenance' },
        notificationType: 'builds'
      });
    }
  }
}