#![no_std]

//! FCToken — FundChain Reward Token (FCT)
//!
//! A SEP-41 compatible token on Stellar Soroban.
//! Backers earn 1 FCT per 1 XLM contributed to any FundChain campaign.
//!
//! Only the authorised minter (the FundChain contract) can mint tokens.
//! The admin sets the minter address once after both contracts are deployed.

use soroban_sdk::{
    contract, contractimpl, contracttype,
    Address, Env, String,
    symbol_short,
};

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,            // Address — contract deployer
    Minter,           // Address — only this address can call mint()
    Balance(Address), // i128    — token balance per address
    TotalSupply,      // i128    — total FCT minted ever
    Initialized,      // bool    — prevents double-init
}

// ── Token metadata (fixed at deploy time) ─────────────────────────────────────
const TOKEN_NAME:     &str = "FundChain Token";
const TOKEN_SYMBOL:   &str = "FCT";
const TOKEN_DECIMALS: u32  = 7; // same as XLM stroops

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct FCTokenContract;

#[contractimpl]
impl FCTokenContract {

    // ── Admin setup ───────────────────────────────────────────────────────────

    /// Initialise the token. Called once by the deployer.
    /// admin     = deployer's address
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        let already: bool = env.storage().instance()
            .get(&DataKey::Initialized).unwrap_or(false);
        assert!(!already, "Already initialised");
        env.storage().instance().set(&DataKey::Admin,       &admin);
        env.storage().instance().set(&DataKey::TotalSupply, &0_i128);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    /// Set the minter address. Only admin can call this.
    /// Call this after deploying FundChain, passing the FundChain contract ID.
    pub fn set_minter(env: Env, minter: Address) {
        let admin: Address = env.storage().instance()
            .get(&DataKey::Admin).expect("Not initialised");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Minter, &minter);
        env.events().publish((symbol_short!("minter"),), minter);
    }

    // ── Minting (only callable by FundChain contract) ─────────────────────────

    /// Mint FCT tokens to a backer.
    /// Called by the FundChain contract on every contribution.
    /// amount = whole XLM contributed (1 XLM → 1 FCT)
    pub fn mint(env: Env, to: Address, amount: i128) {
        assert!(amount > 0, "Amount must be greater than 0");

        // Only the authorised minter (FundChain contract) can mint
        let minter: Address = env.storage().instance()
            .get(&DataKey::Minter).expect("Minter not set — call set_minter first");
        minter.require_auth();

        // Update recipient balance
        let key     = DataKey::Balance(to.clone());
        let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(current + amount));

        // Update total supply
        let supply: i128 = env.storage().instance()
            .get(&DataKey::TotalSupply).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSupply, &(supply + amount));

        env.events().publish((symbol_short!("mint"), to), amount);
    }

    // ── SEP-41 standard read functions ────────────────────────────────────────

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    pub fn name(_env: Env) -> String {
        String::from_str(&_env, TOKEN_NAME)
    }

    pub fn symbol(_env: Env) -> String {
        String::from_str(&_env, TOKEN_SYMBOL)
    }

    pub fn decimals(_env: Env) -> u32 {
        TOKEN_DECIMALS
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance()
            .get(&DataKey::Admin)
            .expect("Not initialised")
    }

    pub fn minter(env: Env) -> Address {
        env.storage().instance()
            .get(&DataKey::Minter)
            .expect("Minter not set")
    }
}

#[cfg(test)]
mod test;