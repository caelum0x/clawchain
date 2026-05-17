/**
 * Tests for push notification service stub.
 */

import {
  pushNotificationService,
  getStubService,
} from "../services/push-notifications";

describe("StubPushNotificationService", () => {
  const testAddress = "claw1testuser1234567890";
  const stub = getStubService();

  describe("registerForPushNotifications", () => {
    it("should return a stub token for iOS", async () => {
      const result = await pushNotificationService.registerForPushNotifications(
        testAddress,
        "ios"
      );
      expect(result.platform).toBe("ios");
      expect(result.address).toBe(testAddress);
      expect(result.token).toContain("stub-push-token-ios-");
    });

    it("should return a stub token for Android", async () => {
      const result = await pushNotificationService.registerForPushNotifications(
        testAddress,
        "android"
      );
      expect(result.platform).toBe("android");
      expect(result.token).toContain("stub-push-token-android-");
    });

    it("should return a stub token for web", async () => {
      const result = await pushNotificationService.registerForPushNotifications(
        testAddress,
        "web"
      );
      expect(result.platform).toBe("web");
    });
  });

  describe("unregisterPushNotifications", () => {
    it("should complete without error", async () => {
      await expect(
        pushNotificationService.unregisterPushNotifications(testAddress)
      ).resolves.toBeUndefined();
    });
  });

  describe("preferences", () => {
    it("should return default preferences", async () => {
      const prefs = await pushNotificationService.getPreferences(testAddress);
      expect(prefs.transactions).toBe(true);
      expect(prefs.governance).toBe(true);
      expect(prefs.agentAlerts).toBe(true);
      expect(prefs.priceAlerts).toBe(false);
    });

    it("should update preferences", async () => {
      const updated = await pushNotificationService.setPreferences(
        testAddress,
        { priceAlerts: true, governance: false }
      );
      expect(updated.priceAlerts).toBe(true);
      expect(updated.governance).toBe(false);
      // Other values should remain at defaults
      expect(updated.transactions).toBe(true);
    });

    it("should persist updated preferences", async () => {
      // Set first
      await pushNotificationService.setPreferences(testAddress, {
        priceAlerts: true,
      });
      // Read back
      const prefs = await pushNotificationService.getPreferences(testAddress);
      expect(prefs.priceAlerts).toBe(true);
    });
  });

  describe("notifications", () => {
    const otherAddress = "claw1otheruser";

    beforeEach(() => {
      // Simulate a notification
      stub.simulateNotification(otherAddress, {
        title: "Test Transaction",
        body: "You received 100 CLAW",
        category: "transaction",
        data: { txHash: "ABCDEF" },
      });
    });

    it("should return simulated notifications", async () => {
      const notifs = await pushNotificationService.getNotifications(
        otherAddress
      );
      expect(notifs.length).toBeGreaterThanOrEqual(1);
      expect(notifs[0].title).toBe("Test Transaction");
      expect(notifs[0].read).toBe(false);
      expect(notifs[0].id).toBeTruthy();
    });

    it("should return empty array for unknown address", async () => {
      const notifs = await pushNotificationService.getNotifications(
        "claw1unknown"
      );
      expect(notifs).toEqual([]);
    });

    it("should mark a notification as read", async () => {
      const notifs = await pushNotificationService.getNotifications(
        otherAddress
      );
      const notifId = notifs[0].id;

      await pushNotificationService.markAsRead(notifId);

      const updated = await pushNotificationService.getNotifications(
        otherAddress
      );
      const found = updated.find((n) => n.id === notifId);
      expect(found?.read).toBe(true);
    });

    it("should mark all notifications as read", async () => {
      // Add another notification
      stub.simulateNotification(otherAddress, {
        title: "Another",
        body: "Another notification",
        category: "governance",
        data: {},
      });

      await pushNotificationService.markAllAsRead(otherAddress);

      const notifs = await pushNotificationService.getNotifications(
        otherAddress
      );
      expect(notifs.every((n) => n.read)).toBe(true);
    });

    it("should return unread count", async () => {
      // simulateNotification adds unread notifications
      stub.simulateNotification(otherAddress, {
        title: "Unread",
        body: "New governance proposal",
        category: "governance",
        data: {},
      });

      const count = await pushNotificationService.getUnreadCount(otherAddress);
      // At least the one we just added should be unread
      // (others may have been marked read in previous tests)
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it("should respect limit parameter", async () => {
      // Add many notifications
      for (let i = 0; i < 5; i++) {
        stub.simulateNotification(otherAddress, {
          title: `Notif ${i}`,
          body: `Body ${i}`,
          category: "agent",
          data: {},
        });
      }

      const notifs = await pushNotificationService.getNotifications(
        otherAddress,
        3
      );
      expect(notifs.length).toBeLessThanOrEqual(3);
    });
  });

  describe("simulateNotification", () => {
    it("should add a notification with auto-generated id and timestamp", () => {
      const testAddr = "claw1simulate";
      stub.simulateNotification(testAddr, {
        title: "Price Alert",
        body: "CLAW is up 10%",
        category: "price",
        data: { change: "10" },
      });

      // Verify we can read it back
      pushNotificationService.getNotifications(testAddr).then((notifs) => {
        expect(notifs).toHaveLength(1);
        expect(notifs[0].category).toBe("price");
        expect(notifs[0].id).toBeTruthy();
        expect(notifs[0].timestamp).toBeGreaterThan(0);
      });
    });
  });
});
