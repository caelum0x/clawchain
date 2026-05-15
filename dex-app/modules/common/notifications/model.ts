// Local TxInfo type for transaction info
export type TxInfo = {
  code: number;
  txhash: string;
  codespace?: string;
  raw_log: string;
  height: number;
  logs?: any[];
};

export type TxNotificationPayload = {
  txHash: string;
  txInfo?: TxInfo | undefined;
  txType?: string | undefined;
  data?: any;
};

export type GenericNotificationPayload = {
  title: string;
  description?: string;
};

type NotificationPayload =
  | ({
      type: "started";
    } & TxNotificationPayload)
  | ({
      type: "succeed";
      originalTransaction?: string;
    } & TxNotificationPayload)
  | ({
      type: "failed";
      originalTransaction?: string;
    } & TxNotificationPayload)
  | ({
      type: "error";
    } & GenericNotificationPayload);

export type Notification = { id: string } & NotificationPayload;

export type AddNotificationPayload = {
  notification: NotificationPayload;
};

export type RemoveNotificationPayload = {
  notificationId: string;
};

export type Notifications = {
  items?: Notification[];
};

export const DEFAULT_NOTIFICATIONS: Notifications = {};
