import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getMessages, getConversation, shortAddr, MessageEntry } from '../lib/chain';
import { isKeplrAvailable, connectKeplr, signAndBroadcast, WalletState } from '../lib/wallet';
import useDocTitle from '../hooks/useDocTitle.ts';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Conversation {
  address: string;
  lastMessage: string;
  lastTimestamp: number;
  unreadCount: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatTimestamp(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - msgDay.getTime();
  const dayMs = 86400000;
  if (diff < dayMs) return 'Today';
  if (diff < 2 * dayMs) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function shortTimestamp(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function Messaging() {
  useDocTitle("Messaging");
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<MessageEntry[]>([]);
  const [convoLoading, setConvoLoading] = useState(false);
  const [searchContacts, setSearchContacts] = useState('');
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Send form state
  const [composeText, setComposeText] = useState('');
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [encryption, setEncryption] = useState(true);

  // New message modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newRecipient, setNewRecipient] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newSending, setNewSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLTextAreaElement>(null);

  /* ---------------------------------------------------------------- */
  /* Data loading                                                      */
  /* ---------------------------------------------------------------- */

  const loadMessages = useCallback(async () => {
    if (!wallet?.address) return;
    setLoading(true);
    try {
      const data = await getMessages(wallet.address);
      setMessages(data);
    } catch (e) {
      console.error('Failed to load messages:', e);
    } finally {
      setLoading(false);
    }
  }, [wallet?.address]);

  useEffect(() => {
    if (wallet?.address) {
      loadMessages();
    }
  }, [wallet?.address, loadMessages]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!wallet?.address) return;
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [wallet?.address, loadMessages]);

  // Load conversation when active changes
  useEffect(() => {
    if (!wallet?.address || !activeConversation) return;
    setConvoLoading(true);
    getConversation(wallet.address, activeConversation)
      .then(data => {
        setConversationMessages(data);
      })
      .catch(e => {
        console.error('Failed to load conversation:', e);
      })
      .finally(() => setConvoLoading(false));
  }, [wallet?.address, activeConversation, messages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationMessages]);

  /* ---------------------------------------------------------------- */
  /* Derived data                                                      */
  /* ---------------------------------------------------------------- */

  const conversations: Conversation[] = useMemo(() => {
    if (!wallet?.address) return [];
    const map = new Map<string, Conversation>();

    messages.forEach(m => {
      const other = m.sender === wallet.address ? m.recipient : m.sender;
      if (!other) return;
      const existing = map.get(other);
      const isIncoming = m.recipient === wallet.address;
      const unread = isIncoming && !m.acknowledged ? 1 : 0;

      if (!existing) {
        map.set(other, {
          address: other,
          lastMessage: m.ciphertext || '',
          lastTimestamp: m.timestamp || 0,
          unreadCount: unread,
        });
      } else {
        if ((m.timestamp || 0) > existing.lastTimestamp) {
          existing.lastMessage = m.ciphertext || '';
          existing.lastTimestamp = m.timestamp || 0;
        }
        existing.unreadCount += unread;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }, [messages, wallet?.address]);

  const filteredConversations = useMemo(() => {
    if (!searchContacts.trim()) return conversations;
    const q = searchContacts.toLowerCase();
    return conversations.filter(c => c.address.toLowerCase().includes(q));
  }, [conversations, searchContacts]);

  const activeConvoData = useMemo(() => {
    return conversations.find(c => c.address === activeConversation) || null;
  }, [conversations, activeConversation]);

  // Group conversation messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: MessageEntry[] }[] = [];
    let currentDate = '';
    conversationMessages.forEach(m => {
      const label = formatDateLabel(m.timestamp);
      if (label !== currentDate) {
        currentDate = label;
        groups.push({ date: label, messages: [m] });
      } else {
        groups[groups.length - 1].messages.push(m);
      }
    });
    return groups;
  }, [conversationMessages]);

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  async function handleConnect() {
    try {
      const state = await connectKeplr();
      setWallet(state);
    } catch (e: any) {
      console.error('Failed to connect:', e);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address || !activeConversation || !composeText.trim()) return;
    setSendSubmitting(true);

    try {
      const nonce = crypto.randomUUID();
      const msg = {
        type: 'clawchain/messaging/MsgSendMessage',
        value: {
          sender: wallet.address,
          recipient: activeConversation,
          ciphertext: composeText.trim(),
          nonce,
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], 'Send message via web dashboard');
      if (result.code === 0) {
        setComposeText('');
        loadMessages();
      }
    } catch (e: any) {
      console.error('Failed to send message:', e);
    } finally {
      setSendSubmitting(false);
    }
  }

  async function handleNewMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address || !newRecipient.trim() || !newMessage.trim()) return;
    setNewSending(true);

    try {
      const nonce = crypto.randomUUID();
      const msg = {
        type: 'clawchain/messaging/MsgSendMessage',
        value: {
          sender: wallet.address,
          recipient: newRecipient.trim(),
          ciphertext: newMessage.trim(),
          nonce,
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], 'Send message via web dashboard');
      if (result.code === 0) {
        setShowNewModal(false);
        setNewRecipient('');
        setNewMessage('');
        setActiveConversation(newRecipient.trim());
        setMobileShowChat(true);
        loadMessages();
      }
    } catch (e: any) {
      console.error('Failed to send new message:', e);
    } finally {
      setNewSending(false);
    }
  }

  function selectConversation(addr: string) {
    setActiveConversation(addr);
    setMobileShowChat(true);
  }

  function handleBackToList() {
    setMobileShowChat(false);
  }

  // Auto-expand textarea
  function handleComposeInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setComposeText(e.target.value);
    if (composeRef.current) {
      composeRef.current.style.height = 'auto';
      composeRef.current.style.height = Math.min(composeRef.current.scrollHeight, 120) + 'px';
    }
  }

  /* ---------------------------------------------------------------- */
  /* Not connected state                                               */
  /* ---------------------------------------------------------------- */

  if (!wallet?.connected) {
    return (
      <div>
        <h1>Messaging</h1>
        <p className="subtitle">Send and receive encrypted agent-to-agent messages on-chain.</p>
        <div className="card" data-testid="connect-prompt">
          <p>Connect your wallet to start messaging.</p>
          <button
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={!isKeplrAvailable()}
            style={{ marginTop: '0.5rem' }}
          >
            {isKeplrAvailable() ? 'Connect Keplr' : 'Keplr Not Found'}
          </button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h1>Messaging</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>Encrypted agent-to-agent communication</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>
            {shortAddr(wallet.address)}
          </span>
        </div>
      </div>

      <div className={`messaging-layout ${mobileShowChat ? 'mobile-chat-active' : ''}`} data-testid="messaging-layout">

        {/* ---- Left Sidebar ---- */}
        <div className="msg-sidebar" data-testid="msg-sidebar">
          <div className="msg-sidebar-header">
            <button
              className="msg-new-btn"
              onClick={() => setShowNewModal(true)}
              data-testid="new-message-btn"
            >
              + New Message
            </button>
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchContacts}
              onChange={e => setSearchContacts(e.target.value)}
              className="msg-search-input"
              data-testid="search-contacts"
            />
          </div>

          <div className="msg-conversation-list" data-testid="conversation-list">
            {loading && conversations.length === 0 && (
              <div style={{ padding: '1.5rem', textAlign: 'center', opacity: 0.6 }}>
                Loading conversations...
              </div>
            )}

            {!loading && filteredConversations.length === 0 && (
              <div className="msg-empty-state" data-testid="empty-state">
                <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.3 }}>
                    {/* mail icon via CSS/text */}
                  </div>
                  <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No conversations yet</p>
                  <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>
                    Send your first message!
                  </p>
                </div>
              </div>
            )}

            {filteredConversations.map(c => (
              <div
                key={c.address}
                className={`msg-conversation-item ${activeConversation === c.address ? 'active' : ''}`}
                onClick={() => selectConversation(c.address)}
                data-testid="conversation-item"
              >
                <div className="msg-avatar">
                  {c.address.slice(-2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="msg-contact-name">{shortAddr(c.address)}</span>
                    <span className="msg-contact-time">{shortTimestamp(c.lastTimestamp)}</span>
                  </div>
                  <div className="msg-preview">
                    {c.lastMessage.length > 40 ? c.lastMessage.slice(0, 40) + '...' : c.lastMessage || 'No messages'}
                  </div>
                </div>
                {c.unreadCount > 0 && (
                  <span className="msg-unread-badge" data-testid="unread-badge">{c.unreadCount}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ---- Right Chat Panel ---- */}
        <div className="msg-chat" data-testid="msg-chat">
          {activeConversation ? (
            <>
              {/* Chat Header */}
              <div className="msg-chat-header" data-testid="chat-header">
                <button
                  className="msg-back-btn"
                  onClick={handleBackToList}
                  data-testid="back-btn"
                >
                  &larr;
                </button>
                <div className="msg-avatar-sm">
                  {activeConversation.slice(-2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    <Link to={`/explorer/account/${activeConversation}`}>
                      {shortAddr(activeConversation)}
                    </Link>
                  </div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>Agent</div>
                </div>
                <div className="encryption-badge" data-testid="encryption-indicator">
                  <span style={{ fontSize: '0.85rem' }}>&#128274;</span>
                  <span>Encrypted</span>
                </div>
              </div>

              {/* Messages */}
              <div className="msg-chat-messages" data-testid="message-list">
                {convoLoading && conversationMessages.length === 0 && (
                  <div style={{ textAlign: 'center', opacity: 0.6, padding: '2rem' }}>
                    Loading messages...
                  </div>
                )}

                {!convoLoading && conversationMessages.length === 0 && (
                  <div style={{ textAlign: 'center', opacity: 0.5, padding: '2rem' }}>
                    No messages yet. Start the conversation!
                  </div>
                )}

                {groupedMessages.map((group, gi) => (
                  <div key={gi}>
                    {group.date && (
                      <div className="msg-date-divider" data-testid="date-divider">{group.date}</div>
                    )}
                    {group.messages.map((m) => {
                      const isSent = m.sender === wallet.address;
                      return (
                        <div key={m.id + m.nonce} className={`msg-bubble ${isSent ? 'sent' : 'received'}`} data-testid="message-bubble">
                          <div>{m.ciphertext}</div>
                          <div className="msg-bubble-meta">
                            <span className="msg-bubble-time">{formatTimestamp(m.timestamp)}</span>
                            <span className="encryption-badge" data-testid="encryption-badge">
                              <span>&#128274;</span>
                            </span>
                            {isSent && (
                              <span className="msg-delivery-status" data-testid="delivery-status">
                                {m.acknowledged ? (
                                  <span title="Read" style={{ color: 'var(--accent, #8b5cf6)' }}>&#10003;&#10003;</span>
                                ) : (
                                  <span title="Delivered" style={{ opacity: 0.5 }}>&#10003;</span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose Area */}
              <form className="msg-compose" onSubmit={handleSendMessage} data-testid="compose-area">
                <button
                  type="button"
                  className={`msg-encrypt-toggle ${encryption ? 'active' : ''}`}
                  onClick={() => setEncryption(!encryption)}
                  title={encryption ? 'Encryption ON' : 'Encryption OFF'}
                  data-testid="encryption-toggle"
                >
                  &#128274;
                </button>
                <div style={{ flex: 1, position: 'relative' }}>
                  <textarea
                    ref={composeRef}
                    value={composeText}
                    onChange={handleComposeInput}
                    placeholder="Type a message..."
                    rows={1}
                    data-testid="compose-textarea"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                  <span className="msg-char-count" data-testid="char-count">
                    {composeText.length}
                  </span>
                </div>
                <button
                  type="submit"
                  className="msg-send-btn"
                  disabled={sendSubmitting || !composeText.trim()}
                  data-testid="send-btn"
                >
                  {sendSubmitting ? '...' : 'Send'}
                </button>
              </form>
            </>
          ) : (
            <div className="msg-no-conversation" data-testid="no-conversation">
              <div style={{ opacity: 0.4, fontSize: '3rem', marginBottom: '1rem' }}>&#9993;</div>
              <p style={{ fontWeight: 600, fontSize: '1.1rem' }}>Select a conversation</p>
              <p style={{ opacity: 0.6, fontSize: '0.9rem', marginTop: '0.25rem' }}>
                Choose a conversation from the sidebar or start a new one.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ---- New Message Modal ---- */}
      {showNewModal && (
        <div className="msg-modal-overlay" onClick={() => setShowNewModal(false)} data-testid="new-message-modal">
          <div className="msg-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>New Message</h3>
              <button
                className="btn-outline"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                onClick={() => setShowNewModal(false)}
                data-testid="close-modal-btn"
              >
                &#10005;
              </button>
            </div>

            <form onSubmit={handleNewMessage}>
              <div style={{ marginBottom: '1rem' }}>
                <label>Recipient Address</label>
                <input
                  type="text"
                  value={newRecipient}
                  onChange={e => setNewRecipient(e.target.value)}
                  placeholder="claw1..."
                  required
                  data-testid="new-msg-recipient"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Message</label>
                <textarea
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  rows={4}
                  required
                  data-testid="new-msg-content"
                />
              </div>

              <button
                className="msg-send-btn"
                type="submit"
                disabled={newSending || !newRecipient.trim() || !newMessage.trim()}
                style={{ width: '100%' }}
                data-testid="new-msg-send-btn"
              >
                {newSending ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
