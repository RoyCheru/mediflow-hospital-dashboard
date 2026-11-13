import { api } from "@/lib/api/client";
import type { ListParams, Notification, NotificationTemplate, Paginated } from "@/types/api";

export const notificationKeys = {
  list: (params?: ListParams) => ["admin", "notifications", params] as const,
  templates: ["admin", "notifications", "templates"] as const,
};

export function listNotifications(params?: ListParams) {
  return api.get<Paginated<Notification>>("/notifications/delivery-status", params);
}

export function listTemplates() {
  return api.get<{ items: NotificationTemplate[] }>("/admin/notification-templates");
}

export function updateTemplate(id: string, body: Record<string, unknown>) {
  return api.patch<NotificationTemplate>(`/admin/notification-templates/${id}`, body);
}

export function retryNotification(id: string) {
  return api.post<Notification>(`/admin/notifications/${id}/retry`);
}
