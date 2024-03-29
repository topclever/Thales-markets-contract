'use strict';

const { artifacts, contract, web3 } = require('hardhat');
const { toBN } = web3.utils;

const { assert } = require('../../utils/common');

const { toBytes32 } = require('../../../index');
const { expect } = require('chai');
const { toDecimal } = require('web3-utils');
const { setupAllContracts } = require('../../utils/setup');

const ZERO_ADDRESS = '0x' + '0'.repeat(40);

const { fastForward, toUnit, fromUnit, currentTime } = require('../../utils')();
const { encodeCall, convertToDecimals } = require('../../utils/helpers');

contract('CCIP Staking', (accounts) => {
	const [firstVault, firstLP, firstAMM, owner] = accounts;
	const [staker, secondStaker, thirdStaker, dummy] = accounts;

	let CCIPCollectorA;
	let CCIPCollectorB;

	let StakingMockA;
	let StakingMockB;

	let StakingThalesBonusRewardsManagerA;
	let StakingThalesBonusRewardsManagerB;

	let CCIPRouter;

	let AddressManagerA;
	let AddressManagerB;

	describe('Test CCIP solution ', () => {
		beforeEach(async () => {
			let CCIPCollectorContract = artifacts.require('CrossChainCollector');
			CCIPCollectorA = await CCIPCollectorContract.new();
			CCIPCollectorB = await CCIPCollectorContract.new();

			let StakingThalesMockContract = artifacts.require('StakingThalesMock');
			StakingMockA = await StakingThalesMockContract.new();
			StakingMockB = await StakingThalesMockContract.new();

			let CCIPRouterContract = artifacts.require('MockCCIPRouter');
			CCIPRouter = await CCIPRouterContract.new();

			let StakingThalesBonusRewardsManagerContract = artifacts.require(
				'StakingThalesBonusRewardsManager'
			);
			StakingThalesBonusRewardsManagerA = await StakingThalesBonusRewardsManagerContract.new();
			StakingThalesBonusRewardsManagerB = await StakingThalesBonusRewardsManagerContract.new();

			await StakingThalesBonusRewardsManagerA.initialize(owner, StakingMockA.address);
			await StakingThalesBonusRewardsManagerB.initialize(owner, StakingMockB.address);

			await CCIPCollectorA.initialize(CCIPRouter.address, true, 10, 10, { from: owner });
			await CCIPCollectorB.initialize(CCIPRouter.address, false, 0, 20, { from: owner });
			await CCIPRouter.setInterfaces(10, 20);
			let AddressManagerContract = artifacts.require('AddressManager');
			AddressManagerA = await AddressManagerContract.new();
			AddressManagerB = await AddressManagerContract.new();
			await AddressManagerA.initialize(
				owner,
				ZERO_ADDRESS,
				ZERO_ADDRESS,
				ZERO_ADDRESS,
				ZERO_ADDRESS,
				ZERO_ADDRESS,
				ZERO_ADDRESS
			);
			await AddressManagerB.initialize(
				owner,
				ZERO_ADDRESS,
				ZERO_ADDRESS,
				ZERO_ADDRESS,
				ZERO_ADDRESS,
				ZERO_ADDRESS,
				ZERO_ADDRESS
			);

			await AddressManagerA.setAddressInAddressBook('StakingThales', StakingMockA.address, {
				from: owner,
			});
			await AddressManagerB.setAddressInAddressBook('StakingThales', StakingMockB.address, {
				from: owner,
			});
			await CCIPCollectorA.setAddressManager(AddressManagerA.address, { from: owner });
			await CCIPCollectorB.setAddressManager(AddressManagerB.address, { from: owner });

			await StakingMockA.setCCIPCollector(CCIPCollectorA.address, { from: owner });
			await StakingMockB.setCCIPCollector(CCIPCollectorB.address, { from: owner });

			await StakingMockA.setStakingThalesBonusRewardsManager(
				StakingThalesBonusRewardsManagerA.address,
				{ from: owner }
			);
			await StakingMockB.setStakingThalesBonusRewardsManager(
				StakingThalesBonusRewardsManagerB.address,
				{ from: owner }
			);
		});
		it('StakingRewards: add Vaults, add LPs, set Manager', async () => {
			await StakingThalesBonusRewardsManagerA.addVaults(
				[CCIPRouter.address, CCIPCollectorA.address, CCIPCollectorB.address],
				true,
				{ from: owner }
			);
			await StakingThalesBonusRewardsManagerA.addLPs(
				[CCIPRouter.address, CCIPCollectorA.address, CCIPCollectorB.address],
				true,
				{ from: owner }
			);
			await StakingThalesBonusRewardsManagerA.setManager(staker, { from: owner });
		});
		it('SetGasLimit higher', async () => {
			// set to 9 million
			await CCIPCollectorA.setGasLimit(9000000, { from: owner });
			await expect(CCIPCollectorA.setGasLimit(10000001, { from: owner })).to.be.revertedWith(
				'Exceeds MAX_GAS'
			);
		});
		it('deploy and test', async () => {
			await StakingMockA.stake(toUnit(100000), {
				from: staker,
			});

			await StakingMockA.stake(toUnit(200000), {
				from: secondStaker,
			});

			await StakingMockA.stake(toUnit(700000), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerA.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerA.setMaxStakingMultiplier(toUnit(4), { from: owner });

			await StakingMockB.stake(toUnit(200000), {
				from: staker,
			});

			await StakingMockB.stake(toUnit(100000), {
				from: secondStaker,
			});

			await StakingMockB.stake(toUnit(700000), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerB.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerB.setMaxStakingMultiplier(toUnit(4), { from: owner });

			let stakerMultiplier = await StakingThalesBonusRewardsManagerA.getStakingMultiplier(staker);
			console.log('stakerMultiplier: ' + stakerMultiplier / 1e18);

			let secondStakerMultiplier = await StakingThalesBonusRewardsManagerA.getStakingMultiplier(
				secondStaker
			);
			console.log('secondStakerMultiplier: ' + secondStakerMultiplier / 1e18);

			let thirdStakerMultiplier = await StakingThalesBonusRewardsManagerA.getStakingMultiplier(
				thirdStaker
			);
			console.log('thirdStakerMultiplier: ' + thirdStakerMultiplier / 1e18);

			await StakingThalesBonusRewardsManagerA.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});

			await assert.revert(
				StakingMockA.updateVolumeWithOrigin(staker, toUnit(1), firstVault, {
					from: owner,
				}),
				'Only allowed for known origin'
			);

			await StakingThalesBonusRewardsManagerA.setKnownVault(firstVault, true, { from: owner });

			await StakingMockA.updateVolumeWithOrigin(staker, toUnit(10), firstVault, {
				from: owner,
			});

			let stakerVolume = await StakingThalesBonusRewardsManagerA.userRoundBonusPoints(staker, 0);
			console.log('stakerVolume: ' + stakerVolume / 1e18);

			let totalRoundBonusPoints = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(0);
			console.log('totalRoundBonusPoints: ' + totalRoundBonusPoints / 1e18);

			let stakerVaultBaseVolume =
				await StakingThalesBonusRewardsManagerA.userVaultBasePointsPerRound(staker, 0);
			console.log('stakerVaultBaseVolume: ' + stakerVaultBaseVolume / 1e18);

			let totalVaultBasePointsPerRound =
				await StakingThalesBonusRewardsManagerA.totalVaultBasePointsPerRound(0);
			console.log('totalVaultBasePointsPerRound: ' + totalVaultBasePointsPerRound / 1e18);

			await StakingThalesBonusRewardsManagerA.setKnownLiquidityPool(firstLP, true, { from: owner });

			await StakingMockA.updateVolumeWithOrigin(secondStaker, toUnit(10), firstLP, {
				from: owner,
			});

			let secondStakerPoints = await StakingThalesBonusRewardsManagerA.userRoundBonusPoints(
				secondStaker,
				0
			);
			console.log('secondStakerPoints: ' + secondStakerPoints / 1e18);

			totalRoundBonusPoints = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(0);
			console.log('totalRoundBonusPoints: ' + totalRoundBonusPoints / 1e18);

			await StakingThalesBonusRewardsManagerA.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockA.updateVolumeWithOrigin(thirdStaker, toUnit(10), firstAMM, {
				from: owner,
			});

			let thirdStakerPoints = await StakingThalesBonusRewardsManagerA.userRoundBonusPoints(
				thirdStaker,
				0
			);
			console.log('thirdStakerPoints: ' + thirdStakerPoints / 1e18);

			totalRoundBonusPoints = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(0);
			console.log('totalRoundBonusPoints: ' + totalRoundBonusPoints / 1e18);

			await StakingMockA.updateVolumeWithOrigin(secondStaker, toUnit(10), firstAMM, {
				from: owner,
			});

			secondStakerPoints = await StakingThalesBonusRewardsManagerA.userRoundBonusPoints(
				secondStaker,
				0
			);
			console.log('secondStakerPoints: ' + secondStakerPoints / 1e18);

			totalRoundBonusPoints = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(0);
			console.log('totalRoundBonusPoints: ' + totalRoundBonusPoints / 1e18);

			let firstStakerShare = await StakingThalesBonusRewardsManagerA.getUserRoundBonusShare(
				staker,
				0
			);
			console.log('firstStakerShare: ' + firstStakerShare / 1e18);

			let secondStakerShare = await StakingThalesBonusRewardsManagerA.getUserRoundBonusShare(
				secondStaker,
				0
			);
			console.log('secondStakerShare: ' + secondStakerShare / 1e18);

			let thirdStakerShare = await StakingThalesBonusRewardsManagerA.getUserRoundBonusShare(
				thirdStaker,
				0
			);
			console.log('thirdStakerShare: ' + thirdStakerShare / 1e18);

			let thirdStakerRewards = await StakingMockA.getRewards(thirdStaker);
			console.log('thirdStakerRewards: ' + thirdStakerRewards / 1e18);
		});

		it('Use CCIP to close and distribute rewards ', async () => {
			await StakingMockA.stake(toUnit(100000), {
				from: staker,
			});

			await StakingMockA.stake(toUnit(200000), {
				from: secondStaker,
			});

			await StakingMockA.stake(toUnit(700000), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerA.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerA.setMaxStakingMultiplier(toUnit(4), { from: owner });

			await StakingMockB.stake(toUnit(200000), {
				from: staker,
			});

			await StakingMockB.stake(toUnit(100000), {
				from: secondStaker,
			});

			await StakingMockB.stake(toUnit(700000), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerB.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerB.setMaxStakingMultiplier(toUnit(4), { from: owner });
			await CCIPCollectorB.setMasterCollector(CCIPCollectorA.address, 10, 20, { from: owner });
			let masterCollectorInB = await CCIPCollectorB.masterCollector();
			let masterCollectorChainInB = await CCIPCollectorB.masterCollectorChain();
			assert.equal(masterCollectorInB, CCIPCollectorA.address);
			console.log(
				'Master collector in B: ',
				masterCollectorInB,
				' chainId: ',
				masterCollectorChainInB.toString()
			);
			let activeCollectorsInA = await CCIPCollectorA.numOfActiveCollectors();
			console.log('numOfActiveCollectors: ', activeCollectorsInA.toString());
			await CCIPCollectorA.setCollectorForChain(20, CCIPCollectorB.address, 1, { from: owner });
			let localCollectorA = await CCIPCollectorA.localChainSelector();
			console.log('Collector A local selector: ', localCollectorA.toString());
			let masterCollectorChainA = await CCIPCollectorA.masterCollectorChain();
			console.log('Collector A master selector: ', masterCollectorChainA.toString());

			activeCollectorsInA = await CCIPCollectorA.numOfActiveCollectors();
			console.log('numOfActiveCollectors: ', activeCollectorsInA.toString());

			let isMasterCollectorA = await CCIPCollectorA.isMasterCollector();
			console.log('isMasterCollectorA: ', isMasterCollectorA);

			await CCIPCollectorA.setPeriodRewards(toUnit(5000000), toUnit(500000), 0, { from: owner });
			let baseRewardsPerPeriod = await CCIPCollectorA.baseRewardsPerPeriod();
			let extraRewardsPerPeriod = await CCIPCollectorA.extraRewardsPerPeriod();
			console.log('baseRewardsPerPeriod: ', fromUnit(baseRewardsPerPeriod));
			console.log('baseRewardsPerPeriod: ', fromUnit(baseRewardsPerPeriod));
			console.log('baseRewardsPerPeriod: ', fromUnit(baseRewardsPerPeriod));
			console.log('extraRewardsPerPeriod: ', fromUnit(extraRewardsPerPeriod));
			let collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());

			let totalStakedA = await StakingMockA.stakedAmount();
			let totalEscrowedA = await StakingMockA.escrowedAmount();
			let revenueShareA = await StakingMockA.revenueShare();

			let totalStakedB = await StakingMockB.stakedAmount();
			let totalEscrowedB = await StakingMockB.escrowedAmount();
			let revenueShareB = await StakingMockB.revenueShare();
			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));
			console.log('revenueShareA: ', fromUnit(revenueShareA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));
			console.log('revenueShareB: ', fromUnit(revenueShareB));

			await StakingThalesBonusRewardsManagerA.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});
			await StakingThalesBonusRewardsManagerB.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerA.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerA.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockA.updateVolumeWithOrigin(staker, toUnit(10), firstAMM, {
				from: owner,
			});

			await StakingMockA.updateVolumeWithOrigin(secondStaker, toUnit(10), firstLP, {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerB.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerB.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockB.updateVolumeWithOrigin(staker, toUnit(100), firstAMM, {
				from: owner,
			});

			await StakingMockB.updateVolumeWithOrigin(secondStaker, toUnit(100), firstLP, {
				from: owner,
			});

			let roundA = await StakingMockA.round();
			let roundB = await StakingMockB.round();
			let totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			let totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);

			console.log('roundA: ', roundA.toString());
			console.log('totalPointsA: ', fromUnit(totalPointsA));
			console.log('roundB: ', roundB.toString());
			console.log('totalPointsB: ', fromUnit(totalPointsB));

			let pausedA = await StakingMockA.paused();
			let pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			console.log('Closing round \n ----------------');

			await StakingMockA.closePeriod();
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());
			await StakingMockB.closePeriod();
			console.log('CCIP B: ', CCIPCollectorB.address);
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();
			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			let readyToBroadcast = await CCIPCollectorA.readyToBroadcast();
			assert.equal(readyToBroadcast, true);

			console.log('Ready to broadcast update: ', readyToBroadcast);
			console.log('Broadcast messages!');
			let activeCollectors = await CCIPCollectorA.numOfActiveCollectors();
			console.log('numOfActiveCollectors: ', activeCollectors.toString());

			await CCIPCollectorA.broadcastMessageToAll({ from: owner });

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();
			revenueShareA = await StakingMockA.revenueShare();
			let fixedRewardsA = await StakingMockA.fixedRewards();
			let fixedRewardsB = await StakingMockB.fixedRewards();
			let extraRewardsA = await StakingMockA.extraRewards();
			let extraRewardsB = await StakingMockB.extraRewards();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();
			revenueShareB = await StakingMockB.revenueShare();
			totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);
			roundA = await StakingMockA.round();
			roundB = await StakingMockB.round();
			console.log('roundA: ', roundA.toString());
			console.log('roundB: ', roundB.toString());

			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));
			console.log('revenueShareA: ', fromUnit(revenueShareA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));
			console.log('revenueShareB: ', fromUnit(revenueShareB));

			console.log('fixedRewardsA: ', fromUnit(fixedRewardsA));
			console.log('extraRewardsA: ', fromUnit(extraRewardsA));
			console.log('fixedRewardsB: ', fromUnit(fixedRewardsB));
			console.log('extraRewardsB: ', fromUnit(extraRewardsB));
			console.log('totalPointsA: ', fromUnit(totalPointsA));
			console.log('totalPointsB: ', fromUnit(totalPointsB));
			console.log(
				'ratio points: ',
				parseFloat(fromUnit(totalPointsA)) / parseFloat(fromUnit(totalPointsB))
			);
			console.log(
				'ratio extra: ',
				parseFloat(fromUnit(extraRewardsA)) / parseFloat(fromUnit(extraRewardsB))
			);
		});
		it('CCIP: set and check Router', async () => {
			await CCIPCollectorA.setCCIPRouter(CCIPRouter.address, { from: owner });
			assert.equal(await CCIPCollectorA.getRouter(), CCIPRouter.address);
		});
		it('CCIP: set chain selector to 0 and back', async () => {
			await CCIPCollectorA.setCollectorForChain(20, CCIPCollectorB.address, 1, { from: owner });
			await CCIPCollectorA.setCollectorForChain(0, ZERO_ADDRESS, 1, { from: owner });
			await CCIPCollectorA.setCollectorForChain(20, CCIPCollectorB.address, 1, { from: owner });
		});
		it('CCIP: equal rewards distribution', async () => {
			await StakingMockA.stake(toUnit(1000), {
				from: staker,
			});

			await StakingMockA.stake(toUnit(1000), {
				from: secondStaker,
			});

			await StakingMockA.stake(toUnit(1000), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerA.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerA.setMaxStakingMultiplier(toUnit(4), { from: owner });

			await StakingMockB.stake(toUnit(1000), {
				from: staker,
			});

			await StakingMockB.stake(toUnit(1000), {
				from: secondStaker,
			});

			await StakingMockB.stake(toUnit(1000), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerB.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerB.setMaxStakingMultiplier(toUnit(4), { from: owner });
			await CCIPCollectorB.setMasterCollector(CCIPCollectorA.address, 10, 20, { from: owner });
			await CCIPCollectorA.setMasterCollector(CCIPCollectorA.address, 10, 10, { from: owner });
			let masterCollectorInB = await CCIPCollectorB.masterCollector();
			let masterCollectorChainInB = await CCIPCollectorB.masterCollectorChain();
			assert.equal(masterCollectorInB, CCIPCollectorA.address);
			console.log(
				'Master collector in B: ',
				masterCollectorInB,
				' chainId: ',
				masterCollectorChainInB.toString()
			);
			await CCIPCollectorA.setCollectorForChain(20, CCIPCollectorB.address, 1, { from: owner });
			let isMasterCollectorA = await CCIPCollectorA.isMasterCollector();
			console.log('isMasterCollectorA: ', isMasterCollectorA);

			await CCIPCollectorA.setPeriodRewards(toUnit(50000), toUnit(3000), 0, { from: owner });
			let baseRewardsPerPeriod = await CCIPCollectorA.baseRewardsPerPeriod();
			let extraRewardsPerPeriod = await CCIPCollectorA.extraRewardsPerPeriod();
			console.log('baseRewardsPerPeriod: ', fromUnit(baseRewardsPerPeriod));
			console.log('extraRewardsPerPeriod: ', fromUnit(extraRewardsPerPeriod));
			let collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());

			let totalStakedA = await StakingMockA.stakedAmount();
			let totalEscrowedA = await StakingMockA.escrowedAmount();

			let totalStakedB = await StakingMockB.stakedAmount();
			let totalEscrowedB = await StakingMockB.escrowedAmount();
			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));

			await StakingThalesBonusRewardsManagerA.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});
			await StakingThalesBonusRewardsManagerB.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerA.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerA.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockA.updateVolumeWithOrigin(staker, toUnit(10), firstAMM, {
				from: owner,
			});

			await StakingMockA.updateVolumeWithOrigin(secondStaker, toUnit(10), firstLP, {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerB.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerB.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockB.updateVolumeWithOrigin(staker, toUnit(100), firstAMM, {
				from: owner,
			});

			await StakingMockB.updateVolumeWithOrigin(secondStaker, toUnit(100), firstLP, {
				from: owner,
			});

			let roundA = await StakingMockA.round();
			let roundB = await StakingMockB.round();
			let totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			let totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);

			console.log('roundA: ', roundA.toString());
			console.log('totalPointsA: ', fromUnit(totalPointsA));
			console.log('roundB: ', roundB.toString());
			console.log('totalPointsB: ', fromUnit(totalPointsB));

			let pausedA = await StakingMockA.paused();
			let pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			console.log('Closing round \n ----------------');

			await StakingMockA.closePeriod();
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());
			await StakingMockB.closePeriod();
			console.log('CCIP B: ', CCIPCollectorB.address);
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();
			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			let readyToBroadcast = await CCIPCollectorA.readyToBroadcast();
			assert.equal(readyToBroadcast, true);

			console.log('Ready to broadcast update: ', readyToBroadcast);
			console.log('Broadcast messages!');
			let activeCollectors = await CCIPCollectorA.numOfActiveCollectors();
			console.log('numOfActiveCollectors: ', activeCollectors.toString());

			await CCIPCollectorA.broadcastMessageToAll({ from: owner });

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();
			let fixedRewardsA = await StakingMockA.fixedRewards();
			let fixedRewardsB = await StakingMockB.fixedRewards();
			let extraRewardsA = await StakingMockA.extraRewards();
			let extraRewardsB = await StakingMockB.extraRewards();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();
			totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);
			roundA = await StakingMockA.round();
			roundB = await StakingMockB.round();
			console.log('roundA: ', roundA.toString());
			console.log('roundB: ', roundB.toString());

			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));

			console.log('fixedRewardsA: ', fromUnit(fixedRewardsA));
			console.log('extraRewardsA: ', fromUnit(extraRewardsA));
			console.log('fixedRewardsB: ', fromUnit(fixedRewardsB));
			console.log('extraRewardsB: ', fromUnit(extraRewardsB));
			console.log('totalPointsA: ', fromUnit(totalPointsA));
			console.log('totalPointsB: ', fromUnit(totalPointsB));
			console.log(
				'ratio points: ',
				parseFloat(fromUnit(totalPointsA)) / parseFloat(fromUnit(totalPointsB))
			);
			console.log(
				'ratio extra: ',
				parseFloat(fromUnit(extraRewardsA)) / parseFloat(fromUnit(extraRewardsB))
			);

			assert.equal(fromUnit(fixedRewardsA), fromUnit(fixedRewardsB));
			assert.equal(fromUnit(extraRewardsA) * 10, fromUnit(extraRewardsB));
			assert.equal(fromUnit(totalPointsA) * 10, fromUnit(totalPointsB));
			assert.equal(
				parseFloat(fromUnit(totalPointsA)) / parseFloat(fromUnit(totalPointsB)),
				parseFloat(fromUnit(extraRewardsA)) / parseFloat(fromUnit(extraRewardsB))
			);
		});

		it('CCIP: equal rewards distribution', async () => {
			await StakingMockA.stake(toUnit(1000), {
				from: staker,
			});

			await StakingMockA.stake(toUnit(1000), {
				from: secondStaker,
			});

			await StakingMockA.stake(toUnit(1000), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerA.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerA.setMaxStakingMultiplier(toUnit(4), { from: owner });

			await StakingMockB.stake(toUnit(1000), {
				from: staker,
			});

			await StakingMockB.stake(toUnit(1000), {
				from: secondStaker,
			});

			await StakingMockB.stake(toUnit(1000), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerB.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerB.setMaxStakingMultiplier(toUnit(4), { from: owner });
			await CCIPCollectorB.setMasterCollector(CCIPCollectorA.address, 10, 20, { from: owner });
			let masterCollectorInB = await CCIPCollectorB.masterCollector();
			let masterCollectorChainInB = await CCIPCollectorB.masterCollectorChain();
			assert.equal(masterCollectorInB, CCIPCollectorA.address);
			console.log(
				'Master collector in B: ',
				masterCollectorInB,
				' chainId: ',
				masterCollectorChainInB.toString()
			);
			await CCIPCollectorA.setCollectorForChain(20, CCIPCollectorB.address, 1, { from: owner });
			let isMasterCollectorA = await CCIPCollectorA.isMasterCollector();
			console.log('isMasterCollectorA: ', isMasterCollectorA);

			await CCIPCollectorA.setPeriodRewards(toUnit(50000), toUnit(3000), 0, { from: owner });
			let baseRewardsPerPeriod = await CCIPCollectorA.baseRewardsPerPeriod();
			let extraRewardsPerPeriod = await CCIPCollectorA.extraRewardsPerPeriod();
			console.log('baseRewardsPerPeriod: ', fromUnit(baseRewardsPerPeriod));
			console.log('extraRewardsPerPeriod: ', fromUnit(extraRewardsPerPeriod));
			let collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());

			let totalStakedA = await StakingMockA.stakedAmount();
			let totalEscrowedA = await StakingMockA.escrowedAmount();
			let revenueShareA = await StakingMockA.revenueShare();

			let totalStakedB = await StakingMockB.stakedAmount();
			let totalEscrowedB = await StakingMockB.escrowedAmount();
			let revenueShareB = await StakingMockB.revenueShare();
			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));
			console.log('revenueShareA: ', fromUnit(revenueShareA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));
			console.log('revenueShareB: ', fromUnit(revenueShareB));

			await StakingThalesBonusRewardsManagerA.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});
			await StakingThalesBonusRewardsManagerB.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerA.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerA.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockA.updateVolumeWithOrigin(staker, toUnit(10), firstAMM, {
				from: owner,
			});

			await StakingMockA.updateVolumeWithOrigin(secondStaker, toUnit(10), firstLP, {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerB.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerB.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockB.updateVolumeWithOrigin(staker, toUnit(100), firstAMM, {
				from: owner,
			});

			await StakingMockB.updateVolumeWithOrigin(secondStaker, toUnit(100), firstLP, {
				from: owner,
			});

			let roundA = await StakingMockA.round();
			let roundB = await StakingMockB.round();
			let totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			let totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);

			console.log('roundA: ', roundA.toString());
			console.log('totalPointsA: ', fromUnit(totalPointsA));
			console.log('roundB: ', roundB.toString());
			console.log('totalPointsB: ', fromUnit(totalPointsB));

			let pausedA = await StakingMockA.paused();
			let pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			console.log('Closing round \n ----------------');

			await StakingMockA.closePeriod();
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());
			await StakingMockB.closePeriod();
			console.log('CCIP B: ', CCIPCollectorB.address);
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());

			let getChainSelectorForLastMessage = CCIPCollectorA.getChainSelectorForLastMessage();
			console.log('Message from chainSelector: ', getChainSelectorForLastMessage.toString());

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();
			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			let readyToBroadcast = await CCIPCollectorA.readyToBroadcast();
			assert.equal(readyToBroadcast, true);

			console.log('Ready to broadcast update: ', readyToBroadcast);
			console.log('Broadcast messages!');
			let activeCollectors = await CCIPCollectorA.numOfActiveCollectors();
			console.log('numOfActiveCollectors: ', activeCollectors.toString());

			await CCIPCollectorA.broadcastMessageToAll({ from: owner });

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();
			revenueShareA = await StakingMockA.revenueShare();
			let fixedRewardsA = await StakingMockA.fixedRewards();
			let fixedRewardsB = await StakingMockB.fixedRewards();
			let extraRewardsA = await StakingMockA.extraRewards();
			let extraRewardsB = await StakingMockB.extraRewards();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();
			revenueShareB = await StakingMockB.revenueShare();
			totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);
			roundA = await StakingMockA.round();
			roundB = await StakingMockB.round();
			console.log('roundA: ', roundA.toString());
			console.log('roundB: ', roundB.toString());

			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));
			console.log('revenueShareA: ', fromUnit(revenueShareA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));
			console.log('revenueShareB: ', fromUnit(revenueShareB));

			console.log('fixedRewardsA: ', fromUnit(fixedRewardsA));
			console.log('extraRewardsA: ', fromUnit(extraRewardsA));
			console.log('fixedRewardsB: ', fromUnit(fixedRewardsB));
			console.log('extraRewardsB: ', fromUnit(extraRewardsB));
			console.log('totalPointsA: ', fromUnit(totalPointsA));
			console.log('totalPointsB: ', fromUnit(totalPointsB));
			console.log(
				'ratio points: ',
				parseFloat(fromUnit(totalPointsA)) / parseFloat(fromUnit(totalPointsB))
			);
			console.log(
				'ratio extra: ',
				parseFloat(fromUnit(extraRewardsA)) / parseFloat(fromUnit(extraRewardsB))
			);

			assert.equal(fromUnit(fixedRewardsA), fromUnit(fixedRewardsB));
			assert.equal(fromUnit(revenueShareA), fromUnit(revenueShareB));
			assert.equal(fromUnit(extraRewardsA) * 10, fromUnit(extraRewardsB));
			assert.equal(fromUnit(totalPointsA) * 10, fromUnit(totalPointsB));
			assert.equal(
				parseFloat(fromUnit(totalPointsA)) / parseFloat(fromUnit(totalPointsB)),
				parseFloat(fromUnit(extraRewardsA)) / parseFloat(fromUnit(extraRewardsB))
			);
		});

		it('CCIP: non-equal distribution', async () => {
			await StakingMockA.stake(toUnit(300), {
				from: staker,
			});

			await StakingMockA.stake(toUnit(200), {
				from: secondStaker,
			});

			await StakingMockA.stake(toUnit(500), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerA.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerA.setMaxStakingMultiplier(toUnit(4), { from: owner });

			await StakingMockB.stake(toUnit(1000), {
				from: staker,
			});

			await StakingMockB.stake(toUnit(1000), {
				from: secondStaker,
			});

			await StakingMockB.stake(toUnit(1000), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerB.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerB.setMaxStakingMultiplier(toUnit(4), { from: owner });
			await CCIPCollectorB.setMasterCollector(CCIPCollectorA.address, 10, 20, { from: owner });
			let masterCollectorInB = await CCIPCollectorB.masterCollector();
			let masterCollectorChainInB = await CCIPCollectorB.masterCollectorChain();
			assert.equal(masterCollectorInB, CCIPCollectorA.address);
			console.log(
				'Master collector in B: ',
				masterCollectorInB,
				' chainId: ',
				masterCollectorChainInB.toString()
			);
			await CCIPCollectorA.setCollectorForChain(20, CCIPCollectorB.address, 1, { from: owner });
			let isMasterCollectorA = await CCIPCollectorA.isMasterCollector();
			console.log('isMasterCollectorA: ', isMasterCollectorA);

			await CCIPCollectorA.setPeriodRewards(toUnit(50000), toUnit(3000), 0, { from: owner });
			let baseRewardsPerPeriod = await CCIPCollectorA.baseRewardsPerPeriod();
			let extraRewardsPerPeriod = await CCIPCollectorA.extraRewardsPerPeriod();
			console.log('baseRewardsPerPeriod: ', fromUnit(baseRewardsPerPeriod));
			console.log('extraRewardsPerPeriod: ', fromUnit(extraRewardsPerPeriod));
			let collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());

			let totalStakedA = await StakingMockA.stakedAmount();
			let totalEscrowedA = await StakingMockA.escrowedAmount();
			let revenueShareA = await StakingMockA.revenueShare();

			let totalStakedB = await StakingMockB.stakedAmount();
			let totalEscrowedB = await StakingMockB.escrowedAmount();
			let revenueShareB = await StakingMockB.revenueShare();
			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));
			console.log('revenueShareA: ', fromUnit(revenueShareA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));
			console.log('revenueShareB: ', fromUnit(revenueShareB));

			await StakingThalesBonusRewardsManagerA.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});
			await StakingThalesBonusRewardsManagerB.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerA.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerA.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockA.updateVolumeWithOrigin(staker, toUnit(10), firstAMM, {
				from: owner,
			});

			await StakingMockA.updateVolumeWithOrigin(secondStaker, toUnit(10), firstLP, {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerB.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerB.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockB.updateVolumeWithOrigin(staker, toUnit(100), firstAMM, {
				from: owner,
			});

			await StakingMockB.updateVolumeWithOrigin(secondStaker, toUnit(100), firstLP, {
				from: owner,
			});

			let roundA = await StakingMockA.round();
			let roundB = await StakingMockB.round();
			let totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			let totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);

			console.log('roundA: ', roundA.toString());
			console.log('totalPointsA: ', fromUnit(totalPointsA));
			console.log('roundB: ', roundB.toString());
			console.log('totalPointsB: ', fromUnit(totalPointsB));

			let pausedA = await StakingMockA.paused();
			let pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			console.log('Closing round \n ----------------');

			await StakingMockA.closePeriod();
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());
			await StakingMockB.closePeriod();
			console.log('CCIP B: ', CCIPCollectorB.address);
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());

			let getChainSelectorForLastMessage = CCIPCollectorA.getChainSelectorForLastMessage();
			console.log('Message from chainSelector: ', getChainSelectorForLastMessage.toString());

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();
			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			let readyToBroadcast = await CCIPCollectorA.readyToBroadcast();
			assert.equal(readyToBroadcast, true);
			let currentPeriod = await CCIPCollectorA.period();
			let totalRevenueShareForPeriod = await CCIPCollectorA.calculatedRevenueForPeriod(
				currentPeriod.toString()
			);
			console.log('TOTAL REVENUE: ', fromUnit(totalRevenueShareForPeriod));
			console.log('Ready to broadcast update: ', readyToBroadcast);
			console.log('Broadcast messages!');
			let activeCollectors = await CCIPCollectorA.numOfActiveCollectors();
			console.log('numOfActiveCollectors: ', activeCollectors.toString());

			await CCIPCollectorA.broadcastMessageToAll({ from: owner });

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();
			revenueShareA = await StakingMockA.revenueShare();
			let fixedRewardsA = await StakingMockA.fixedRewards();
			let fixedRewardsB = await StakingMockB.fixedRewards();
			let extraRewardsA = await StakingMockA.extraRewards();
			let extraRewardsB = await StakingMockB.extraRewards();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();
			revenueShareB = await StakingMockB.revenueShare();
			totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);
			roundA = await StakingMockA.round();
			roundB = await StakingMockB.round();
			console.log('roundA: ', roundA.toString());
			console.log('roundB: ', roundB.toString());

			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));
			console.log('revenueShareA: ', fromUnit(revenueShareA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));
			console.log('revenueShareB: ', fromUnit(revenueShareB));

			console.log('fixedRewardsA: ', fromUnit(fixedRewardsA));
			console.log('extraRewardsA: ', fromUnit(extraRewardsA));
			console.log('fixedRewardsB: ', fromUnit(fixedRewardsB));
			console.log('extraRewardsB: ', fromUnit(extraRewardsB));
			console.log('totalPointsA: ', fromUnit(totalPointsA));
			console.log('totalPointsB: ', fromUnit(totalPointsB));
			console.log(
				'ratio points: ',
				parseFloat(fromUnit(totalPointsA)) / parseFloat(fromUnit(totalPointsB))
			);
			console.log(
				'ratio extra: ',
				parseFloat(fromUnit(extraRewardsA)) / parseFloat(fromUnit(extraRewardsB))
			);

			assert.equal(3 * fromUnit(fixedRewardsA), fromUnit(fixedRewardsB));
			assert.equal(
				parseInt(fromUnit(revenueShareA)) + parseInt(fromUnit(revenueShareB)),
				parseInt(fromUnit(totalRevenueShareForPeriod))
			);
			assert.equal(3 * fromUnit(revenueShareA), fromUnit(revenueShareB));
			// assert.equal(fromUnit(revenueShareA), fromUnit(revenueShareB));
			// assert.equal(fromUnit(extraRewardsA) * 10, fromUnit(extraRewardsB));
			// assert.equal(fromUnit(totalPointsA) * 10, fromUnit(totalPointsB));
			// assert.equal(
			// 	parseFloat(fromUnit(totalPointsA)) / parseFloat(fromUnit(totalPointsB)),
			// 	parseFloat(fromUnit(extraRewardsA)) / parseFloat(fromUnit(extraRewardsB))
			// );
		});

		it('CCIP: strictly defined distribution, no extra rewards', async () => {
			await StakingMockA.stake(toUnit(200), {
				from: staker,
			});

			await StakingMockA.stake(toUnit(200), {
				from: secondStaker,
			});

			await StakingMockA.stake(toUnit(200), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerA.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerA.setMaxStakingMultiplier(toUnit(4), { from: owner });

			await StakingMockB.stake(toUnit(400), {
				from: staker,
			});

			await StakingMockB.stake(toUnit(400), {
				from: secondStaker,
			});

			await StakingMockB.stake(toUnit(400), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerB.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerB.setMaxStakingMultiplier(toUnit(4), { from: owner });
			await CCIPCollectorB.setMasterCollector(CCIPCollectorA.address, 10, 20, { from: owner });
			let masterCollectorInB = await CCIPCollectorB.masterCollector();
			let masterCollectorChainInB = await CCIPCollectorB.masterCollectorChain();
			assert.equal(masterCollectorInB, CCIPCollectorA.address);
			console.log(
				'Master collector in B: ',
				masterCollectorInB,
				' chainId: ',
				masterCollectorChainInB.toString()
			);
			await CCIPCollectorA.setCollectorForChain(20, CCIPCollectorB.address, 1, { from: owner });
			let isMasterCollectorA = await CCIPCollectorA.isMasterCollector();
			console.log('isMasterCollectorA: ', isMasterCollectorA);

			await CCIPCollectorA.setPeriodRewards(toUnit(40000), 0, 0, { from: owner });
			let baseRewardsPerPeriod = await CCIPCollectorA.baseRewardsPerPeriod();
			let extraRewardsPerPeriod = await CCIPCollectorA.extraRewardsPerPeriod();
			console.log('baseRewardsPerPeriod: ', fromUnit(baseRewardsPerPeriod));
			console.log('extraRewardsPerPeriod: ', fromUnit(extraRewardsPerPeriod));
			let collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());

			let totalStakedA = await StakingMockA.stakedAmount();
			let totalEscrowedA = await StakingMockA.escrowedAmount();
			let revenueShareA = await StakingMockA.revenueShare();

			let totalStakedB = await StakingMockB.stakedAmount();
			let totalEscrowedB = await StakingMockB.escrowedAmount();
			let revenueShareB = await StakingMockB.revenueShare();
			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));
			console.log('revenueShareA: ', fromUnit(revenueShareA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));
			console.log('revenueShareB: ', fromUnit(revenueShareB));

			await StakingThalesBonusRewardsManagerA.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});
			await StakingThalesBonusRewardsManagerB.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerA.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerA.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockA.updateVolumeWithOrigin(staker, toUnit(10), firstAMM, {
				from: owner,
			});

			await StakingMockA.updateVolumeWithOrigin(secondStaker, toUnit(10), firstLP, {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerB.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerB.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockB.updateVolumeWithOrigin(staker, toUnit(100), firstAMM, {
				from: owner,
			});

			await StakingMockB.updateVolumeWithOrigin(secondStaker, toUnit(100), firstLP, {
				from: owner,
			});

			let roundA = await StakingMockA.round();
			let roundB = await StakingMockB.round();
			let totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			let totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);

			console.log('roundA: ', roundA.toString());
			console.log('totalPointsA: ', fromUnit(totalPointsA));
			console.log('roundB: ', roundB.toString());
			console.log('totalPointsB: ', fromUnit(totalPointsB));

			let pausedA = await StakingMockA.paused();
			let pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			console.log('Closing round \n ----------------');

			await StakingMockA.closePeriod();
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());
			await StakingMockB.closePeriod();
			console.log('CCIP B: ', CCIPCollectorB.address);
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());

			let getChainSelectorForLastMessage = CCIPCollectorA.getChainSelectorForLastMessage();
			console.log('Message from chainSelector: ', getChainSelectorForLastMessage.toString());

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();
			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			let readyToBroadcast = await CCIPCollectorA.readyToBroadcast();
			assert.equal(readyToBroadcast, true);
			let currentPeriod = await CCIPCollectorA.period();
			let totalRevenueShareForPeriod = await CCIPCollectorA.calculatedRevenueForPeriod(
				currentPeriod.toString()
			);
			console.log('TOTAL REVENUE: ', fromUnit(totalRevenueShareForPeriod));
			console.log('Ready to broadcast update: ', readyToBroadcast);
			console.log('Broadcast messages!');
			let activeCollectors = await CCIPCollectorA.numOfActiveCollectors();
			console.log('numOfActiveCollectors: ', activeCollectors.toString());

			await CCIPCollectorA.broadcastMessageToAll({ from: owner });

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();
			revenueShareA = await StakingMockA.revenueShare();
			let fixedRewardsA = await StakingMockA.fixedRewards();
			let fixedRewardsB = await StakingMockB.fixedRewards();
			let extraRewardsA = await StakingMockA.extraRewards();
			let extraRewardsB = await StakingMockB.extraRewards();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();
			revenueShareB = await StakingMockB.revenueShare();
			totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);
			roundA = await StakingMockA.round();
			roundB = await StakingMockB.round();
			console.log('roundA: ', roundA.toString());
			console.log('roundB: ', roundB.toString());

			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));
			console.log('revenueShareA: ', fromUnit(revenueShareA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));
			console.log('revenueShareB: ', fromUnit(revenueShareB));

			console.log('fixedRewardsA: ', fromUnit(fixedRewardsA));
			console.log('extraRewardsA: ', fromUnit(extraRewardsA));
			console.log('fixedRewardsB: ', fromUnit(fixedRewardsB));
			console.log('extraRewardsB: ', fromUnit(extraRewardsB));
			console.log('totalPointsA: ', fromUnit(totalPointsA));
			console.log('totalPointsB: ', fromUnit(totalPointsB));
			console.log(
				'ratio points: ',
				parseFloat(fromUnit(totalPointsA)) / parseFloat(fromUnit(totalPointsB))
			);
			console.log('ratio extra: ', 1);

			assert.equal(2 * fromUnit(fixedRewardsA), fromUnit(fixedRewardsB));
			assert.equal(
				parseInt(fromUnit(revenueShareA)) + parseInt(fromUnit(revenueShareB)),
				parseInt(fromUnit(totalRevenueShareForPeriod))
			);
			assert.equal(2 * fromUnit(revenueShareA), fromUnit(revenueShareB));
			// assert.equal(fromUnit(revenueShareA), fromUnit(revenueShareB));
			// assert.equal(fromUnit(extraRewardsA) * 10, fromUnit(extraRewardsB));
			// assert.equal(fromUnit(totalPointsA) * 10, fromUnit(totalPointsB));
			// assert.equal(
			// 	parseFloat(fromUnit(totalPointsA)) / parseFloat(fromUnit(totalPointsB)),
			// 	parseFloat(fromUnit(extraRewardsA)) / parseFloat(fromUnit(extraRewardsB))
			// );
		});

		it('CCIP: weekly decrease', async () => {
			await StakingMockA.stake(toUnit(300), {
				from: staker,
			});

			await StakingMockA.stake(toUnit(200), {
				from: secondStaker,
			});

			await StakingMockA.stake(toUnit(500), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerA.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerA.setMaxStakingMultiplier(toUnit(4), { from: owner });

			await StakingMockB.stake(toUnit(1000), {
				from: staker,
			});

			await StakingMockB.stake(toUnit(1000), {
				from: secondStaker,
			});

			await StakingMockB.stake(toUnit(1000), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerB.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerB.setMaxStakingMultiplier(toUnit(4), { from: owner });
			await CCIPCollectorB.setMasterCollector(CCIPCollectorA.address, 10, 20, { from: owner });
			let masterCollectorInB = await CCIPCollectorB.masterCollector();
			let masterCollectorChainInB = await CCIPCollectorB.masterCollectorChain();
			assert.equal(masterCollectorInB, CCIPCollectorA.address);
			console.log(
				'Master collector in B: ',
				masterCollectorInB,
				' chainId: ',
				masterCollectorChainInB.toString()
			);
			await CCIPCollectorA.setCollectorForChain(20, CCIPCollectorB.address, 1, { from: owner });
			let isMasterCollectorA = await CCIPCollectorA.isMasterCollector();
			console.log('isMasterCollectorA: ', isMasterCollectorA);

			await CCIPCollectorA.setPeriodRewards(toUnit(50000), toUnit(3000), toUnit(0.9), {
				from: owner,
			});
			let baseRewardsPerPeriod = await CCIPCollectorA.baseRewardsPerPeriod();
			let extraRewardsPerPeriod = await CCIPCollectorA.extraRewardsPerPeriod();
			console.log('baseRewardsPerPeriod: ', fromUnit(baseRewardsPerPeriod));
			console.log('extraRewardsPerPeriod: ', fromUnit(extraRewardsPerPeriod));
			let collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());

			let totalStakedA = await StakingMockA.stakedAmount();
			let totalEscrowedA = await StakingMockA.escrowedAmount();
			let revenueShareA = await StakingMockA.revenueShare();

			let totalStakedB = await StakingMockB.stakedAmount();
			let totalEscrowedB = await StakingMockB.escrowedAmount();
			let revenueShareB = await StakingMockB.revenueShare();
			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));
			console.log('revenueShareA: ', fromUnit(revenueShareA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));
			console.log('revenueShareB: ', fromUnit(revenueShareB));

			await StakingThalesBonusRewardsManagerA.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});
			await StakingThalesBonusRewardsManagerB.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerA.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerA.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockA.updateVolumeWithOrigin(staker, toUnit(10), firstAMM, {
				from: owner,
			});

			await StakingMockA.updateVolumeWithOrigin(secondStaker, toUnit(10), firstLP, {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerB.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerB.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockB.updateVolumeWithOrigin(staker, toUnit(100), firstAMM, {
				from: owner,
			});

			await StakingMockB.updateVolumeWithOrigin(secondStaker, toUnit(100), firstLP, {
				from: owner,
			});

			let roundA = await StakingMockA.round();
			let roundB = await StakingMockB.round();
			let totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			let totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);

			console.log('roundA: ', roundA.toString());
			console.log('totalPointsA: ', fromUnit(totalPointsA));
			console.log('roundB: ', roundB.toString());
			console.log('totalPointsB: ', fromUnit(totalPointsB));

			let pausedA = await StakingMockA.paused();
			let pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			console.log('Closing round \n ----------------');

			await StakingMockA.closePeriod();
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());
			await StakingMockB.closePeriod();
			console.log('CCIP B: ', CCIPCollectorB.address);
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			console.log('collectedResults in period: ', collectedResults.toString());

			let getChainSelectorForLastMessage = CCIPCollectorA.getChainSelectorForLastMessage();
			console.log('Message from chainSelector: ', getChainSelectorForLastMessage.toString());

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();
			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			let readyToBroadcast = await CCIPCollectorA.readyToBroadcast();
			assert.equal(readyToBroadcast, true);
			let currentPeriod = await CCIPCollectorA.period();
			let totalRevenueShareForPeriod = await CCIPCollectorA.calculatedRevenueForPeriod(
				currentPeriod.toString()
			);
			console.log('TOTAL REVENUE: ', fromUnit(totalRevenueShareForPeriod));
			console.log('Ready to broadcast update: ', readyToBroadcast);
			console.log('Broadcast messages!');
			let activeCollectors = await CCIPCollectorA.numOfActiveCollectors();
			console.log('numOfActiveCollectors: ', activeCollectors.toString());

			await CCIPCollectorA.broadcastMessageToAll({ from: owner });
			let oldBaseRewards = baseRewardsPerPeriod;
			let oldextraRewards = extraRewardsPerPeriod;
			baseRewardsPerPeriod = await CCIPCollectorA.baseRewardsPerPeriod();
			extraRewardsPerPeriod = await CCIPCollectorA.extraRewardsPerPeriod();

			console.log('oldBaseRewards: ', fromUnit(oldBaseRewards));
			console.log('baseRewards: ', fromUnit(baseRewardsPerPeriod));
			console.log('oldExtraRewards: ', fromUnit(oldextraRewards));
			console.log('extraRewards: ', fromUnit(extraRewardsPerPeriod));
			assert.equal(
				parseFloat(fromUnit(baseRewardsPerPeriod)) / parseFloat(fromUnit(oldBaseRewards)),
				0.9
			);
			assert.equal(
				parseFloat(fromUnit(extraRewardsPerPeriod)) / parseFloat(fromUnit(oldextraRewards)),
				0.9
			);

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();
			revenueShareA = await StakingMockA.revenueShare();
			let fixedRewardsA = await StakingMockA.fixedRewards();
			let fixedRewardsB = await StakingMockB.fixedRewards();
			let extraRewardsA = await StakingMockA.extraRewards();
			let extraRewardsB = await StakingMockB.extraRewards();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();
			revenueShareB = await StakingMockB.revenueShare();
			totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);
			roundA = await StakingMockA.round();
			roundB = await StakingMockB.round();
			console.log('roundA: ', roundA.toString());
			console.log('roundB: ', roundB.toString());

			console.log('totalStakedA: ', fromUnit(totalStakedA));
			console.log('totalEscrowedA: ', fromUnit(totalEscrowedA));
			console.log('revenueShareA: ', fromUnit(revenueShareA));

			console.log('totalStakedB: ', fromUnit(totalStakedB));
			console.log('totalEscrowedB: ', fromUnit(totalEscrowedB));
			console.log('revenueShareB: ', fromUnit(revenueShareB));

			console.log('fixedRewardsA: ', fromUnit(fixedRewardsA));
			console.log('extraRewardsA: ', fromUnit(extraRewardsA));
			console.log('fixedRewardsB: ', fromUnit(fixedRewardsB));
			console.log('extraRewardsB: ', fromUnit(extraRewardsB));
			console.log('totalPointsA: ', fromUnit(totalPointsA));
			console.log('totalPointsB: ', fromUnit(totalPointsB));
			console.log(
				'ratio points: ',
				parseFloat(fromUnit(totalPointsA)) / parseFloat(fromUnit(totalPointsB))
			);
			console.log(
				'ratio extra: ',
				parseFloat(fromUnit(extraRewardsA)) / parseFloat(fromUnit(extraRewardsB))
			);

			assert.equal(3 * fromUnit(fixedRewardsA), fromUnit(fixedRewardsB));
			assert.equal(
				parseInt(fromUnit(revenueShareA)) + parseInt(fromUnit(revenueShareB)),
				parseInt(fromUnit(totalRevenueShareForPeriod))
			);
			assert.equal(3 * fromUnit(revenueShareA), fromUnit(revenueShareB));
			// assert.equal(fromUnit(revenueShareA), fromUnit(revenueShareB));
			// assert.equal(fromUnit(extraRewardsA) * 10, fromUnit(extraRewardsB));
			// assert.equal(fromUnit(totalPointsA) * 10, fromUnit(totalPointsB));
			// assert.equal(
			// 	parseFloat(fromUnit(totalPointsA)) / parseFloat(fromUnit(totalPointsB)),
			// 	parseFloat(fromUnit(extraRewardsA)) / parseFloat(fromUnit(extraRewardsB))
			// );
		});

		it('CCIP: reset all data', async () => {
			await StakingMockA.stake(toUnit(300), {
				from: staker,
			});

			await StakingMockA.stake(toUnit(200), {
				from: secondStaker,
			});

			await StakingMockA.stake(toUnit(500), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerA.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerA.setMaxStakingMultiplier(toUnit(4), { from: owner });

			await StakingMockB.stake(toUnit(1000), {
				from: staker,
			});

			await StakingMockB.stake(toUnit(1000), {
				from: secondStaker,
			});

			await StakingMockB.stake(toUnit(1000), {
				from: thirdStaker,
			});

			await StakingThalesBonusRewardsManagerB.setStakingBaseDivider(100000, { from: owner });
			await StakingThalesBonusRewardsManagerB.setMaxStakingMultiplier(toUnit(4), { from: owner });
			await CCIPCollectorB.setMasterCollector(CCIPCollectorA.address, 10, 20, { from: owner });
			let masterCollectorInB = await CCIPCollectorB.masterCollector();
			let masterCollectorChainInB = await CCIPCollectorB.masterCollectorChain();
			assert.equal(masterCollectorInB, CCIPCollectorA.address);
			console.log(
				'Master collector in B: ',
				masterCollectorInB,
				' chainId: ',
				masterCollectorChainInB.toString()
			);
			await CCIPCollectorA.setCollectorForChain(20, CCIPCollectorB.address, 1, { from: owner });
			let isMasterCollectorA = await CCIPCollectorA.isMasterCollector();
			assert.equal(isMasterCollectorA, true);
			await CCIPCollectorA.setPeriodRewards(toUnit(50000), toUnit(3000), toUnit(0.9), {
				from: owner,
			});
			let baseRewardsPerPeriod = await CCIPCollectorA.baseRewardsPerPeriod();
			let extraRewardsPerPeriod = await CCIPCollectorA.extraRewardsPerPeriod();
			let collectedResults = await CCIPCollectorA.collectedResultsForPeriod();

			let totalStakedA = await StakingMockA.stakedAmount();
			let totalEscrowedA = await StakingMockA.escrowedAmount();
			let revenueShareA = await StakingMockA.revenueShare();

			let totalStakedB = await StakingMockB.stakedAmount();
			let totalEscrowedB = await StakingMockB.escrowedAmount();
			let revenueShareB = await StakingMockB.revenueShare();

			await StakingThalesBonusRewardsManagerA.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});
			await StakingThalesBonusRewardsManagerB.setMultipliers(toUnit(0.25), toUnit(0.5), toUnit(1), {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerA.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerA.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockA.updateVolumeWithOrigin(staker, toUnit(10), firstAMM, {
				from: owner,
			});

			await StakingMockA.updateVolumeWithOrigin(secondStaker, toUnit(10), firstLP, {
				from: owner,
			});

			await StakingThalesBonusRewardsManagerB.setKnownLiquidityPool(firstLP, true, { from: owner });
			await StakingThalesBonusRewardsManagerB.setKnownTradingAMM(firstAMM, true, { from: owner });

			await StakingMockB.updateVolumeWithOrigin(staker, toUnit(100), firstAMM, {
				from: owner,
			});

			await StakingMockB.updateVolumeWithOrigin(secondStaker, toUnit(100), firstLP, {
				from: owner,
			});

			let roundA = await StakingMockA.round();
			let roundB = await StakingMockB.round();
			let totalPointsA = await StakingThalesBonusRewardsManagerA.totalRoundBonusPoints(roundA);
			let totalPointsB = await StakingThalesBonusRewardsManagerB.totalRoundBonusPoints(roundB);

			let pausedA = await StakingMockA.paused();
			let pausedB = await StakingMockB.paused();
			console.log('pausedA: ', pausedA);
			console.log('pausedB: ', pausedB);

			console.log('Closing round \n ----------------');

			await StakingMockA.closePeriod();
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();
			await StakingMockB.closePeriod();
			collectedResults = await CCIPCollectorA.collectedResultsForPeriod();

			let getChainSelectorForLastMessage = CCIPCollectorA.getChainSelectorForLastMessage();

			totalStakedA = await StakingMockA.stakedAmount();
			totalEscrowedA = await StakingMockA.escrowedAmount();

			totalStakedB = await StakingMockB.stakedAmount();
			totalEscrowedB = await StakingMockB.escrowedAmount();

			pausedA = await StakingMockA.paused();
			pausedB = await StakingMockB.paused();

			let readyToBroadcast = await CCIPCollectorA.readyToBroadcast();
			assert.equal(readyToBroadcast, true);
			let currentPeriod = await CCIPCollectorA.period();
			let totalRevenueShareForPeriod = await CCIPCollectorA.calculatedRevenueForPeriod(
				currentPeriod.toString()
			);
			let activeCollectors = await CCIPCollectorA.numOfActiveCollectors();
			console.log('Active collectors: ', activeCollectors.toString());
			await CCIPCollectorA.resetAllData({ from: owner });
			activeCollectors = await CCIPCollectorA.numOfActiveCollectors();
			assert.equal(activeCollectors.toString(), '0');
			activeCollectors = await CCIPCollectorA.baseRewardsPerPeriod();
			assert.equal(activeCollectors.toString(), '0');
			activeCollectors = await CCIPCollectorA.period();
			assert.equal(activeCollectors.toString(), '0');
			activeCollectors = await CCIPCollectorA.masterCollectorChain();
			assert.equal(activeCollectors.toString(), '0');
			activeCollectors = await CCIPCollectorA.collectedResultsForPeriod();
			assert.equal(activeCollectors.toString(), '0');
		});
	});
});
