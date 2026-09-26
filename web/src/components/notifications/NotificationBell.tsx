import { useEffect, useMemo, useRef, useState } from "react";

import { en } from "@/content/en";
import {
  useNotifications,
  useReadAllNotifications,
  useReadNotification,
} from "@/features/notifications/hooks";
import { useDialogA11y } from "@/lib/useDialogA11y";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

type ToastItem = {
  id: string;
  message: string;
};

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const dropdownId = "notification-dropdown";
  const seenBudgetNotifications = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  const notificationsQuery = useNotifications(1, 8, 60000);
  const readMutation = useReadNotification();
  const readAllMutation = useReadAllNotifications();

  const notifications = useMemo(
    () => notificationsQuery.data?.data ?? [],
    [notificationsQuery.data],
  );
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  const unreadBudgetNotifications = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          notification.readAt === null &&
          (notification.type === "budget_near" || notification.type === "budget_exceeded"),
      ),
    [notifications],
  );

  useEffect(() => {
    if (!notificationsQuery.data) {
      return;
    }

    if (!initialized.current) {
      unreadBudgetNotifications.forEach((item) => {
        seenBudgetNotifications.current.add(item.id);
      });
      initialized.current = true;
      return;
    }

    const freshItems = unreadBudgetNotifications.filter(
      (item) => !seenBudgetNotifications.current.has(item.id),
    );

    if (freshItems.length === 0) {
      return;
    }

    for (const item of freshItems) {
      seenBudgetNotifications.current.add(item.id);
    }

    const newToasts = freshItems.map((item) => ({
      id: item.id,
      message: `${item.title} - ${item.body}`,
    }));

    setToasts((prev) => [...prev, ...newToasts]);
  }, [notificationsQuery.data, unreadBudgetNotifications]);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 5000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toasts]);

  useDialogA11y({
    isOpen,
    containerRef: dropdownRef,
    onClose: () => setIsOpen(false),
  });

  return (
    <div className="notification-bell">
      <button
        type="button"
        className="btn btn-outline notification-bell__toggle"
        aria-label={en.notifications.bellAriaLabel}
        aria-expanded={isOpen}
        aria-controls={dropdownId}
        onClick={() => {
          setIsOpen((prev) => !prev);
        }}
      >
        <span aria-hidden="true">Bell</span>
        {unreadCount > 0 ? <span className="notification-bell__badge">{unreadCount}</span> : null}
      </button>

      {isOpen ? (
        <div
          ref={dropdownRef}
          id={dropdownId}
          className="notification-dropdown"
          role="dialog"
          aria-label={en.notifications.dropdownTitle}
        >
          <div className="notification-dropdown__header">
            <strong>{en.notifications.dropdownTitle}</strong>
            <button
              type="button"
              className="btn btn-outline"
              aria-label={en.notifications.closeDropdownAriaLabel}
              onClick={() => setIsOpen(false)}
            >
              <span aria-hidden="true">x</span>
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                void readAllMutation.mutateAsync();
              }}
              disabled={readAllMutation.isPending || unreadCount === 0}
            >
              {en.notifications.markAllReadAction}
            </button>
          </div>

          {notifications.length === 0 ? (
            <p className="notification-dropdown__empty">{en.notifications.emptyState}</p>
          ) : (
            <ul className="notification-dropdown__list">
              {notifications.map((item) => (
                <li key={item.id} className={item.readAt ? "is-read" : "is-unread"}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!item.readAt) {
                        void readMutation.mutateAsync(item.id);
                      }
                    }}
                  >
                    <span className="notification-item__title">{item.title}</span>
                    <span className="notification-item__body">{item.body}</span>
                    <span className="notification-item__time">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="notification-toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className="notification-toast" role="status">
            <strong>{en.notifications.toastTitle}</strong>
            <p>{toast.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
