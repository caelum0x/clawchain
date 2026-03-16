package circuit

import (
	"math/big"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr/mimc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"github.com/stretchr/testify/require"
)

// mimcHashNative computes MiMC(left, right) using gnark-crypto for test witness generation.
func mimcHashNative(left, right *big.Int) *big.Int {
	h := mimc.NewMiMC()
	var lElem, rElem fr.Element
	lElem.SetBigInt(left)
	rElem.SetBigInt(right)
	h.Write(lElem.Marshal())
	h.Write(rElem.Marshal())
	var result fr.Element
	result.SetBytes(h.Sum(nil))
	var out big.Int
	result.BigInt(&out)
	return &out
}

func TestTransferCircuitCompiles(t *testing.T) {
	var circuit TransferCircuit
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &circuit)
	require.NoError(t, err)
	require.Greater(t, cs.GetNbConstraints(), 0)
}

func TestUnshieldCircuitCompiles(t *testing.T) {
	cs, err := CompileUnshieldCircuit()
	require.NoError(t, err)
	require.Greater(t, cs.GetNbConstraints(), 0)
}

func TestViewKeyCircuitCompiles(t *testing.T) {
	cs, err := CompileViewKeyCircuit()
	require.NoError(t, err)
	require.Greater(t, cs.GetNbConstraints(), 0)
}

func TestMiMCCommitment(t *testing.T) {
	amount := big.NewInt(1000)
	blinding := big.NewInt(42)

	commitment := mimcHashNative(amount, blinding)
	require.NotNil(t, commitment)
	require.NotEqual(t, big.NewInt(0), commitment)

	// Same inputs produce the same commitment.
	commitment2 := mimcHashNative(amount, blinding)
	require.Equal(t, 0, commitment.Cmp(commitment2))

	// Different inputs produce different commitments.
	commitment3 := mimcHashNative(amount, big.NewInt(43))
	require.NotEqual(t, 0, commitment.Cmp(commitment3))
}

func TestNullifierDerivation(t *testing.T) {
	amount := big.NewInt(500)
	blinding := big.NewInt(99)
	secret := big.NewInt(777)

	commitment := mimcHashNative(amount, blinding)
	nullifier := mimcHashNative(secret, commitment)

	require.NotNil(t, nullifier)
	require.NotEqual(t, big.NewInt(0), nullifier)

	// Same secret+commitment gives same nullifier.
	nullifier2 := mimcHashNative(secret, commitment)
	require.Equal(t, 0, nullifier.Cmp(nullifier2))

	// Different secret gives different nullifier.
	nullifier3 := mimcHashNative(big.NewInt(778), commitment)
	require.NotEqual(t, 0, nullifier.Cmp(nullifier3))
}

func TestViewKeyCircuitProveAndVerify(t *testing.T) {
	// Setup
	pk, vk, cs, err := SetupViewKey()
	require.NoError(t, err)

	amount := big.NewInt(1000)
	blinding := big.NewInt(42)
	commitment := mimcHashNative(amount, blinding)

	// Build a valid assignment.
	assignment := &ViewKeyCircuit{
		Commitment: commitment,
		Amount:     amount,
		Blinding:   blinding,
	}

	// Prove
	proof, err := GenerateViewKeyProof(cs, pk, assignment)
	require.NoError(t, err)

	// Public witness
	pubAssignment := &ViewKeyCircuit{
		Commitment: commitment,
		Amount:     amount,
	}
	pubWitness, err := frontend.NewWitness(pubAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	require.NoError(t, err)

	// Verify
	err = groth16.Verify(proof, vk, pubWitness)
	require.NoError(t, err)
}

func TestViewKeyCircuitRejectsWrongAmount(t *testing.T) {
	pk, _, cs, err := SetupViewKey()
	require.NoError(t, err)

	amount := big.NewInt(1000)
	blinding := big.NewInt(42)
	commitment := mimcHashNative(amount, blinding)

	// Use wrong amount in assignment.
	assignment := &ViewKeyCircuit{
		Commitment: commitment,
		Amount:     big.NewInt(999), // Wrong
		Blinding:   blinding,
	}

	_, err = GenerateViewKeyProof(cs, pk, assignment)
	require.Error(t, err, "proof should fail with wrong amount")
}

func TestSerializationRoundTrip(t *testing.T) {
	_, vk, _, err := SetupViewKey()
	require.NoError(t, err)

	// Serialize
	data, err := SerializeVerifyingKey(vk)
	require.NoError(t, err)
	require.NotEmpty(t, data)

	// Deserialize
	vk2, err := DeserializeVerifyingKey(data)
	require.NoError(t, err)
	require.NotNil(t, vk2)
}
