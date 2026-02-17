package circuit

import (
	"bytes"
	"fmt"
	"io"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/witness"
	"github.com/consensys/gnark/constraint"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

// CompileTransferCircuit compiles the TransferCircuit into an R1CS constraint system.
func CompileTransferCircuit() (constraint.ConstraintSystem, error) {
	var circuit TransferCircuit
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &circuit)
	if err != nil {
		return nil, fmt.Errorf("failed to compile transfer circuit: %w", err)
	}
	return cs, nil
}

// CompileUnshieldCircuit compiles the UnshieldCircuit into an R1CS constraint system.
func CompileUnshieldCircuit() (constraint.ConstraintSystem, error) {
	var circuit UnshieldCircuit
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &circuit)
	if err != nil {
		return nil, fmt.Errorf("failed to compile unshield circuit: %w", err)
	}
	return cs, nil
}

// SetupTransfer runs the Groth16 trusted setup for the transfer circuit.
// Returns the proving key, verifying key, and compiled constraint system.
func SetupTransfer() (groth16.ProvingKey, groth16.VerifyingKey, constraint.ConstraintSystem, error) {
	cs, err := CompileTransferCircuit()
	if err != nil {
		return nil, nil, nil, err
	}

	pk, vk, err := groth16.Setup(cs)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to setup transfer circuit: %w", err)
	}

	return pk, vk, cs, nil
}

// SetupUnshield runs the Groth16 trusted setup for the unshield circuit.
// Returns the proving key, verifying key, and compiled constraint system.
func SetupUnshield() (groth16.ProvingKey, groth16.VerifyingKey, constraint.ConstraintSystem, error) {
	cs, err := CompileUnshieldCircuit()
	if err != nil {
		return nil, nil, nil, err
	}

	pk, vk, err := groth16.Setup(cs)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to setup unshield circuit: %w", err)
	}

	return pk, vk, cs, nil
}

// SerializeProvingKey serializes a Groth16 proving key to bytes.
func SerializeProvingKey(pk groth16.ProvingKey) ([]byte, error) {
	var buf bytes.Buffer
	if _, err := pk.WriteTo(&buf); err != nil {
		return nil, fmt.Errorf("failed to serialize proving key: %w", err)
	}
	return buf.Bytes(), nil
}

// DeserializeProvingKey deserializes a Groth16 proving key from bytes.
func DeserializeProvingKey(data []byte) (groth16.ProvingKey, error) {
	pk := groth16.NewProvingKey(ecc.BN254)
	if _, err := pk.ReadFrom(bytes.NewReader(data)); err != nil {
		return nil, fmt.Errorf("failed to deserialize proving key: %w", err)
	}
	return pk, nil
}

// SerializeVerifyingKey serializes a Groth16 verifying key to bytes.
func SerializeVerifyingKey(vk groth16.VerifyingKey) ([]byte, error) {
	var buf bytes.Buffer
	if _, err := vk.WriteTo(&buf); err != nil {
		return nil, fmt.Errorf("failed to serialize verifying key: %w", err)
	}
	return buf.Bytes(), nil
}

// DeserializeVerifyingKey deserializes a Groth16 verifying key from bytes.
func DeserializeVerifyingKey(data []byte) (groth16.VerifyingKey, error) {
	vk := groth16.NewVerifyingKey(ecc.BN254)
	if _, err := vk.ReadFrom(bytes.NewReader(data)); err != nil {
		return nil, fmt.Errorf("failed to deserialize verifying key: %w", err)
	}
	return vk, nil
}

// SerializeProof serializes a Groth16 proof to bytes.
func SerializeProof(proof groth16.Proof) ([]byte, error) {
	var buf bytes.Buffer
	if _, err := proof.WriteTo(&buf); err != nil {
		return nil, fmt.Errorf("failed to serialize proof: %w", err)
	}
	return buf.Bytes(), nil
}

// DeserializeProof deserializes a Groth16 proof from bytes.
func DeserializeProof(data []byte) (groth16.Proof, error) {
	proof := groth16.NewProof(ecc.BN254)
	if _, err := proof.ReadFrom(bytes.NewReader(data)); err != nil {
		return nil, fmt.Errorf("failed to deserialize proof: %w", err)
	}
	return proof, nil
}

// GenerateTransferProof creates a Groth16 proof for a private transfer.
// The assignment must have all fields populated with concrete values.
func GenerateTransferProof(
	cs constraint.ConstraintSystem,
	pk groth16.ProvingKey,
	assignment *TransferCircuit,
) (groth16.Proof, error) {
	w, err := frontend.NewWitness(assignment, ecc.BN254.ScalarField())
	if err != nil {
		return nil, fmt.Errorf("failed to create witness: %w", err)
	}

	proof, err := groth16.Prove(cs, pk, w)
	if err != nil {
		return nil, fmt.Errorf("failed to generate proof: %w", err)
	}

	return proof, nil
}

// VerifyTransferProof verifies a Groth16 proof for a private transfer.
func VerifyTransferProof(
	vk groth16.VerifyingKey,
	proof groth16.Proof,
	publicWitness witness.Witness,
) error {
	return groth16.Verify(proof, vk, publicWitness)
}

// GenerateUnshieldProof creates a Groth16 proof for an unshield operation.
func GenerateUnshieldProof(
	cs constraint.ConstraintSystem,
	pk groth16.ProvingKey,
	assignment *UnshieldCircuit,
) (groth16.Proof, error) {
	w, err := frontend.NewWitness(assignment, ecc.BN254.ScalarField())
	if err != nil {
		return nil, fmt.Errorf("failed to create witness: %w", err)
	}

	proof, err := groth16.Prove(cs, pk, w)
	if err != nil {
		return nil, fmt.Errorf("failed to generate proof: %w", err)
	}

	return proof, nil
}

// VerifyUnshieldProof verifies a Groth16 proof for an unshield operation.
func VerifyUnshieldProof(
	vk groth16.VerifyingKey,
	proof groth16.Proof,
	publicWitness witness.Witness,
) error {
	return groth16.Verify(proof, vk, publicWitness)
}

// ReadVerifyingKey reads a verifying key from a reader.
func ReadVerifyingKey(r io.Reader) (groth16.VerifyingKey, error) {
	vk := groth16.NewVerifyingKey(ecc.BN254)
	if _, err := vk.ReadFrom(r); err != nil {
		return nil, fmt.Errorf("failed to read verifying key: %w", err)
	}
	return vk, nil
}
