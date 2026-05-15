import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import NotificationBell from "../NotificationBell";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockMarkRead = vi.fn();
const mockMarkAllRead = vi.fn();
const mockClearAll = vi.fn();

let mockNotifications: Array<{
  id: string;
  type: string;
  category: "task" | "message" | "gpu" | "privacy";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}> = [];

let mockUnreadCount = 0;

vi.mock("../../hooks/useNotifications.ts", () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: mockUnreadCount,
    markRead: mockMarkRead,
    markAllRead: mockMarkAllRead,
    clearAll: mockClearAll,
  }),
}));

const mockToggleCategory = vi.fn();

vi.mock("../../hooks/useNotificationPrefs.ts", () => ({
  useNotificationPrefs: () => ({
    prefs: { task: true, message: true, gpu: true, privacy: true },
    toggleCategory: mockToggleCategory,
    isEnabled: () => true,
  }),
}));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function makeNotification(
  overrides: Partial<(typeof mockNotifications)[0]> = {},
) {
  return {
    id: "notif-1",
    type: "complete_task",
    category: "task" as const,
    title: "Task Completed",
    message: "Agent finished task #42",
    timestamp: Date.now() - 30_000,
    read: false,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotifications = [];
    mockUnreadCount = 0;
  });

  it("renders the bell button", () => {
    render(<NotificationBell />);
    expect(
      screen.getByRole("button", { name: /Notifications/i }),
    ).toBeInTheDocument();
  });

  it("shows unread badge when there are unread notifications", () => {
    mockUnreadCount = 3;
    render(<NotificationBell />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not show badge when no unread", () => {
    mockUnreadCount = 0;
    render(<NotificationBell />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows 99+ when more than 99 unread", () => {
    mockUnreadCount = 150;
    render(<NotificationBell />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("opens notification panel on click", async () => {
    mockNotifications = [makeNotification()];
    mockUnreadCount = 1;
    render(<NotificationBell />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Notifications/i }));

    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("Task Completed")).toBeInTheDocument();
    expect(screen.getByText("Agent finished task #42")).toBeInTheDocument();
  });

  it("shows empty state when no notifications", async () => {
    render(<NotificationBell />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Notifications/i }));

    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
  });

  it("calls markAllRead when button clicked", async () => {
    mockNotifications = [makeNotification()];
    mockUnreadCount = 1;
    render(<NotificationBell />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Notifications/i }));
    await user.click(screen.getByText("Mark all read"));

    expect(mockMarkAllRead).toHaveBeenCalledOnce();
  });

  it("calls clearAll when Clear button clicked", async () => {
    mockNotifications = [makeNotification()];
    mockUnreadCount = 1;
    render(<NotificationBell />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Notifications/i }));
    await user.click(screen.getByText("Clear"));

    expect(mockClearAll).toHaveBeenCalledOnce();
  });

  it("calls markRead when clicking an unread notification", async () => {
    mockNotifications = [makeNotification({ id: "n1", read: false })];
    mockUnreadCount = 1;
    render(<NotificationBell />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Notifications/i }));
    await user.click(screen.getByText("Task Completed"));

    expect(mockMarkRead).toHaveBeenCalledWith("n1");
  });

  it("shows category badges for notifications", async () => {
    mockNotifications = [
      makeNotification({ id: "1", category: "task" }),
      makeNotification({
        id: "2",
        category: "gpu",
        title: "GPU Job Done",
        message: "Job completed",
      }),
    ];
    mockUnreadCount = 2;
    render(<NotificationBell />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Notifications/i }));

    expect(screen.getByText("Task")).toBeInTheDocument();
    expect(screen.getByText("GPU")).toBeInTheDocument();
  });

  it("shows multiple notifications in list", async () => {
    mockNotifications = [
      makeNotification({ id: "1", title: "First" }),
      makeNotification({ id: "2", title: "Second" }),
      makeNotification({ id: "3", title: "Third" }),
    ];
    mockUnreadCount = 3;
    render(<NotificationBell />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Notifications/i }));

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
  });
});
