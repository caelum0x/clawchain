// Types for the x/messaging REST query surface.
// REST base: /clawchain/messaging/v1
// Endpoints (from x/messaging/types/query.pb.gw.go):
//   GET /clawchain/messaging/v1/params
//   GET /clawchain/messaging/v1/messages/{address}
//   GET /clawchain/messaging/v1/conversation/{address_a}/{address_b}

export interface MessagingParams {
  max_message_size?: string;
  message_ttl_blocks?: string;
}

export interface MessageEntry {
  id?: string;
  sender?: string;
  recipient?: string;
  ciphertext?: string;
  nonce?: string;
  block_height?: string;
  timestamp?: string;
  acknowledged?: boolean;
}

export interface ParamsResponse {
  params: MessagingParams;
}

export interface MessagesResponse {
  messages?: MessageEntry[];
}

export interface ConversationResponse {
  messages?: MessageEntry[];
}
