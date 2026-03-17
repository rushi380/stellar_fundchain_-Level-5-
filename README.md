# ⛓ FundChain Pro — Advanced Stellar Crowdfunding

> Production-ready crowdfunding dApp on **Stellar Soroban** with inter-contract calls and FCT reward tokens. Two smart contracts work together — every XLM contributed automatically mints FCT reward tokens to the backer's wallet.

---

## 🌐 Live Demo

🔗 **[Fundchain-Pro-App](stellar-fundchain-pro.vercel.app)**

---

## 🎥 Demo Video

📹 **[Video Demo](https://www.loom.com/share/65938e89ec414e7caf735da2621723cd)**

---

## 📸 Test Output Screenshot


<img width="1044" height="450" alt="Screenshot 2026-03-15 220528" src="https://github.com/user-attachments/assets/e2e3e491-02bc-4c93-9af9-d57b5540804e" />



---

## 📱 Mobile Responsive

The UI is fully responsive across all screen sizes.

> **Screenshot**: Add a screenshot of the mobile view here after deployment.

---

## ⚙️ CI/CD Pipeline

GitHub Actions runs on every push to `main`:
- ✅ JS test suite (10 tests)
- ✅ Frontend build check

<img width="1919" height="424" alt="Screenshot 2026-03-17 215352" src="https://github.com/user-attachments/assets/51fa9969-356a-4223-800e-9980e37f917c" />

---

## 🏗 Architecture — Two Contracts

```
User contributes 100 XLM
         ↓
┌─────────────────────────┐
│  FundChain Contract     │  ← Main contract
│  - create_campaign()    │
│  - contribute()  ───────┼──→ INTER-CONTRACT CALL
│  - withdraw()           │         ↓
│  - refund()             │  ┌──────────────────┐
└─────────────────────────┘  │  FCToken Contract │
                              │  - mint(backer,  │
                              │    100 FCT)       │
                              └──────────────────┘
         ↓
Backer receives 100 FCT in their wallet automatically
```

---

## 📋 Contract Addresses (Stellar Testnet)

| Contract | Address |
|---|---|
| FCToken (FCT) | `CDR76AVXWJ3UXVBC6CJEOTKFT4WZSJLL6TSITPRCOAVKIBZ57ZJ2MDRW` |
| FundChain Pro | `CDPWFGQG6MJOXJDMVP22FOCP2X5SLAUDANFTTYFRIBTNQHYRYH23CYC5` |

---

## 🔗 Transaction Hashes

| Action | TX Hash |
|---|---|
| FCToken deploy | `3382af179e5801c45def29fd7214ed0d5753e0c7b04a8fd18804b8b8849802e9` |
| FundChain deploy | `088f7401374c344b9d35e991892196dc2a167aeed84e352c7a8fa739865f2792` |
| set_minter call | `0d896d81fa41251ecf4694dd83ce2a067b918925bf6e5b1e083466cfa45e8cd4` |


---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Contract 1 | Rust + Soroban SDK 23.4.1 — FundChain (main) |
| Contract 2 | Rust + Soroban SDK 23.4.1 — FCToken (SEP-41 reward token) |
| Blockchain | Stellar Testnet |
| Frontend | Vite 5 + Vanilla JavaScript |
| Wallet | Freighter (Stellar) |
| SDK | @stellar/stellar-sdk 14.5.0 |
| CI/CD | GitHub Actions |
| Deployment | Vercel |

---

## ✨ Features

- 🚀 **Create Campaigns** — Deploy crowdfunding campaigns as Soroban contracts
- 💰 **Contribute XLM** — Back campaigns with Stellar's native token
- ⬡ **Earn FCT Tokens** — Automatic reward token minting via inter-contract call
- 🏆 **Withdraw Funds** — Owner withdraws when goal is reached
- 🔄 **Refunds** — Backers refunded if goal not met after deadline
- 🔍 **Filter & Search** — Browse by category or keyword
- 📱 **Mobile Responsive** — Works on all screen sizes
- ✅ **CI/CD** — GitHub Actions on every push

---

## 📁 Project Structure

```
fundchain-pro/
├── .github/
│   └── workflows/
│       └── ci.yml                    ← GitHub Actions CI/CD
├── contracts/
│   ├── Cargo.toml                    ← Rust workspace
│   ├── fctoken/                      ← FCT reward token contract
│   │   └── src/
│   │       ├── lib.rs                ← SEP-41 token logic
│   │       └── test.rs               ← Rust tests
│   └── fundchain/                    ← Main crowdfunding contract
│       └── src/
│           ├── lib.rs                ← Campaign logic + inter-contract call
│           └── test.rs               ← Rust tests
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── App.js                ← Root component
│       │   └── index.js              ← All UI components
│       ├── contracts/
│       │   ├── FundChain.json        ← FundChain contract ID
│       │   └── FCToken.json          ← FCToken contract ID
│       ├── utils/
│       │   ├── contractClient.js     ← Soroban RPC + both contracts
│       │   ├── walletConnector.js    ← Freighter v2 wallet
│       │   ├── store.js              ← Reactive state
│       │   └── cache.js              ← Two-layer cache
│       └── styles/
│           └── main.css              ← Gold/dark design system
└── tests/
    └── fundchain.test.js             ← 10 JS unit tests
```

---

## 🚀 Local Setup

### Step 1 — Install tools
```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none

# Stellar CLI
cargo install stellar-cli --features opt

# Node.js 20 from nodejs.org
```

### Step 2 — Create testnet identity
```bash
stellar network add --global testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

stellar keys generate --global deployer --network testnet --fund
stellar keys address deployer
```

### Step 3 — Deploy FCToken first
```bash
cd contracts
stellar contract build

stellar contract deploy \
  --wasm target/wasm32v1-none/release/fctoken.wasm \
  --source deployer --network testnet --alias fctoken
# → prints: FCTOKEN_CONTRACT_ID
```

### Step 4 — Initialize FCToken
```bash
stellar contract invoke \
  --id FCTOKEN_CONTRACT_ID \
  --source deployer --network testnet \
  -- initialize \
  --admin $(stellar keys address deployer)
```

### Step 5 — Deploy FundChain
```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/fundchain.wasm \
  --source deployer --network testnet --alias fundchain
# → prints: FUNDCHAIN_CONTRACT_ID
```

### Step 6 — Initialize FundChain with FCToken address
```bash
stellar contract invoke \
  --id FUNDCHAIN_CONTRACT_ID \
  --source deployer --network testnet \
  -- initialize \
  --fctoken_address FCTOKEN_CONTRACT_ID
```

### Step 7 — Set FundChain as the FCToken minter
```bash
stellar contract invoke \
  --id FCTOKEN_CONTRACT_ID \
  --source deployer --network testnet \
  -- set_minter \
  --minter FUNDCHAIN_CONTRACT_ID
```

### Step 8 — Paste contract IDs into frontend
Edit `frontend/src/contracts/FundChain.json`:
```json
{ "contractId": "FUNDCHAIN_CONTRACT_ID", ... }
```

Edit `frontend/src/contracts/FCToken.json`:
```json
{ "contractId": "FCTOKEN_CONTRACT_ID", ... }
```

### Step 9 — Run frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### Step 10 — Run tests
```bash
node tests/fundchain.test.js
# → 10 passed, 0 failed
```

---

## 🔑 Smart Contract Functions

### FundChain Contract

| Function | Description |
|---|---|
| `initialize(fctoken_address)` | Set FCToken address — call once after deploy |
| `create_campaign(owner, title, desc, goal_xlm, duration_days)` | Create a campaign |
| `contribute(campaign_id, backer, amount_xlm)` | Fund + auto-mint FCT via inter-contract call |
| `withdraw(campaign_id)` | Owner withdraws when goal met |
| `refund(campaign_id, backer)` | Backer refund if goal not met |
| `get_campaign(id)` | Read campaign data |
| `get_campaign_count()` | Total campaigns |

### FCToken Contract

| Function | Description |
|---|---|
| `initialize(admin)` | Set admin — call once after deploy |
| `set_minter(minter)` | Set FundChain as the only minter |
| `mint(to, amount)` | Mint FCT — only callable by FundChain |
| `balance(address)` | Get FCT balance |
| `total_supply()` | Total FCT minted |

---

## 🌐 Useful Links

| Resource | Link |
|---|---|
| Stellar Testnet Explorer | https://stellar.expert/explorer/testnet |
| Get free testnet XLM | https://friendbot.stellar.org |
| Freighter Wallet | https://freighter.app |
| Soroban Docs | https://developers.stellar.org/docs/smart-contracts |

---



## 👤 Author

**Rushikesh** — [@rushi380](https://github.com/rushi380)

---

## 📄 License

MIT
