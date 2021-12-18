'use strict';

const { artifacts, contract, web3, ethers } = require('hardhat');
const { toBN, fromBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('../../utils/common');

const { toBytes32 } = require('../../../index');
const { expect } = require('chai');
const { toDecimal } = require('web3-utils');
// const { ethers } = require('ethers');
const { setupContract, setupAllContracts } = require('../../utils/setup');

const ZERO_ADDRESS = '0x' + '0'.repeat(40);

const {
	fastForward,
	toUnit,
	fromUnit,
	currentTime,
	multiplyDecimalRound,
	divideDecimalRound,
} = require('../../utils')();

const {
	onlyGivenAddressCanInvoke,
	convertToDecimals,
	encodeCall,
	assertRevert,
} = require('../../utils/helpers');

contract('StakingThales', accounts => {
    const [first, second, third] = accounts;
	const [initialCreator, managerOwner, minter, dummy, exersicer, secondCreator] = accounts;
    
    let owner, firstSigner;
	let ThalesDeployed,
		ThalesFeeDeployed,
		StakingThalesDeployed,
		EscrowThalesDeployed,
		OngoingAirdropDeployed,
        ProxyEscrowDeployed,
        ProxyStakingDeployed;

    let initializeStalkingData,
        initializeEscrowData;

    let EscrowImplementation,
        StakingImplementation;
    
	let EscrowImplementationV2,
        StakingImplementationV2;
	let StakingThalesDeployedV2,
		EscrowThalesDeployedV2;

	const sUSDQty = toUnit(5555);
	const sUSD = 5555;
	const sAUDKey = toBytes32('sAUD');
	const SECOND = 1000;
	const DAY = 86400;
	const WEEK = 604800;
	const YEAR = 31556926;

	let BinaryOptionMarket = artifacts.require('BinaryOptionMarket');
	let Synth = artifacts.require('Synth');
	let BinaryOption = artifacts.require('BinaryOption');
	let manager, factory, addressResolver;
	let sUSDSynth, binaryOptionMarketMastercopy, binaryOptionMastercopy;
	before(async () => {
		({
			BinaryOptionMarketManager: manager,
			BinaryOptionMarketFactory: factory,
			BinaryOptionMarketMastercopy: binaryOptionMarketMastercopy,
			BinaryOptionMastercopy: binaryOptionMastercopy,
			AddressResolver: addressResolver,
			SynthsUSD: sUSDSynth,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'FeePool',
				'BinaryOptionMarketMastercopy',
				'BinaryOptionMastercopy',
				'BinaryOptionMarketFactory',
			],
		}));

		manager.setBinaryOptionsMarketFactory(factory.address, { from: managerOwner });

		factory.setBinaryOptionMarketManager(manager.address, { from: managerOwner });
		factory.setBinaryOptionMarketMastercopy(binaryOptionMarketMastercopy.address, {
			from: managerOwner,
		});
		factory.setBinaryOptionMastercopy(binaryOptionMastercopy.address, { from: managerOwner });

		await Promise.all([
			sUSDSynth.issue(initialCreator, sUSDQty),
			sUSDSynth.approve(manager.address, sUSDQty, { from: initialCreator }),
			sUSDSynth.issue(minter, sUSDQty),
			sUSDSynth.approve(manager.address, sUSDQty, { from: minter }),
			sUSDSynth.issue(dummy, sUSDQty),
			sUSDSynth.approve(manager.address, sUSDQty, { from: dummy }),
		]);
	});

	beforeEach(async () => {
        const signers = await ethers.getSigners();
        owner = signers[0];
        firstSigner = signers[1];
		let Thales = artifacts.require('Thales');
        let EscrowThales = await ethers.getContractFactory('EscrowThales');
        let StakingThales = await ethers.getContractFactory('StakingThales');
        let OngoingAirdrop = artifacts.require('OngoingAirdrop');
        let OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
        ThalesDeployed = await Thales.new({ from: owner.address });
        ThalesFeeDeployed = await Thales.new({ from: owner.address });
        OngoingAirdropDeployed = await OngoingAirdrop.new(
            owner.address,
            ThalesDeployed.address,
            toBytes32('random'),
            { from:  owner.address }
        );
        
        EscrowThalesDeployed = await upgrades.deployProxy(EscrowThales, [
            owner.address,
            ThalesDeployed.address
        ]); 
        
        StakingThalesDeployed = await upgrades.deployProxy(StakingThales, [
            owner.address,
            EscrowThalesDeployed.address,
            ThalesDeployed.address,
            ThalesFeeDeployed.address,
            WEEK,
            WEEK
        ]); 
       

		
		await StakingThalesDeployed.connect(owner).setDistributeFeesEnabled(true);
		await StakingThalesDeployed.connect(owner).setClaimEnabled(true);
		await StakingThalesDeployed.connect(owner).setFixedPeriodReward(100000);
	});

	describe('EscrowThales basic check', () => {
		it('get if StakingThales address in EscrowThales is equal to ZERO address', async () => {
			let getStakingAddress = await EscrowThalesDeployed.iStakingThales();
			// console.log("Staking Thaless address: " + getStakingAddress);
			// console.log("Owner address: " + owner);
			assert.equal(ZERO_ADDRESS, getStakingAddress);
		});

		it('set StakingThales address in EscrowThales to the actual contract ', async () => {
			let setStakingAddress = await EscrowThalesDeployed.connect(owner).setStakingThalesContract(
				StakingThalesDeployed.address,
			);
			let getStakingAddress = await EscrowThalesDeployed.iStakingThales();
			// console.log("NEW Staking Thaless address: " + getStakingAddress);
			// console.log("StakingThalesDeployed address: " + StakingThalesDeployed.address);
			assert.equal(StakingThalesDeployed.address, getStakingAddress);
		});

		it('get if CurrentStakingPeriod is 0', async () => {
			let stakingPeriod = await EscrowThalesDeployed.currentVestingPeriod.call({ from: owner });
			assert.equal(0, stakingPeriod);
		});
		it('set CurrentStakingPeriod to 1 and check', async () => {
			let setStakingAddress = await EscrowThalesDeployed.connect(owner).setStakingThalesContract(firstSigner.address);
			let getStakingAddress = await EscrowThalesDeployed.iStakingThales();
			assert.equal(firstSigner.address, getStakingAddress);

			let setPeriod = await EscrowThalesDeployed.connect(firstSigner).updateCurrentPeriod();
			let stakingPeriod = await EscrowThalesDeployed.currentVestingPeriod.call();
			assert.equal(1, stakingPeriod);
		});

		it('check claimable function', async () => {
			let answer = await EscrowThalesDeployed.claimable(second);
			assert.equal(answer, 0);
		});

		it('check ZERO address usage for external functions', async () => {
			await expect(EscrowThalesDeployed.claimable(ZERO_ADDRESS)).to.be.revertedWith(
				'Invalid address'
			);
			await expect(EscrowThalesDeployed.addToEscrow(ZERO_ADDRESS, 0)).to.be.revertedWith(
				'Invalid address'
			);
			// await expect(EscrowThalesDeployed.vest(0,{from:ZERO_ADDRESS})).to.be.revertedWith("Invalid address");
			// await expect(EscrowThalesDeployed.moveToStakerSilo(ZERO_ADDRESS, 10, 11)).to.be.revertedWith("Invalid address");
		});
	});

	

	describe('Upgrade Implementation:', () => {
		
		it('reverts the call of new function at old implementation', async function() {
			try{
				await expect(StakingThalesDeployed.getVersion()).to.be.reverted;

			}
			catch(error) {
				// console.log("Error function does not exist");
			}
		
		});
		beforeEach(async () => {
			const signers = await ethers.getSigners();
            owner = signers[0];
            firstSigner = signers[1];
    		let  EscrowThalesV2 = await ethers.getContractFactory('ProxyEscrowThales_V2');
	        let StakingThalesV2 = await ethers.getContractFactory('ProxyStakingThales_V2');

            EscrowThalesDeployedV2 = await upgrades.upgradeProxy(EscrowThalesDeployed.address, EscrowThalesV2);

            StakingThalesDeployedV2 = await upgrades.upgradeProxy(StakingThalesDeployed.address, StakingThalesV2);
			
			
		});

		it('calls new function of new implementation', async function() {
			let tx = await StakingThalesDeployedV2.getVersion();
			assert.equal(tx.toString(), '0');
			tx = await EscrowThalesDeployedV2.getVersion();
			assert.equal(tx.toString(), '0');
		});
		it('set new value in new function of new implementation', async function() {
			let tx = await StakingThalesDeployedV2.connect(owner).setVersion(1);
			tx = await StakingThalesDeployedV2.getVersion();
			assert.equal(tx.toString(), '1');
			tx = await EscrowThalesDeployedV2.connect(owner).setVersion(10);
			tx = await EscrowThalesDeployedV2.getVersion();
			assert.equal(tx.toString(), '10');
		});
		
		it('set new value in new function of new implementation different owner', async function() {
			await expect(StakingThalesDeployedV2.connect(firstSigner).setVersion(1)).to.be.reverted;
			await expect(EscrowThalesDeployedV2.connect(firstSigner).setVersion(10)).to.be.reverted;
			
		});
	
	});
});