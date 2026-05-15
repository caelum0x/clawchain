import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock useChainEvents so the hook does not attempt a real WebSocket connection.
const mockUseChainEvents = vi.fn();
vi.mock("../useChainEvents.ts", () => ({
  useChainEvents: (opts: any) => {
    mockUseChainEvents(opts);
    return { connected: false, lastEvent: null };
  },
}));

// Mock the chain module so CHAIN_RPC resolves without network.
vi.mock("../../lib/chain.ts", () => ({
  CHAIN_RPC: "localhost:26657",
}));

// Suppress browser Notification API (jsdom does not support it).
const mockRequestPermission = vi.fn().mockResolvedValue("denied");
(globalThis as any).Notification = class MockNotification {
  static permission = "denied";
  static requestPermission = mockRequestPermission;
  constructor() {}
};

import { useNotifications } from "../useNotifications";

beforeEach(() => {
  localStorage.clear();
  mockUseChainEvents.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useNotifications", () => {
  it("returns empty notifications initially", () => {
    const { result } = renderHook(() => useNotifications());

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it("exposes markRead, markAllRead, and clearAll functions", () => {
    const { result } = renderHook(() => useNotifications());

    expect(typeof result.current.markRead).toBe("function");
    expect(typeof result.current.markAllRead).toBe("function");
    expect(typeof result.current.clearAll).toBe("function");
  });

  it("subscribes to chain events with expected event types", () => {
    renderHook(() => useNotifications());

    expect(mockUseChainEvents).toHaveBeenCalled();
    const opts = mockUseChainEvents.mock.calls[0][0];
    expect(opts.enabled).toBe(true);
    expect(opts.eventTypes).toContain("complete_task");
    expect(opts.eventTypes).toContain("shield");
    expect(opts.eventTypes).toContain("send_message");
    expect(typeof opts.onEvent).toBe("function");
  });

  it("adds a notification when onEvent is invoked", () => {
    const { result } = renderHook(() => useNotifications());

    // Grab the onEvent callback that was passed to useChainEvents.
    const opts = mockUseChainEvents.mock.calls[0][0];
    const onEvent = opts.onEvent;

    act(() => {
      onEvent({
        type: "complete_task",
        height: 100,
        attributes: { task_id: "7", assignee: "claw1abc" },
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.unreadCount).toBe(1);

    const n = result.current.notifications[0];
    expect(n.category).toBe("task");
    expect(n.title).toBe("Task Completed");
    expect(n.read).toBe(false);
    expect(n.message).toContain("7");
  });

  it("markRead marks a single notification as read", () => {
    const { result } = renderHook(() => useNotifications());

    const onEvent = mockUseChainEvents.mock.calls[0][0].onEvent;

    act(() => {
      onEvent({ type: "shield", height: 10, attributes: { amount: "1000" } });
      onEvent({ type: "unshield", height: 11, attributes: { amount: "500" } });
    });

    expect(result.current.unreadCount).toBe(2);

    const firstId = result.current.notifications[0].id;

    act(() => {
      result.current.markRead(firstId);
    });

    expect(result.current.unreadCount).toBe(1);
    expect(
      result.current.notifications.find((n) => n.id === firstId)!.read,
    ).toBe(true);
  });

  it("markAllRead marks every notification as read", () => {
    const { result } = renderHook(() => useNotifications());
    const onEvent = mockUseChainEvents.mock.calls[0][0].onEvent;

    act(() => {
      onEvent({ type: "shield", height: 10, attributes: {} });
      onEvent({ type: "unshield", height: 11, attributes: {} });
      onEvent({ type: "send_message", height: 12, attributes: {} });
    });

    expect(result.current.unreadCount).toBe(3);

    act(() => {
      result.current.markAllRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications.every((n) => n.read)).toBe(true);
  });

  it("clearAll removes all notifications", () => {
    const { result } = renderHook(() => useNotifications());
    const onEvent = mockUseChainEvents.mock.calls[0][0].onEvent;

    act(() => {
      onEvent({ type: "shield", height: 10, attributes: {} });
    });

    expect(result.current.notifications).toHaveLength(1);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it("persists notifications to localStorage", () => {
    const { result } = renderHook(() => useNotifications());
    const onEvent = mockUseChainEvents.mock.calls[0][0].onEvent;

    act(() => {
      onEvent({
        type: "complete_task",
        height: 50,
        attributes: { task_id: "99" },
      });
    });

    const stored = localStorage.getItem("claw-notifications");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].type).toBe("complete_task");
  });

  it("loads persisted notifications on mount", () => {
    // Seed localStorage before mounting the hook.
    const seeded = [
      {
        id: "test-1",
        type: "shield",
        category: "privacy",
        title: "Tokens Shielded",
        message: "1000 shielded",
        timestamp: Date.now(),
        read: false,
      },
    ];
    localStorage.setItem("claw-notifications", JSON.stringify(seeded));

    const { result } = renderHook(() => useNotifications());

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe("test-1");
    expect(result.current.unreadCount).toBe(1);
  });

  it("categorizes gpu events correctly", () => {
    const { result } = renderHook(() => useNotifications());
    const onEvent = mockUseChainEvents.mock.calls[0][0].onEvent;

    act(() => {
      onEvent({
        type: "submit_compute_job",
        height: 30,
        attributes: { job_id: "5", resource_id: "3" },
      });
    });

    expect(result.current.notifications[0].category).toBe("gpu");
    expect(result.current.notifications[0].title).toBe("Compute Job Submitted");
  });

  it("categorizes message events correctly", () => {
    const { result } = renderHook(() => useNotifications());
    const onEvent = mockUseChainEvents.mock.calls[0][0].onEvent;

    act(() => {
      onEvent({
        type: "send_message",
        height: 31,
        attributes: { sender: "claw1a", recipient: "claw1b" },
      });
    });

    expect(result.current.notifications[0].category).toBe("message");
    expect(result.current.notifications[0].title).toBe("New Message");
  });
});
