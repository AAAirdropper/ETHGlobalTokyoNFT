import { utils } from 'ethers';

import { task } from 'hardhat/config';
import { join } from 'path';


task('etherscan-verify', 'verify').setAction(async ({}, hre) => {

  await hre.run('verify:verify', {
    address: "0x5041c60C75633F29DEb2AED79cB0A9ed79202415",
    constructorArguments: ["0xbB97656cd5fECe3a643335d03C8919D5E7DcD225"],
  });
});
