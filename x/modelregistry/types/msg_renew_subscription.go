package types

import (
	"github.com/cosmos/gogoproto/proto"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func init() {
	proto.RegisterType((*MsgRenewSubscription)(nil), "clawchain.modelregistry.v1.MsgRenewSubscription")
	proto.RegisterType((*MsgRenewSubscriptionResponse)(nil), "clawchain.modelregistry.v1.MsgRenewSubscriptionResponse")
}

// MsgRenewSubscription renews a subscription-based model access.
type MsgRenewSubscription struct {
	Buyer   string `protobuf:"bytes,1,opt,name=buyer,proto3" json:"buyer,omitempty"`
	ModelId uint64 `protobuf:"varint,2,opt,name=model_id,json=modelId,proto3" json:"model_id,omitempty"`
	Periods uint64 `protobuf:"varint,3,opt,name=periods,proto3" json:"periods,omitempty"`
}

func (m *MsgRenewSubscription) Reset()         {}
func (m *MsgRenewSubscription) String() string { return "MsgRenewSubscription" }
func (m *MsgRenewSubscription) ProtoMessage()  {}

func (m *MsgRenewSubscription) GetSigners() []sdk.AccAddress {
	addr, _ := sdk.AccAddressFromBech32(m.Buyer)
	return []sdk.AccAddress{addr}
}

func (m *MsgRenewSubscription) ValidateBasic() error {
	if _, err := sdk.AccAddressFromBech32(m.Buyer); err != nil {
		return ErrInvalidAddress.Wrapf("invalid buyer: %s", err)
	}
	if m.ModelId == 0 {
		return ErrModelNotFound.Wrap("model_id must be > 0")
	}
	return nil
}

// MsgRenewSubscriptionResponse is the response for MsgRenewSubscription.
type MsgRenewSubscriptionResponse struct {
	NewExpiryHeight int64 `protobuf:"varint,1,opt,name=new_expiry_height,json=newExpiryHeight,proto3" json:"new_expiry_height,omitempty"`
}

func (m *MsgRenewSubscriptionResponse) Reset()         {}
func (m *MsgRenewSubscriptionResponse) String() string { return "MsgRenewSubscriptionResponse" }
func (m *MsgRenewSubscriptionResponse) ProtoMessage()  {}
