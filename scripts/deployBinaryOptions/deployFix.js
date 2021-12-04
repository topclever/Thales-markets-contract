const { ethers } = require('hardhat');
const w3utils = require('web3-utils');
const snx = require('synthetix-2.50.4-ovm');
const { artifacts, contract, web3 } = require('hardhat');
const { getTargetAddress, setTargetAddress } = require('../helpers');

async function main() {
	let accounts = await ethers.getSigners();
	let owner = accounts[0];
	let networkObj = await ethers.provider.getNetwork();
	let network = networkObj.name;
	let priceFeedAddress, ProxyERC20sUSDaddress;

	if (network == 'homestead') {
		network = 'mainnet';
	}

	if (networkObj.chainId == 69) {
		networkObj.name = 'optimisticKovan';
		network = 'optimisticKovan';
	}
	if (networkObj.chainId == 10) {
		networkObj.name = 'optimistic';
		network = 'optimistic';
	}

	if (networkObj.chainId == 10) {
		ProxyERC20sUSDaddress = getTargetAddress('ProxysUSD', network);
	} else if (networkObj.chainId == 69) {
		networkObj.name = 'optimisticKovan';
		ProxyERC20sUSDaddress = getTargetAddress('ProxysUSD', network);
	} else {
		const ProxyERC20sUSD = snx.getTarget({ network, contract: 'ProxyERC20sUSD' });
		ProxyERC20sUSDaddress = ProxyERC20sUSD.address;
	}

	console.log('Account is:' + owner.address);
	console.log('Network name:' + network);

	console.log('Found ProxyERC20sUSD at:' + ProxyERC20sUSDaddress);

	if (network == 'ropsten') {
		const ropstenPriceFeed = await ethers.getContractFactory('MockPriceFeed');
		PriceFeedDeployed = await ropstenPriceFeed.deploy(owner.address);
		await PriceFeedDeployed.deployed();
		setTargetAddress('PriceFeed', network, PriceFeedDeployed.address);
		setTargetAddress('MockPriceFeed', network, PriceFeedDeployed.address);
		console.log('MockPriceFeed deployed to:', PriceFeedDeployed.address);
		await PriceFeedDeployed.setPricetoReturn(w3utils.toWei('1000'));
		priceFeedAddress = PriceFeedDeployed.address;
		console.log('Adding aggregator', snx.toBytes32('ETH'), owner.address);
		await PriceFeedDeployed.addAggregator(snx.toBytes32('ETH'), owner.address);
	} else {
		priceFeedAddress = getTargetAddress('PriceFeed', network);
		console.log('Found PriceFeed at:' + priceFeedAddress);
	}

	// // We get the contract to deploy
	const BinaryOptionMastercopy = await ethers.getContractFactory('BinaryOptionMastercopy');
	const binaryOptionMastercopyDeployed = await BinaryOptionMastercopy.deploy();
	await binaryOptionMastercopyDeployed.deployed();

	console.log('BinaryOptionMastercopy deployed to:', binaryOptionMastercopyDeployed.address);
	setTargetAddress('BinaryOptionMastercopy', network, binaryOptionMastercopyDeployed.address);

	const BinaryOptionMarketMastercopy = await ethers.getContractFactory(
		'BinaryOptionMarketMastercopy'
	);
	const binaryOptionMarketMastercopyDeployed = await BinaryOptionMarketMastercopy.deploy();
	await binaryOptionMarketMastercopyDeployed.deployed();

	console.log(
		'binaryOptionMarketMastercopy deployed to:',
		binaryOptionMarketMastercopyDeployed.address
	);
	setTargetAddress(
		'BinaryOptionMarketMastercopy',
		network,
		binaryOptionMarketMastercopyDeployed.address
	);

	const BinaryOptionMarketFactory = await ethers.getContractFactory('BinaryOptionMarketFactory');

	const binaryOptionMarketFactoryAddress = getTargetAddress('BinaryOptionMarketFactory', network);
	const binaryOptionMarketFactoryDeployed = await BinaryOptionMarketFactory.attach(
		binaryOptionMarketFactoryAddress
	);

	let tx = await binaryOptionMarketFactoryDeployed.setBinaryOptionMarketMastercopy(
		binaryOptionMarketMastercopyDeployed.address
	);
	await tx.wait().then(e => {
		console.log('BinaryOptionMarketFactory: setBinaryOptionMarketMastercopy');
	});
	tx = await binaryOptionMarketFactoryDeployed.setBinaryOptionMastercopy(
		binaryOptionMastercopyDeployed.address
	);
	await tx.wait().then(e => {
		console.log('BinaryOptionMarketFactory: setBinaryOptionMastercopy');
	});

	await hre.run('verify:verify', {
		address: binaryOptionMastercopyDeployed.address,
		constructorArguments: [],
		contract: 'contracts/BinaryOptions/BinaryOptionMastercopy.sol:BinaryOptionMastercopy',
	});

	await hre.run('verify:verify', {
		address: binaryOptionMarketMastercopyDeployed.address,
		constructorArguments: [],
		contract:
			'contracts/BinaryOptions/BinaryOptionMarketMastercopy.sol:BinaryOptionMarketMastercopy',
	});
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
