import { router } from 'expo-router';

export function handleNotificationResponse(notification: any) {
  const data = notification.notification.request.content.data;
  
  if (!data || !data.type) return;

  console.log('Notification tapped:', data);

  // Small delay to ensure app is ready
  setTimeout(() => {
    switch (data.type) {
      case 'like':
      case 'comment':
      case 'reply':
        // Open community tab (user can see the notification there)
        router.push('/(tabs)/community');
        break;

      case 'follow':
        // Open the follower's profile
        if (data.handle) {
          router.push(`/u/${data.handle}`);
        } else {
          router.push('/(tabs)/community');
        }
        break;

      case 'scotty_reply':
      case 'daily_checkin':
        // Open Scotty chat
        router.push('/(tabs)/scotty');
        break;

      case 'maintenance':
        // Open garage
        router.push('/(tabs)/garage');
        break;

      default:
        console.log('Unknown notification type:', data.type);
    }
  }, 300);
}