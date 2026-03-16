package ibc

import (
	"encoding/json"
	"fmt"
	"strconv"

	sdk "github.com/cosmos/cosmos-sdk/types"
	channeltypes "github.com/cosmos/ibc-go/v10/modules/core/04-channel/types"
	porttypes "github.com/cosmos/ibc-go/v10/modules/core/05-port/types"
	ibcexported "github.com/cosmos/ibc-go/v10/modules/core/exported"

	transfertypes "github.com/cosmos/ibc-go/v10/modules/apps/transfer/types"
)

// PrivacyKeeper defines the interface the middleware uses from the privacy keeper.
// This avoids a direct dependency on the full keeper type.
type PrivacyKeeper interface {
	// ShieldForAccount shields tokens from an account into the privacy pool.
	// Called by the middleware after successful IBC token receipt when
	// auto-shield is requested.
	ShieldForAccount(ctx sdk.Context, senderAddr sdk.AccAddress, amount uint64, denom string) (commitmentHex string, leafIndex uint64, err error)
}

// IBCMiddleware implements the ICS-26 IBCModule interface (IBC-go v10).
// It wraps an underlying IBC module (typically the ICS-20 transfer module)
// and intercepts OnRecvPacket to optionally auto-shield received tokens.
type IBCMiddleware struct {
	app           porttypes.IBCModule
	privacyKeeper PrivacyKeeper
}

// NewIBCMiddleware creates a new IBCMiddleware wrapping the given IBC module.
func NewIBCMiddleware(app porttypes.IBCModule, keeper PrivacyKeeper) IBCMiddleware {
	return IBCMiddleware{
		app:           app,
		privacyKeeper: keeper,
	}
}

// autoShieldThreshold is the configurable threshold for auto-shielding.
// Set via SetAutoShieldThreshold; defaults to 0 (no threshold).
var autoShieldThreshold uint64

// SetAutoShieldThreshold configures the minimum transfer amount that
// triggers auto-shielding. Transfers below this amount are not auto-shielded.
func SetAutoShieldThreshold(threshold uint64) {
	autoShieldThreshold = threshold
}

// GetAutoShieldThreshold returns the current auto-shield threshold.
func (im IBCMiddleware) GetAutoShieldThreshold() uint64 {
	return autoShieldThreshold
}

// ---------------------------------------------------------------------------
// ICS-26 callbacks – Channel handshake (delegated to underlying module)
// ---------------------------------------------------------------------------

func (im IBCMiddleware) OnChanOpenInit(
	ctx sdk.Context,
	order channeltypes.Order,
	connectionHops []string,
	portID string,
	channelID string,
	counterparty channeltypes.Counterparty,
	version string,
) (string, error) {
	return im.app.OnChanOpenInit(ctx, order, connectionHops, portID, channelID, counterparty, version)
}

func (im IBCMiddleware) OnChanOpenTry(
	ctx sdk.Context,
	order channeltypes.Order,
	connectionHops []string,
	portID,
	channelID string,
	counterparty channeltypes.Counterparty,
	counterpartyVersion string,
) (string, error) {
	return im.app.OnChanOpenTry(ctx, order, connectionHops, portID, channelID, counterparty, counterpartyVersion)
}

func (im IBCMiddleware) OnChanOpenAck(
	ctx sdk.Context,
	portID,
	channelID string,
	counterpartyChannelID string,
	counterpartyVersion string,
) error {
	return im.app.OnChanOpenAck(ctx, portID, channelID, counterpartyChannelID, counterpartyVersion)
}

func (im IBCMiddleware) OnChanOpenConfirm(ctx sdk.Context, portID, channelID string) error {
	return im.app.OnChanOpenConfirm(ctx, portID, channelID)
}

func (im IBCMiddleware) OnChanCloseInit(ctx sdk.Context, portID, channelID string) error {
	return im.app.OnChanCloseInit(ctx, portID, channelID)
}

func (im IBCMiddleware) OnChanCloseConfirm(ctx sdk.Context, portID, channelID string) error {
	return im.app.OnChanCloseConfirm(ctx, portID, channelID)
}

// ---------------------------------------------------------------------------
// ICS-26 callbacks – Packet handling
// ---------------------------------------------------------------------------

// OnRecvPacket is the core middleware hook. It:
//  1. Delegates to the underlying transfer module to process the packet.
//  2. If successful and the memo contains auto-shield metadata, shields the
//     received tokens into the privacy pool.
func (im IBCMiddleware) OnRecvPacket(
	ctx sdk.Context,
	channelVersion string,
	packet channeltypes.Packet,
	relayer sdk.AccAddress,
) ibcexported.Acknowledgement {
	// Let the underlying transfer module handle the packet first.
	ack := im.app.OnRecvPacket(ctx, channelVersion, packet, relayer)
	if ack == nil || !ack.Success() {
		return ack
	}

	// Parse the ICS-20 transfer data from the packet.
	var data transfertypes.FungibleTokenPacketData
	if err := json.Unmarshal(packet.GetData(), &data); err != nil {
		// Not a valid ICS-20 packet; return the original acknowledgement.
		return ack
	}

	// Check for privacy metadata in the memo.
	meta := ParsePrivacyMetadata(data.GetMemo())
	if meta == nil || !meta.AutoShield {
		return ack
	}

	// Parse the amount.
	amount, err := strconv.ParseUint(data.Amount, 10, 64)
	if err != nil || amount == 0 {
		return ack
	}

	// Check auto-shield threshold: if a threshold is configured and the
	// transfer amount is below it, skip auto-shielding.
	if threshold := im.GetAutoShieldThreshold(); threshold > 0 && amount < threshold {
		ctx.EventManager().EmitEvent(
			sdk.NewEvent(
				"ibc_auto_shield_below_threshold",
				sdk.NewAttribute("receiver", data.Receiver),
				sdk.NewAttribute("amount", data.Amount),
				sdk.NewAttribute("threshold", strconv.FormatUint(threshold, 10)),
			),
		)
		return ack
	}

	// Resolve the receiver address.
	receiverAddr, err := sdk.AccAddressFromBech32(data.Receiver)
	if err != nil {
		return ack
	}

	// Determine the IBC denom for the received tokens.
	denomTrace := transfertypes.ParseDenomTrace(data.Denom)
	ibcDenom := denomTrace.IBCDenom()

	// Auto-shield the received tokens.
	commitmentHex, leafIndex, err := im.privacyKeeper.ShieldForAccount(ctx, receiverAddr, amount, ibcDenom)
	if err != nil {
		// Shield failed; emit a warning event but don't fail the transfer.
		ctx.EventManager().EmitEvent(
			sdk.NewEvent(
				"ibc_auto_shield_failed",
				sdk.NewAttribute("receiver", data.Receiver),
				sdk.NewAttribute("amount", data.Amount),
				sdk.NewAttribute("denom", ibcDenom),
				sdk.NewAttribute("error", err.Error()),
			),
		)
		return ack
	}

	// Emit success event.
	ctx.EventManager().EmitEvent(
		sdk.NewEvent(
			"ibc_auto_shield",
			sdk.NewAttribute("receiver", data.Receiver),
			sdk.NewAttribute("amount", data.Amount),
			sdk.NewAttribute("denom", ibcDenom),
			sdk.NewAttribute("commitment", commitmentHex),
			sdk.NewAttribute("leaf_index", fmt.Sprintf("%d", leafIndex)),
			sdk.NewAttribute("source_channel", packet.GetSourceChannel()),
			sdk.NewAttribute("source_port", packet.GetSourcePort()),
		),
	)

	return ack
}

func (im IBCMiddleware) OnAcknowledgementPacket(
	ctx sdk.Context,
	channelVersion string,
	packet channeltypes.Packet,
	acknowledgement []byte,
	relayer sdk.AccAddress,
) error {
	return im.app.OnAcknowledgementPacket(ctx, channelVersion, packet, acknowledgement, relayer)
}

func (im IBCMiddleware) OnTimeoutPacket(
	ctx sdk.Context,
	channelVersion string,
	packet channeltypes.Packet,
	relayer sdk.AccAddress,
) error {
	return im.app.OnTimeoutPacket(ctx, channelVersion, packet, relayer)
}
