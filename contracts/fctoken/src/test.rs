#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, Address};

fn setup() -> (Env, FCTokenContractClient<'static>, Address) {
    let env    = Env::default();
    env.mock_all_auths();
    let id     = env.register_contract(None, FCTokenContract);
    let client = FCTokenContractClient::new(&env, &id);
    let admin  = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin)
}

#[test]
fn test_initialize_sets_admin() {
    let (env, client, admin) = setup();
    assert_eq!(client.admin(), admin);
}

#[test]
fn test_token_metadata() {
    let (_, client, _) = setup();
    assert_eq!(client.decimals(), 7);
}

#[test]
fn test_set_minter_and_mint() {
    let (env, client, _) = setup();
    let minter  = Address::generate(&env);
    let backer  = Address::generate(&env);
    client.set_minter(&minter);
    client.mint(&backer, &100);
    assert_eq!(client.balance(&backer), 100);
    assert_eq!(client.total_supply(),   100);
}

#[test]
fn test_multiple_mints_accumulate() {
    let (env, client, _) = setup();
    let minter = Address::generate(&env);
    let backer = Address::generate(&env);
    client.set_minter(&minter);
    client.mint(&backer, &50);
    client.mint(&backer, &75);
    assert_eq!(client.balance(&backer),  125);
    assert_eq!(client.total_supply(),    125);
}

#[test]
fn test_balance_zero_for_unknown_address() {
    let (env, client, _) = setup();
    let stranger = Address::generate(&env);
    assert_eq!(client.balance(&stranger), 0);
}

#[test]
#[should_panic(expected = "Already initialised")]
fn test_double_initialize_panics() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
}

#[test]
#[should_panic(expected = "Amount must be greater than 0")]
fn test_mint_zero_panics() {
    let (env, client, _) = setup();
    let minter = Address::generate(&env);
    let backer = Address::generate(&env);
    client.set_minter(&minter);
    client.mint(&backer, &0);
}