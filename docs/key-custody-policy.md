# Key Custody Policy

This policy defines minimum operator key handling requirements for production deployments.

## Required Practices

1. Generate mnemonics on trusted hosts only.
2. Store recovery material offline and encrypted.
3. Restrict filesystem permissions for runtime config/key files.
4. Never transmit mnemonics/private keys over chat/email/ticket systems.
5. Rotate compromised keys immediately and publish incident summary.

## Prohibited Practices

- storing plaintext mnemonics in repo files or shared cloud docs
- embedding keys in scripts or environment files committed to git
- sharing validator/operator keys across multiple unrelated hosts

## Incident Handling

On suspected key compromise:

1. enter incident mode and isolate peers if needed
2. stop affected runtime/node processes
3. rotate keys and restore from trusted backup paths
4. document timeline and owner actions in incident report
