const { ethers, upgrades } = require('hardhat');
const { getTargetAddress, setTargetAddress } = require('../helpers');
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');

async function main() {
	let accounts = await ethers.getSigners();
	let owner = accounts[0];
	let networkObj = await ethers.provider.getNetwork();
	let network = networkObj.name;
	if (network === 'unknown') {
		network = 'localhost';
	}

	if (network == 'homestead') {
		network = 'mainnet';
	}

	if (networkObj.chainId == 69) {
		networkObj.name = 'optimisticKovan';
		network = 'optimisticKovan';
	}
	if (networkObj.chainId == 10) {
		networkObj.name = 'optimisticEthereum';
		network = 'optimisticEthereum';
	}
	if (networkObj.chainId == 80001) {
		networkObj.name = 'polygonMumbai';
		network = 'polygonMumbai';
	}

	if (networkObj.chainId == 137) {
		networkObj.name = 'polygon';
		network = 'polygon';
	}

	console.log('Account is: ' + owner.address);
	console.log('Network:' + network);

	const referralsAddress = getTargetAddress('Referrals', network);
	console.log('Found Referrals at:', referralsAddress);

	const Referrals = await ethers.getContractFactory('Referrals');
	// const implementation = await upgrades.prepareUpgrade(referralsAddress, Referrals);
	await upgrades.upgradeProxy(referralsAddress, Referrals);
	console.log('Referrals upgraded');
	await delay(10000);

	const ReferralsImplementation = await getImplementationAddress(ethers.provider, referralsAddress);

	console.log('Implementation Referrals: ', ReferralsImplementation);

	setTargetAddress('ReferralsImplementation', network, ReferralsImplementation);

	try {
		await hre.run('verify:verify', {
			address: ReferralsImplementation,
		});
	} catch (e) {
		console.log(e);
	}
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
function delay(time) {
	return new Promise(function(resolve) {
		setTimeout(resolve, time);
	});
}
