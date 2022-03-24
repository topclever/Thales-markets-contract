const path = require('path');
const { ethers, upgrades } = require('hardhat');
const w3utils = require('web3-utils');
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');


const { getTargetAddress, setTargetAddress } = require('../helpers');

async function main() {
	let accounts = await ethers.getSigners();
	let owner = accounts[0];
	let networkObj = await ethers.provider.getNetwork();
	let network = networkObj.name;
	let mainnetNetwork = 'mainnet';

	if (network == 'homestead') {
		console.log("Error L1 network used! Deploy only on L2 Optimism. \nTry using \'--network optimistic\'")
		return 0;
	}
	if (networkObj.chainId == 42) {
		networkObj.name = 'kovan';
		network = 'kovan';
	}
	if (networkObj.chainId == 69) {
		networkObj.name = 'optimisticKovan';
		network = 'optimisticKovan';
		mainnetNetwork = 'kovan';
	}
	if (networkObj.chainId == 10) {
		networkObj.name = 'optimistic';
		network = 'optimistic';
	}
	
    const ExoticMarketMastercopyAddress = getTargetAddress("ExoticMarketMasterCopy", network);
    const ExoticMarketManagerAddress = getTargetAddress("ExoticMarketManager", network);
    const ExoticMarketManager = await ethers.getContractFactory('ExoticPositionalMarketManager');
    
    await upgrades.upgradeProxy(ExoticMarketManagerAddress, ExoticMarketManager);
    await delay(5000);

    console.log('ExoticMarketManager upgraded');

  	const ExoticMarketManagerImplementation = await getImplementationAddress(
		ethers.provider,
		ExoticMarketManagerAddress
	);

	console.log('Implementation ExoticMarketManager: ', ExoticMarketManagerImplementation);
	setTargetAddress('ExoticMarketManagerImplementation', network, ExoticMarketManagerImplementation);

	// await delay(5000);
	
	// const ExoticManagerDeployed = await ExoticMarketManager.attach(ExoticMarketManagerAddress);
	
	// await ExoticManagerDeployed.setMinimumFixedTicketAmount(w3utils.toWei("10", "ether"), {from: owner.address})
	
	// await delay(5000);
	
	try {
		await hre.run('verify:verify', {
			address: ExoticMarketManagerImplementation,
		});
	} catch (e) {
		console.log(e);
	}


}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

    
function delay(time) {
	return new Promise(function(resolve) {
		setTimeout(resolve, time);
	});
}
