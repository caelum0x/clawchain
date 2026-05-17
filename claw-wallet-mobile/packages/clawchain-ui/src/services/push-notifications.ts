/**
 * Push notification service stub for ClawChain mobile wallet.
 *
 * This module provides the interface and stub implementation for push
 * notifications. In production, this would integrate with:
 * - expo-notifications for Expo-managed push tokens
 * - APNs (iOS) and FCM (Android) for native push delivery
 * - A backend notification service that watches on-chain events
 *
 * Supported notification categories:
 * - Transaction confirmations (send, receive, shield, unshield)
 * - Governance proposal state changes (new proposal, voting started, passed)
 * - Agent status alerts (heartbeat missed, task completed, rewards earned)
 * - Price alerts (configurable thresholds)
 */

import type {
  NotificationPreferences,
  PushNotificationToken,
} from "./clawchain-api.js";

export type NotificationCategory =
  | "transaction"
  | "governance"
  | "agent"
  | "price";

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  data: Record<string, string>;
  timestamp: number;
  read: boolean;
}

export interface PushNotificationService {
  /** Register the device for push notifications and return the token. */
  registerForPushNotifications(
    address: string,
    platform: "ios" | "android" | "web"
  ): Promise<PushNotificationToken>;

  /** Unregister from push notifications. */
  unregisterPushNotifications(address: string): Promise<void>;

  /** Get current notification preferences. */
  getPreferences(address: string): Promise<NotificationPreferences>;

  /** Update notification preferences. */
  setPreferences(
    address: string,
    prefs: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences>;

  /** Get recent notifications. */
  getNotifications(
    address: string,
    limit?: number
  ): Promise<PushNotification[]>;

  /** Mark a notification as read. */
  markAsRead(notificationId: string): Promise<void>;

  /** Mark all notifications as read. */
  markAllAsRead(address: string): Promise<void>;

  /** Get unread count. */
  getUnreadCount(address: string): Promise<number>;
}

// ── Stub implementation ──

const DEFAULT_PREFERENCES: NotificationPreferences = {
  transactions: true,
  governance: true,
  agentAlerts: true,
  priceAlerts: false,
};

/**
 * Stub push notification service.
 *
 * Returns plausible mock data for development and testing. In production,
 * replace with an implementation backed by expo-notifications + a real
 * notification backend.
 */
class StubPushNotificationService implements PushNotificationService {
  private preferences: Map<string, NotificationPreferences> = new Map();
  private notifications: Map<string, PushNotification[]> = new Map();

  async registerForPushNotifications(
    address: string,
    platform: "ios" | "android" | "web"
  ): Promise<PushNotificationToken> {
    // Stub: return a fake token. In production, this calls
    // Notifications.getExpoPushTokenAsync() and registers with the backend.
    return {
      token: `stub-push-token-${platform}-${Date.now()}`,
      platform,
      address,
    };
  }

  async unregisterPushNotifications(_address: string): Promise<void> {
    // Stub: no-op. In production, calls backend to remove the device token.
  }

  async getPreferences(address: string): Promise<NotificationPreferences> {
    return this.preferences.get(address) ?? { ...DEFAULT_PREFERENCES };
  }

  async setPreferences(
    address: string,
    prefs: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const current = this.preferences.get(address) ?? { ...DEFAULT_PREFERENCES };
    const updated = { ...current, ...prefs };
    this.preferences.set(address, updated);
    return updated;
  }

  async getNotifications(
    address: string,
    limit = 20
  ): Promise<PushNotification[]> {
    const stored = this.notifications.get(address) ?? [];
    return stored.slice(0, limit);
  }

  async markAsRead(notificationId: string): Promise<void> {
    for (const [, notifications] of this.notifications) {
      const notification = notifications.find((n) => n.id === notificationId);
      if (notification) {
        notification.read = true;
        return;
      }
    }
  }

  async markAllAsRead(address: string): Promise<void> {
    const stored = this.notifications.get(address) ?? [];
    for (const n of stored) {
      n.read = true;
    }
  }

  async getUnreadCount(address: string): Promise<number> {
    const stored = this.notifications.get(address) ?? [];
    return stored.filter((n) => !n.read).length;
  }

  /**
   * Simulate receiving a notification (for testing / development).
   */
  simulateNotification(address: string, notification: Omit<PushNotification, "id" | "timestamp" | "read">): void {
    const existing = this.notifications.get(address) ?? [];
    existing.unshift({
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      read: false,
    });
    this.notifications.set(address, existing);
  }
}

/** Singleton push notification service instance. */
export const pushNotificationService: PushNotificationService =
  new StubPushNotificationService();

/**
 * Cast to StubPushNotificationService for testing access to
 * simulateNotification().
 */
export function getStubService(): StubPushNotificationService {
  return pushNotificationService as StubPushNotificationService;
}
