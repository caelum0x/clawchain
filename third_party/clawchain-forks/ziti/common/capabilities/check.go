/*
	Copyright NetFoundry Inc.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

	https://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

package capabilities

import (
	"math/big"

	"github.com/openziti/ziti/v2/common/pb/ctrl_pb"
)

// GetCapabilities reads the capabilities bitmask from underlay headers, checking
// the current header ID first, then falling back to the legacy ID for pre-2.0
// compatibility.
func GetCapabilities(headers map[int32][]byte) *big.Int {
	if val, found := headers[int32(ctrl_pb.ControlHeaders_CapabilitiesHeader)]; found {
		return new(big.Int).SetBytes(val)
	}
	if val, found := headers[ctrl_pb.LegacyCapabilitiesHeader]; found {
		return new(big.Int).SetBytes(val)
	}
	return new(big.Int)
}

func IsCapable(headers map[int32][]byte, capability int) bool {
	return GetCapabilities(headers).Bit(capability) == 1
}

func IsSet(mask *big.Int, capability int) bool {
	return mask.Bit(capability) == 1
}
