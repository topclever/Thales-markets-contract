const path = require('path');
const { ethers, upgrades } = require('hardhat');
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');

const { getTargetAddress, setTargetAddress } = require('../helpers');

async function main() {
	let accounts = await ethers.getSigners();
	let owner = accounts[0];
	let networkObj = await ethers.provider.getNetwork();
	let network = networkObj.name;
	let mainnetNetwork = 'mainnet';
	let PaymentToken;

	if (network == 'homestead') {
		console.log(
			"Error L1 network used! Deploy only on L2 Optimism. \nTry using '--network optimistic'"
		);
		return 0;
	}
	if (networkObj.chainId == 42) {
		networkObj.name = 'kovan';
		network = 'kovan';
		PaymentToken = getTargetAddress('ExoticUSD', network);
	}
	if (networkObj.chainId == 69) {
		networkObj.name = 'optimisticKovan';
		network = 'optimisticKovan';
		mainnetNetwork = 'kovan';
		PaymentToken = getTargetAddress('ExoticUSD', network);
	}
	if (networkObj.chainId == 10) {
		networkObj.name = 'optimisticEthereum';
		network = 'optimisticEthereum';
	}
	if (networkObj.chainId == 5) {
		networkObj.name = 'goerli';
		network = 'goerli';
		PaymentToken = getTargetAddress('ExoticUSD', network);
	}

	if (networkObj.chainId == 420) {
		networkObj.name = 'optimisticGoerli';
		network = 'optimisticGoerli';
		PaymentToken = getTargetAddress('ExoticUSD', network);
	}

	if (networkObj.chainId == 42161) {
		networkObj.name = 'arbitrumOne';
		network = 'arbitrumOne';
		PaymentToken = getTargetAddress('ProxysUSD', network);
	}

	if (networkObj.chainId == 8453) {
		networkObj.name = 'baseMainnet';
		network = 'baseMainnet';
		proxySUSD = getTargetAddress('ProxyUSDC', network);
	}

	if (networkObj.chainId == 137) {
		networkObj.name = 'polygon';
		network = 'polygon';
		proxySUSD = getTargetAddress('ProxyUSDC', network);
	}
	if (networkObj.chainId == 56) {
		networkObj.name = 'bsc';
		network = 'bsc';
		proxySUSD = getTargetAddress('BUSD', network);
	}

	const speedMarketsAMMDataAddress = getTargetAddress('SpeedMarketsAMMData', network);
	const SpeedMarketsAMMData = await ethers.getContractFactory('SpeedMarketsAMMData');

	if (networkObj.chainId == 42 || networkObj.chainId == 5 || networkObj.chainId == 420) {
		await upgrades.upgradeProxy(speedMarketsAMMDataAddress, SpeedMarketsAMMData);
		await delay(15000);

		const SpeedMarketsAMMDataImplementation = await getImplementationAddress(
			ethers.provider,
			speedMarketsAMMDataAddress
		);
		console.log('SpeedMarketsAMMData upgraded');

		console.log('Implementation SpeedMarketsAMMData: ', SpeedMarketsAMMDataImplementation);
		setTargetAddress(
			'SpeedMarketsAMMDataImplementation',
			network,
			SpeedMarketsAMMDataImplementation
		);

		try {
			await hre.run('verify:verify', {
				address: SpeedMarketsAMMDataImplementation,
			});
		} catch (e) {
			console.log(e);
		}
	}

	if (
		networkObj.chainId == 10 ||
		networkObj.chainId == 42161 ||
		networkObj.chainId == 137 ||
		networkObj.chainId == 56 ||
		networkObj.chainId == 8453
	) {
		const implementation = await upgrades.prepareUpgrade(
			speedMarketsAMMDataAddress,
			SpeedMarketsAMMData
		);
		await delay(5000);

		console.log('SpeedMarketsAMMData upgraded');

		console.log('Implementation SpeedMarketsAMMData: ', implementation);
		setTargetAddress('SpeedMarketsAMMDataImplementation', network, implementation);
		try {
			await hre.run('verify:verify', {
				address: implementation,
			});
		} catch (e) {
			console.log(e);
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

function delay(time) {
	return new Promise(function (resolve) {
		setTimeout(resolve, time);
	});
}
