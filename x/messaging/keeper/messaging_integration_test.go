package keeper_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"clawchain/x/messaging/keeper"
	"clawchain/x/messaging/types"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func validAddress() string {
	return "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
}

func validAddress2() string {
	return "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"
}

func validAddress3() string {
	return "cosmos1fl48vsnmsdzcv85q5d2q4z5ajdha8yu34mf0eh"
}

func sendMessage(t *testing.T, f *fixture, sender, recipient, ciphertext, nonce string) uint64 {
	t.Helper()
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	resp, err := msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     sender,
		Recipient:  recipient,
		Ciphertext: ciphertext,
		Nonce:      nonce,
	})
	require.NoError(t, err)
	return resp.MessageId
}

// ---------------------------------------------------------------------------
// SendMessage tests
// ---------------------------------------------------------------------------

func TestSendMessageSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	resp, err := msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     validAddress(),
		Recipient:  validAddress2(),
		Ciphertext: "encrypted-hello",
		Nonce:      "nonce123",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint64(0), resp.MessageId)

	// Verify stored record.
	record, err := f.keeper.Messages.Get(f.ctx, 0)
	require.NoError(t, err)
	require.Equal(t, validAddress(), record.Sender)
	require.Equal(t, validAddress2(), record.Recipient)
	require.Equal(t, "encrypted-hello", record.Ciphertext)
	require.Equal(t, "nonce123", record.Nonce)
	require.False(t, record.Acknowledged)
}

func TestSendMessageInvalidSender(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     "bad-address",
		Recipient:  validAddress2(),
		Ciphertext: "data",
		Nonce:      "n1",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid sender address")
}

func TestSendMessageInvalidRecipient(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     validAddress(),
		Recipient:  "bad-address",
		Ciphertext: "data",
		Nonce:      "n1",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid recipient address")
}

func TestSendMessageSelfMessage(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     validAddress(),
		Recipient:  validAddress(),
		Ciphertext: "data",
		Nonce:      "n1",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "sender and recipient are the same")
}

func TestSendMessageEmptyCiphertext(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:    validAddress(),
		Recipient: validAddress2(),
		Nonce:     "n1",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "ciphertext cannot be empty")
}

func TestSendMessageEmptyNonce(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     validAddress(),
		Recipient:  validAddress2(),
		Ciphertext: "data",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "nonce cannot be empty")
}

func TestSendMessageTooLarge(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	// Set small max size.
	err := f.keeper.Params.Set(f.ctx, types.Params{MaxMessageSize: 10})
	require.NoError(t, err)

	_, err = msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     validAddress(),
		Recipient:  validAddress2(),
		Ciphertext: strings.Repeat("x", 100),
		Nonce:      "n1",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "exceeds max")
}

func TestSendMessageDuplicateNoncePerSender(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	sender := validAddress()
	recipient := validAddress2()

	_, err := msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     sender,
		Recipient:  recipient,
		Ciphertext: "first",
		Nonce:      "nonce-1",
	})
	require.NoError(t, err)

	_, err = msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     sender,
		Recipient:  recipient,
		Ciphertext: "second",
		Nonce:      "nonce-1",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "duplicate nonce")
}

func TestSendMessageAutoIncrementID(t *testing.T) {
	f := initFixture(t)

	id0 := sendMessage(t, f, validAddress(), validAddress2(), "msg0", "n0")
	id1 := sendMessage(t, f, validAddress(), validAddress2(), "msg1", "n1")
	id2 := sendMessage(t, f, validAddress2(), validAddress(), "msg2", "n2")

	require.Equal(t, uint64(0), id0)
	require.Equal(t, uint64(1), id1)
	require.Equal(t, uint64(2), id2)
}

// ---------------------------------------------------------------------------
// AckMessage tests
// ---------------------------------------------------------------------------

func TestAckMessageSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	msgID := sendMessage(t, f, validAddress(), validAddress2(), "hello", "n1")

	_, err := msgServer.AckMessage(f.ctx, &types.MsgAckMessage{
		Creator:   validAddress2(),
		MessageId: msgID,
	})
	require.NoError(t, err)

	// Verify acknowledged.
	record, err := f.keeper.Messages.Get(f.ctx, msgID)
	require.NoError(t, err)
	require.True(t, record.Acknowledged)
}

func TestAckMessageNotRecipient(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	msgID := sendMessage(t, f, validAddress(), validAddress2(), "hello", "n1")

	// Sender tries to ack — should fail.
	_, err := msgServer.AckMessage(f.ctx, &types.MsgAckMessage{
		Creator:   validAddress(),
		MessageId: msgID,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "only the recipient")
}

func TestAckMessageAlreadyAcked(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	msgID := sendMessage(t, f, validAddress(), validAddress2(), "hello", "n1")

	// First ack succeeds.
	_, err := msgServer.AckMessage(f.ctx, &types.MsgAckMessage{
		Creator:   validAddress2(),
		MessageId: msgID,
	})
	require.NoError(t, err)

	// Second ack fails.
	_, err = msgServer.AckMessage(f.ctx, &types.MsgAckMessage{
		Creator:   validAddress2(),
		MessageId: msgID,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "already acknowledged")
}

func TestAckMessageNotFound(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.AckMessage(f.ctx, &types.MsgAckMessage{
		Creator:   validAddress(),
		MessageId: 999,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "not found")
}

func TestAckMessageInvalidAddress(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.AckMessage(f.ctx, &types.MsgAckMessage{
		Creator:   "bad-addr",
		MessageId: 0,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid")
}

// ---------------------------------------------------------------------------
// Query tests
// ---------------------------------------------------------------------------

func TestQueryMessagesByAddress(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	sendMessage(t, f, validAddress(), validAddress2(), "a->b 1", "n1")
	sendMessage(t, f, validAddress(), validAddress2(), "a->b 2", "n2")
	sendMessage(t, f, validAddress2(), validAddress(), "b->a 1", "n3")
	sendMessage(t, f, validAddress2(), validAddress3(), "b->c 1", "n4")

	// Query for validAddress — should get 3 messages (2 sent + 1 received).
	resp, err := queryServer.Messages(f.ctx, &types.QueryMessagesRequest{
		Address: validAddress(),
	})
	require.NoError(t, err)
	require.Len(t, resp.Messages, 3)

	// Query for validAddress3 — should get 1 message.
	resp, err = queryServer.Messages(f.ctx, &types.QueryMessagesRequest{
		Address: validAddress3(),
	})
	require.NoError(t, err)
	require.Len(t, resp.Messages, 1)
}

func TestQueryMessagesEmptyAddress(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Messages(f.ctx, &types.QueryMessagesRequest{
		Address: "",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "address cannot be empty")
}

func TestQueryMessagesNilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Messages(f.ctx, nil)
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid request")
}

func TestQueryConversation(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	sendMessage(t, f, validAddress(), validAddress2(), "a->b 1", "n1")
	sendMessage(t, f, validAddress2(), validAddress(), "b->a 1", "n2")
	sendMessage(t, f, validAddress(), validAddress3(), "a->c 1", "n3")

	// Conversation between A and B — should get 2 messages.
	resp, err := queryServer.Conversation(f.ctx, &types.QueryConversationRequest{
		AddressA: validAddress(),
		AddressB: validAddress2(),
	})
	require.NoError(t, err)
	require.Len(t, resp.Messages, 2)

	// Reverse order should give same result.
	resp, err = queryServer.Conversation(f.ctx, &types.QueryConversationRequest{
		AddressA: validAddress2(),
		AddressB: validAddress(),
	})
	require.NoError(t, err)
	require.Len(t, resp.Messages, 2)

	// Conversation between A and C — should get 1 message.
	resp, err = queryServer.Conversation(f.ctx, &types.QueryConversationRequest{
		AddressA: validAddress(),
		AddressB: validAddress3(),
	})
	require.NoError(t, err)
	require.Len(t, resp.Messages, 1)
}

func TestQueryConversationMissingAddress(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Conversation(f.ctx, &types.QueryConversationRequest{
		AddressA: validAddress(),
		AddressB: "",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "both addresses are required")
}

func TestQueryConversationNilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Conversation(f.ctx, nil)
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid request")
}

// ---------------------------------------------------------------------------
// Full messaging workflow
// ---------------------------------------------------------------------------

func TestFullMessagingWorkflow(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	alice := validAddress()
	bob := validAddress2()

	// 1. Alice sends a message to Bob.
	msgID, err := msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     alice,
		Recipient:  bob,
		Ciphertext: "encrypted-hello-bob",
		Nonce:      "nonce-001",
	})
	require.NoError(t, err)

	// 2. Bob queries their messages.
	msgs, err := queryServer.Messages(f.ctx, &types.QueryMessagesRequest{Address: bob})
	require.NoError(t, err)
	require.Len(t, msgs.Messages, 1)
	require.Equal(t, "encrypted-hello-bob", msgs.Messages[0].Ciphertext)
	require.False(t, msgs.Messages[0].Acknowledged)

	// 3. Bob acknowledges the message.
	_, err = msgServer.AckMessage(f.ctx, &types.MsgAckMessage{
		Creator:   bob,
		MessageId: msgID.MessageId,
	})
	require.NoError(t, err)

	// 4. Bob sends a reply.
	_, err = msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     bob,
		Recipient:  alice,
		Ciphertext: "encrypted-hi-alice",
		Nonce:      "nonce-002",
	})
	require.NoError(t, err)

	// 5. Query conversation shows both messages.
	conv, err := queryServer.Conversation(f.ctx, &types.QueryConversationRequest{
		AddressA: alice,
		AddressB: bob,
	})
	require.NoError(t, err)
	require.Len(t, conv.Messages, 2)

	// 6. First message should be acknowledged.
	record, err := f.keeper.Messages.Get(f.ctx, 0)
	require.NoError(t, err)
	require.True(t, record.Acknowledged)

	// 7. Second message should not be acknowledged.
	record, err = f.keeper.Messages.Get(f.ctx, 1)
	require.NoError(t, err)
	require.False(t, record.Acknowledged)
}
