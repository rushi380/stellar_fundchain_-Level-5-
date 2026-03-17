#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Env, Address, String,
};

// Import FCToken for test setup
use crate::fctoken::FCTokenClient as _FCTokenClient;

fn s(env: &Env, val: &str) -> String { String::from_str(env, val) }

/// Full test setup:
/// 1. Deploy FCToken
/// 2. Deploy FundChain, pass FCToken address
/// 3. Call FCToken.set_minter(FundChain address)
fn setup() -> (
    Env,
    FundChainContractClient<'static>,
    Address, // fundchain contract id
) {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy FCToken
    let fctoken_id  = env.register_contract(None, crate::fctoken_mod::FCTokenContract);
    // We call initialize on FCToken via raw invoke since we're in fundchain crate
    // In real deploy this is a separate transaction
    let admin = Address::generate(&env);
    env.invoke_contract::<()>(
        &fctoken_id,
        &soroban_sdk::symbol_short!("init"),
        soroban_sdk::vec![&env,
            admin.clone().into_val(&env),
        ],
    );

    // Deploy FundChain
    let fc_id     = env.register_contract(None, FundChainContract);
    let fc_client = FundChainContractClient::new(&env, &fc_id);

    // Initialize FundChain with FCToken address
    fc_client.initialize(&fctoken_id);

    // Set FundChain as the minter on FCToken
    env.invoke_contract::<()>(
        &fctoken_id,
        &soroban_sdk::symbol_short!("set_mnt"),
        soroban_sdk::vec![&env,
            fc_id.clone().into_val(&env),
        ],
    );

    (env, fc_client, fc_id)
}

// ── Simple setup without FCToken (for pure campaign logic tests) ──────────────
fn setup_simple() -> (Env, FundChainContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    // Register a dummy FCToken
    let fctoken_id = env.register_contract(None, DummyFCToken);
    let fc_id      = env.register_contract(None, FundChainContract);
    let fc_client  = FundChainContractClient::new(&env, &fc_id);
    fc_client.initialize(&fctoken_id);
    (env, fc_client)
}

// Dummy FCToken for unit tests that don't need real token minting
#[soroban_sdk::contract]
struct DummyFCToken;
#[soroban_sdk::contractimpl]
impl DummyFCToken {
    pub fn mint(_env: soroban_sdk::Env, _to: Address, _amount: i128) {}
}

// ── Campaign creation tests ───────────────────────────────────────────────────

#[test]
fn test_create_returns_zero_for_first_campaign() {
    let (env, c) = setup_simple();
    let owner    = Address::generate(&env);
    let id       = c.create_campaign(&owner, &s(&env,"My Project"), &s(&env,"Desc"), &1000, &30);
    assert_eq!(id, 0);
}

#[test]
fn test_campaign_ids_are_sequential() {
    let (env, c) = setup_simple();
    let owner    = Address::generate(&env);
    assert_eq!(c.create_campaign(&owner, &s(&env,"A"), &s(&env,"D"), &100, &7),  0);
    assert_eq!(c.create_campaign(&owner, &s(&env,"B"), &s(&env,"D"), &100, &7),  1);
    assert_eq!(c.create_campaign(&owner, &s(&env,"C"), &s(&env,"D"), &100, &7),  2);
}

#[test]
fn test_campaign_stores_data_correctly() {
    let (env, c) = setup_simple();
    let owner    = Address::generate(&env);
    c.create_campaign(&owner, &s(&env,"FundChain Pro"), &s(&env,"Advanced"), &500, &14);
    let campaign = c.get_campaign(&0);
    assert_eq!(campaign.goal,         500);
    assert_eq!(campaign.raised,       0);
    assert_eq!(campaign.withdrawn,    false);
    assert_eq!(campaign.token_minted, 0);
}

#[test]
#[should_panic(expected = "Goal must be greater than 0")]
fn test_create_zero_goal_panics() {
    let (env, c) = setup_simple();
    c.create_campaign(&Address::generate(&env), &s(&env,"X"), &s(&env,"D"), &0, &7);
}

#[test]
#[should_panic(expected = "Duration max is 90 days")]
fn test_create_over_90_days_panics() {
    let (env, c) = setup_simple();
    c.create_campaign(&Address::generate(&env), &s(&env,"X"), &s(&env,"D"), &100, &91);
}

// ── Contribution tests ────────────────────────────────────────────────────────

#[test]
fn test_contribute_updates_raised() {
    let (env, c) = setup_simple();
    let owner    = Address::generate(&env);
    let backer   = Address::generate(&env);
    c.create_campaign(&owner, &s(&env,"Proj"), &s(&env,"D"), &1000, &30);
    c.contribute(&0, &backer, &250);
    let campaign = c.get_campaign(&0);
    assert_eq!(campaign.raised,       250);
    assert_eq!(campaign.token_minted, 250);
}

#[test]
fn test_multiple_backers_accumulate() {
    let (env, c) = setup_simple();
    let owner    = Address::generate(&env);
    c.create_campaign(&owner, &s(&env,"Proj"), &s(&env,"D"), &1000, &30);
    c.contribute(&0, &Address::generate(&env), &100);
    c.contribute(&0, &Address::generate(&env), &200);
    c.contribute(&0, &Address::generate(&env), &300);
    assert_eq!(c.get_campaign(&0).raised, 600);
}

#[test]
#[should_panic(expected = "Campaign has ended")]
fn test_contribute_after_deadline_panics() {
    let (env, c) = setup_simple();
    let owner    = Address::generate(&env);
    c.create_campaign(&owner, &s(&env,"Proj"), &s(&env,"D"), &100, &1);
    env.ledger().with_mut(|l| l.sequence_number = 999_999);
    c.contribute(&0, &Address::generate(&env), &10);
}

// ── Withdraw tests ────────────────────────────────────────────────────────────

#[test]
fn test_withdraw_succeeds_when_goal_met() {
    let (env, c) = setup_simple();
    let owner    = Address::generate(&env);
    let backer   = Address::generate(&env);
    c.create_campaign(&owner, &s(&env,"Proj"), &s(&env,"D"), &100, &30);
    c.contribute(&0, &backer, &100);
    c.withdraw(&0);
    assert_eq!(c.get_campaign(&0).withdrawn, true);
}

#[test]
#[should_panic(expected = "Goal not reached yet")]
fn test_withdraw_before_goal_panics() {
    let (env, c) = setup_simple();
    let owner    = Address::generate(&env);
    c.create_campaign(&owner, &s(&env,"Proj"), &s(&env,"D"), &100, &30);
    c.contribute(&0, &Address::generate(&env), &50);
    c.withdraw(&0);
}

// ── Refund tests ──────────────────────────────────────────────────────────────

#[test]
fn test_refund_zeros_contribution() {
    let (env, c) = setup_simple();
    let owner    = Address::generate(&env);
    let backer   = Address::generate(&env);
    c.create_campaign(&owner, &s(&env,"Proj"), &s(&env,"D"), &1000, &1);
    c.contribute(&0, &backer, &50);
    env.ledger().with_mut(|l| l.sequence_number = 999_999);
    c.refund(&0, &backer);
    assert_eq!(c.get_contribution(&0, &backer), 0);
}

#[test]
#[should_panic(expected = "No contribution to refund")]
fn test_refund_non_backer_panics() {
    let (env, c) = setup_simple();
    let owner    = Address::generate(&env);
    c.create_campaign(&owner, &s(&env,"Proj"), &s(&env,"D"), &1000, &1);
    env.ledger().with_mut(|l| l.sequence_number = 999_999);
    c.refund(&0, &Address::generate(&env));
}