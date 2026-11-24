// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ClipVaultEscrow} from "../src/ClipVaultEscrow.sol";

/// @notice Deploy ClipVaultEscrow to QIE mainnet (chain ID 1990).
///  QUSDC is already deployed — never deploy your own token. The fee
///  recipient is fixed at deploy time and receives the 2% platform fee.
///
///  Dry-run (no broadcast, no key needed):
///    forge script script/Deploy.s.sol --rpc-url https://rpc1mainnet.qie.digital
///
///  Deploy (deployer key required — supplied at deploy time, never committed):
///    forge script script/Deploy.s.sol --rpc-url https://rpc1mainnet.qie.digital \
///      --broadcast --private-key $PRIVATE_KEY
///  The deployer must hold enough QIE for gas. Fee recipient override:
///    FEE_RECIPIENT=0x... forge script script/Deploy.s.sol ...
contract Deploy is Script {
    address internal constant DEFAULT_QUSDC = 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5;

    function run() external returns (ClipVaultEscrow) {
        address token = vm.envOr("QUSDC_ADDRESS", DEFAULT_QUSDC);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", address(0));
        require(feeRecipient != address(0), "FEE_RECIPIENT env var is required");
        uint256 key = vm.envOr("PRIVATE_KEY", uint256(0));
        if (key != 0) {
            vm.startBroadcast(key);
        } else {
            vm.startBroadcast();
        }
        ClipVaultEscrow vault = new ClipVaultEscrow(token, feeRecipient);
        vm.stopBroadcast();
        console.log("ClipVaultEscrow deployed at:", address(vault));
        console.log("QUSDC token:", token);
        console.log("Fee recipient:", feeRecipient);
        console.log("Platform fee: 2% (200 bps)");
        console.log("Chain ID: 1990 (QIE mainnet)");
        return vault;
    }
}
