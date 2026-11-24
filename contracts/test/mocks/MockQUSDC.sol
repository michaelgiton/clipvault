// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mintable 6-decimal ERC-20 mirroring QUSDC, for local tests only.
contract MockQUSDC is ERC20 {
    constructor() ERC20("QUSDC", "QUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
