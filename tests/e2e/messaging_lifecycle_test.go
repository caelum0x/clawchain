//go:build e2e
// +build e2e

package e2e

import (
	"context"
	"strings"
	"testing"

	"cosmossdk.io/core/address"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/messaging/keeper"
	module "clawchain/x/messaging/module"
	"clawchain/x/messaging/types"
)

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

type messagingFixture struct {
	ctx          context.Context
	keeper       keeper.Keeper
	addressCodec address.Codec
}

func initMessagingFixture(t *testing.T) *messagingFixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addrCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)

	k := keeper.NewKeeper(storeService, encCfg.Codec, addrCodec, authority)

	if err := k.Params.Set(ctx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set messaging params: %v", err)
	}

	return &messagingFixture{
		ctx:          ctx,
		keeper:       k,
		addressCodec: addrCodec,
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func msgAlice() string { return "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu" }
func msgBob() string   { return "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4" }
func msgCarol() string { return "cosmos1fl48vsnmsdzcv85q5d2q4z5ajdha8yu34mf0eh" }

func msgSend(t *testing.T, f *messagingFixture, sender, recipient, ciphertext, nonce string) uint64 {
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
// E2E: Messaging Lifecycle Tests
// ---------------------------------------------------------------------------

// TestMessagingLifecycle_SendAndQueryMessage sends an encrypted message and
// verifies it can be queried by the recipient address.
func TestMessagingLifecycle_SendAndQueryMessage(t *testing.T) {
	f := initMessagingFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	// Step 1: Alice sends an encrypted message to Bob.
	msgID := msgSend(t, f, msgAlice(), msgBob(), "encrypted-payload-1", "nonce-001")
	t.Logf("Step 1: Message sent — ID=%d", msgID)

	// Step 2: Query messages by Bob's address.
	resp, err := queryServer.Messages(f.ctx, &types.QueryMessagesRequest{
		Address: msgBob(),
	})
	require.NoError(t, err)
	require.Len(t, resp.Messages, 1)
	require.Equal(t, "encrypted-payload-1", resp.Messages[0].Ciphertext)
	require.Equal(t, msgAlice(), resp.Messages[0].Sender)
	require.Equal(t, msgBob(), resp.Messages[0].Recipient)
	require.False(t, resp.Messages[0].Acknowledged)
	t.Log("Step 2: Message queried by recipient successfully")

	// Step 3: Also verify Alice can see it (she is the sender).
	resp, err = queryServer.Messages(f.ctx, &types.QueryMessagesRequest{
		Address: msgAlice(),
	})
	require.NoError(t, err)
	require.Len(t, resp.Messages, 1)
	t.Log("Step 3: Sender can also query the message")
}

// TestMessagingLifecycle_MessageAcknowledgement sends a message, acknowledges
// it, and verifies the acknowledged status.
func TestMessagingLifecycle_MessageAcknowledgement(t *testing.T) {
	f := initMessagingFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	// Step 1: Send message.
	msgID := msgSend(t, f, msgAlice(), msgBob(), "ack-test-payload", "nonce-ack")
	t.Logf("Step 1: Message sent — ID=%d", msgID)

	// Step 2: Verify not acknowledged.
	record, err := f.keeper.Messages.Get(f.ctx, msgID)
	require.NoError(t, err)
	require.False(t, record.Acknowledged)

	// Step 3: Bob acknowledges the message.
	_, err = msgServer.AckMessage(f.ctx, &types.MsgAckMessage{
		Creator:   msgBob(),
		MessageId: msgID,
	})
	require.NoError(t, err)
	t.Log("Step 3: Bob acknowledged the message")

	// Step 4: Verify acknowledged.
	record, err = f.keeper.Messages.Get(f.ctx, msgID)
	require.NoError(t, err)
	require.True(t, record.Acknowledged)
	t.Log("Step 4: Message acknowledged status verified")
}

// TestMessagingLifecycle_ConversationThreading sends multiple messages in the
// same conversation and queries the conversation thread.
func TestMessagingLifecycle_ConversationThreading(t *testing.T) {
	f := initMessagingFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	// Step 1: Alice sends 2 messages to Bob.
	msgSend(t, f, msgAlice(), msgBob(), "hello bob", "n1")
	msgSend(t, f, msgAlice(), msgBob(), "follow-up", "n2")

	// Step 2: Bob replies.
	msgSend(t, f, msgBob(), msgAlice(), "hey alice", "n3")

	// Step 3: Alice sends a message to Carol (different conversation).
	msgSend(t, f, msgAlice(), msgCarol(), "hi carol", "n4")

	// Step 4: Query Alice↔Bob conversation — should get 3 messages.
	resp, err := queryServer.Conversation(f.ctx, &types.QueryConversationRequest{
		AddressA: msgAlice(),
		AddressB: msgBob(),
	})
	require.NoError(t, err)
	require.Len(t, resp.Messages, 3)
	t.Log("Step 4: Conversation thread returns all 3 messages")

	// Step 5: Alice↔Carol conversation — should get 1 message.
	resp, err = queryServer.Conversation(f.ctx, &types.QueryConversationRequest{
		AddressA: msgAlice(),
		AddressB: msgCarol(),
	})
	require.NoError(t, err)
	require.Len(t, resp.Messages, 1)
	t.Log("Step 5: Separate conversation returns only 1 message")
}

// TestMessagingLifecycle_RejectEmptyContent verifies that empty ciphertext
// is rejected.
func TestMessagingLifecycle_RejectEmptyContent(t *testing.T) {
	f := initMessagingFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     msgAlice(),
		Recipient:  msgBob(),
		Ciphertext: "",
		Nonce:      "nonce-empty",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "ciphertext cannot be empty")
	t.Log("Empty ciphertext correctly rejected")
}

// TestMessagingLifecycle_MessageSizeLimitEnforced verifies that messages
// exceeding the maximum size are rejected.
func TestMessagingLifecycle_MessageSizeLimitEnforced(t *testing.T) {
	f := initMessagingFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	// Set a small max size for testing.
	err := f.keeper.Params.Set(f.ctx, types.Params{MaxMessageSize: 20})
	require.NoError(t, err)

	_, err = msgServer.SendMessage(f.ctx, &types.MsgSendMessage{
		Sender:     msgAlice(),
		Recipient:  msgBob(),
		Ciphertext: strings.Repeat("x", 100),
		Nonce:      "nonce-big",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "exceeds max")
	t.Log("Oversized message correctly rejected")
}

// TestMessagingLifecycle_QueryByConversation verifies bidirectional
// conversation query works regardless of address order.
func TestMessagingLifecycle_QueryByConversation(t *testing.T) {
	f := initMessagingFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	// Send messages in both directions.
	msgSend(t, f, msgAlice(), msgBob(), "msg-a2b", "n1")
	msgSend(t, f, msgBob(), msgAlice(), "msg-b2a", "n2")

	// Query with Alice first.
	resp1, err := queryServer.Conversation(f.ctx, &types.QueryConversationRequest{
		AddressA: msgAlice(),
		AddressB: msgBob(),
	})
	require.NoError(t, err)
	require.Len(t, resp1.Messages, 2)

	// Query with Bob first — same result.
	resp2, err := queryServer.Conversation(f.ctx, &types.QueryConversationRequest{
		AddressA: msgBob(),
		AddressB: msgAlice(),
	})
	require.NoError(t, err)
	require.Len(t, resp2.Messages, 2)
	t.Log("Bidirectional conversation query verified")
}
