const { ethers } = require('hardhat');
const w3utils = require('web3-utils');
const snx = require('synthetix-2.50.4-ovm');
const { artifacts, contract, web3 } = require('hardhat');
const { setTargetAddress, getTargetAddress } = require('../../helpers');

const { getImplementationAddress } = require('@openzeppelin/upgrades-core');

const { toBN } = web3.utils;

const { toBytes32 } = require('../../../index');

async function main() {
	let accounts = await ethers.getSigners();
	let owner = accounts[0];
	let networkObj = await ethers.provider.getNetwork();
	let network = networkObj.name;
	if (network == 'homestead') {
		network = 'mainnet';
	}

	console.log('Account is:' + owner.address);
	console.log('Network name:' + networkObj.name);

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
	if (networkObj.chainId == 420) {
		networkObj.name = 'optimisticGoerli';
		network = 'optimisticGoerli';
	}

	if (networkObj.chainId == 80001) {
		networkObj.name = 'polygonMumbai';
		network = 'polygonMumbai';
	}

	if (networkObj.chainId == 137) {
		networkObj.name = 'polygon';
		network = 'polygon';
	}

	if (networkObj.chainId == 42161) {
		networkObj.name = 'arbitrumOne';
		network = 'arbitrumOne';
	}

	if (networkObj.chainId == 8453) {
		networkObj.name = 'baseMainnet';
		network = 'baseMainnet';
	}

	/* ========== PROPERTIES FOR INITIALIZE ========== */

	const playerProps = await ethers.getContractFactory('GamesPlayerProps');
	let playerPropsAddress = getTargetAddress('GamesPlayerProps', network);

	console.log('GamesPlayerProps address: ', playerPropsAddress);

	const consumer = await ethers.getContractFactory('TherundownConsumer');
	let consumerAddress = getTargetAddress('TherundownConsumer', network);

	console.log('TherundownConsumer address: ', consumerAddress);

	let addresses = []; // TODO add addresses

	/* ========== DEPLOY CONTRACT ========== */

	// consumer

	let GamesPlayerPropsReceiver = await ethers.getContractFactory('GamesPlayerPropsReceiver');
	const receiver = await upgrades.deployProxy(GamesPlayerPropsReceiver, [
		owner.address,
		consumerAddress,
		playerPropsAddress,
		addresses,
	]);

	await receiver.deployed();

	console.log('GamesPlayerPropsReceiver deployed to:', receiver.address);
	setTargetAddress('GamesPlayerPropsReceiver', network, receiver.address);

	const implementation = await getImplementationAddress(ethers.provider, receiver.address);
	console.log('GamesPlayerPropsReceiverImplementation: ', implementation);
	setTargetAddress('GamesPlayerPropsReceiverImplementation', network, implementation);

	await hre.run('verify:verify', {
		address: implementation,
	});
}

function delay(time) {
	return new Promise(function (resolve) {
		setTimeout(resolve, time);
	});
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
