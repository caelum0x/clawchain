# Security Policy

## Reporting a Vulnerability

Please report security issues privately. Do **not** open a public issue for an
exploitable vulnerability.

- Email the maintainers (see the repository owner's contact) with the details and
  a reproduction.
- Allow reasonable time for a fix before any public disclosure.

Internal security process and scope are documented in:

- [docs/security-audit-scope.md](docs/security-audit-scope.md)
- [docs/security-review-checklist.md](docs/security-review-checklist.md)
- [docs/security-review-gate.md](docs/security-review-gate.md)

## Known Compromised Credentials — DO NOT FUND

> A development **faucet BIP39 mnemonic** was committed to this repository's git
> history (in `docker-compose.yml` and `.env.example`) from the initial commit
> through commit `b9f539f9`, where it was removed from the working tree.

Because that mnemonic was pushed to the public remote, it must be treated as
**permanently compromised**. Removing it from the working tree does not un-expose
it (it remains in git history and any clone/cache).

**Required controls:**

1. **Never fund the address derived from that mnemonic** on any network that
   holds real value. Treat the key as burned.
2. The faucet key is now supplied at runtime via the `FAUCET_MNEMONIC`
   environment variable with **no default** (compose fails closed if it is
   unset). Generate a **fresh** mnemonic for every deployment and store it in a
   secret manager, never in source control.
3. For monitoring/blocklisting, an operator can derive the compromised address
   locally from the old phrase (do not commit the output):

   ```bash
   clawchaind keys add burned-faucet --recover --keyring-backend test
   # paste the old mnemonic when prompted, then read the address:
   clawchaind keys show burned-faucet -a --keyring-backend test
   # delete it afterwards:
   clawchaind keys delete burned-faucet --keyring-backend test -y
   ```

## Secret Handling

- Never commit secrets (mnemonics, private keys, API tokens) to the repository.
  `.env`, `*.env`, and `.env.*` are gitignored; use `.env.example` with **empty**
  values as the template.
- Validator and faucet keys for any network holding value must use an encrypted
  keyring (`file`/`os`) or a remote signer/HSM — never `--keyring-backend test`.
- See [mainnet/README.md](mainnet/README.md) for the genesis ceremony and
  pre-launch key-handling gates.
