#![no_std]

//! FundChain Pro — Advanced Crowdfunding Contract
//!
//! Inter-contract call: on every contribution this contract calls
//! FCToken.mint(backer, amount) to reward backers with FCT tokens.
//!
//! Setup order:
//!   1. Deploy FCToken  → get FCToken address
//!   2. Deploy FundChain, passing fctoken_address
//!   3. Call FCToken.set_minter(fundchain_address)
//!   4. Everything works — contributions now mint FCT automatically

use soroban_sdk::{
    contract, contractimpl, contracttype,
    Address, Env, String,
    symbol_short,
};

// ── FCToken interface — used for the inter-contract call ──────────────────────
// We declare just the function signatures we need to call on FCToken.
// Soroban uses this to build the cross-contract invocation.

mod fctoken {
    use soroban_sdk::{contractclient, Address, Env};

    #[contractclient(name = "FCTokenClient")]
    pub trait FCToken {
        fn mint(env: Env, to: Address, amount: i128);
    }
}

use fctoken::FCTokenClient;

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Campaign(u64),
    CampaignCount,
    Contribution(u64, Address),
    FCTokenAddress,   // stored once at init — address of FCToken contract
}

// ── Campaign struct ───────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct Campaign {
    pub id:          u64,
    pub owner:       Address,
    pub title:       String,
    pub description: String,
    pub goal:        i128,      // whole XLM
    pub raised:      i128,      // whole XLM
    pub deadline:    u32,       // ledger sequence number
    pub withdrawn:   bool,
    pub token_minted: i128,     // total FCT minted for this campaign
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct FundChainContract;

#[contractimpl]
impl FundChainContract {

    // ── Initialise ────────────────────────────────────────────────────────────

    /// Store the FCToken contract address. Called once after deploy.
    pub fn initialize(env: Env, fctoken_address: Address) {
        let already_set = env.storage().instance()
            .has(&DataKey::FCTokenAddress);
        assert!(!already_set, "Already initialised");
        env.storage().instance().set(&DataKey::FCTokenAddress, &fctoken_address);
    }

    // ── Campaigns ─────────────────────────────────────────────────────────────

    /// Create a new crowdfunding campaign.
    /// goal_xlm       — funding target in whole XLM
    /// duration_days  — campaign length in days (converted to ledgers)
    pub fn create_campaign(
        env:           Env,
        owner:         Address,
        title:         String,
        description:   String,
        goal_xlm:      i128,
        duration_days: u32,
    ) -> u64 {
        owner.require_auth();
        assert!(goal_xlm > 0,      "Goal must be greater than 0");
        assert!(duration_days > 0, "Duration must be greater than 0");
        assert!(duration_days <= 90, "Duration max is 90 days");

        // 1 day ≈ 17,280 ledgers at ~5 sec per ledger
        let duration_ledgers = duration_days * 17_280;

        let id       = Self::next_id(&env);
        let campaign = Campaign {
            id,
            owner:        owner.clone(),
            title,
            description,
            goal:         goal_xlm,
            raised:       0,
            deadline:     env.ledger().sequence() + duration_ledgers,
            withdrawn:    false,
            token_minted: 0,
        };

        env.storage().persistent().set(&DataKey::Campaign(id), &campaign);
        env.events().publish((symbol_short!("created"), id), goal_xlm);
        id
    }

    /// Contribute XLM to a campaign.
    /// *** INTER-CONTRACT CALL ***
    /// After recording the contribution, this function calls
    /// FCToken.mint(backer, amount_xlm) to reward the backer with FCT tokens.
    pub fn contribute(
        env:         Env,
        campaign_id: u64,
        backer:      Address,
        amount_xlm:  i128,
    ) {
        backer.require_auth();
        assert!(amount_xlm > 0, "Amount must be greater than 0");

        let mut campaign: Campaign = env.storage().persistent()
            .get(&DataKey::Campaign(campaign_id))
            .expect("Campaign does not exist");

        assert!(
            env.ledger().sequence() < campaign.deadline,
            "Campaign has ended"
        );

        // Record contribution
        let contrib_key = DataKey::Contribution(campaign_id, backer.clone());
        let prev: i128  = env.storage().persistent()
            .get(&contrib_key).unwrap_or(0);
        env.storage().persistent().set(&contrib_key, &(prev + amount_xlm));

        campaign.raised       += amount_xlm;
        campaign.token_minted += amount_xlm;
        env.storage().persistent().set(&DataKey::Campaign(campaign_id), &campaign);

        // ── INTER-CONTRACT CALL ───────────────────────────────────────────────
        // Call FCToken.mint() to reward the backer with FCT tokens.
        // 1 XLM contributed = 1 FCT minted to backer's wallet.
        let fctoken_address: Address = env.storage().instance()
            .get(&DataKey::FCTokenAddress)
            .expect("FCToken address not set — call initialize first");

        let fctoken = FCTokenClient::new(&env, &fctoken_address);
        fctoken.mint(&backer, &amount_xlm);
        // ── END INTER-CONTRACT CALL ───────────────────────────────────────────

        env.events().publish(
            (symbol_short!("funded"), campaign_id),
            (backer, amount_xlm)
        );
    }

    /// Owner withdraws funds after goal is reached.
    pub fn withdraw(env: Env, campaign_id: u64) {
        let mut campaign: Campaign = env.storage().persistent()
            .get(&DataKey::Campaign(campaign_id))
            .expect("Campaign does not exist");

        campaign.owner.require_auth();
        assert!(campaign.raised >= campaign.goal, "Goal not reached yet");
        assert!(!campaign.withdrawn,              "Already withdrawn");

        campaign.withdrawn = true;
        env.storage().persistent().set(&DataKey::Campaign(campaign_id), &campaign);
        env.events().publish(
            (symbol_short!("withdrew"), campaign_id),
            campaign.raised
        );
    }

    /// Backer claims refund if goal NOT met after deadline.
    pub fn refund(env: Env, campaign_id: u64, backer: Address) {
        backer.require_auth();

        let mut campaign: Campaign = env.storage().persistent()
            .get(&DataKey::Campaign(campaign_id))
            .expect("Campaign does not exist");

        assert!(
            env.ledger().sequence() >= campaign.deadline,
            "Campaign is still active"
        );
        assert!(
            campaign.raised < campaign.goal,
            "Goal was reached — no refund available"
        );

        let key: DataKey = DataKey::Contribution(campaign_id, backer.clone());
        let amount: i128 = env.storage().persistent()
            .get(&key).unwrap_or(0);
        assert!(amount > 0, "No contribution to refund");

        env.storage().persistent().set(&key, &0_i128);
        campaign.raised -= amount;
        env.storage().persistent().set(&DataKey::Campaign(campaign_id), &campaign);
        env.events().publish(
            (symbol_short!("refunded"), campaign_id),
            (backer, amount)
        );
    }

    // ── Read functions ────────────────────────────────────────────────────────

    pub fn get_campaign(env: Env, campaign_id: u64) -> Campaign {
        env.storage().persistent()
            .get(&DataKey::Campaign(campaign_id))
            .expect("Campaign does not exist")
    }

    pub fn get_contribution(env: Env, campaign_id: u64, backer: Address) -> i128 {
        env.storage().persistent()
            .get(&DataKey::Contribution(campaign_id, backer))
            .unwrap_or(0)
    }

    pub fn get_campaign_count(env: Env) -> u64 {
        env.storage().persistent()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0)
    }

    pub fn get_fctoken_address(env: Env) -> Address {
        env.storage().instance()
            .get(&DataKey::FCTokenAddress)
            .expect("Not initialised")
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn next_id(env: &Env) -> u64 {
        let count: u64 = env.storage().persistent()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0);
        env.storage().persistent()
            .set(&DataKey::CampaignCount, &(count + 1));
        count
    }
}

#[cfg(test)]
mod test;