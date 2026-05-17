## Claw Wallet Ethereum SDK + Next.js Example

A minimal example that integrates Claw Wallet Ethereum SDK with Next.js. It
connects to the Ethereum Sepolia testnet by default and demonstrates social
sign-in, account info, and a simple transfer transaction.

### Requirements

- Node.js 22+
- Yarn (workspaces)

### Environment Variables

Create a `.env.local` file in this directory and set your Claw Wallet API
key.

```bash
cp .env.example .env.local
```

```bash
# .env.local
NEXT_PUBLIC_OKO_API_KEY=YOUR_ISSUED_API_KEY
```

Note: Use the API key issued from the
[Claw Wallet Dashboard](https://clawchain.io/dapp).

### How to Run

```bash
yarn install
yarn dev
```

Open `http://localhost:3000` in your browser.
