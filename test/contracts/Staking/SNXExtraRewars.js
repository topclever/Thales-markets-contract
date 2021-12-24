'use strict';

const { artifacts, contract, web3, ethers } = require('hardhat');
const { toBN, fromBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('../../utils/common');

const { toBytes32 } = require('../../../index');
const { expect } = require('chai');
const { toDecimal, toWei, fromWei } = require('web3-utils');
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
    
    let owner, firstSigner, secondSigner;
	let ThalesDeployed,
		ThalesFeeDeployed,
		StakingThalesDeployed,
		EscrowThalesDeployed,
		OngoingAirdropDeployed,
		SNXRewardsDeployed,
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
        // console.log("num Signers: ", signers.length);
        [owner, firstSigner, secondSigner] = signers;

		let Thales = artifacts.require('Thales');
        let EscrowThales = await ethers.getContractFactory('EscrowThales');
        let StakingThales = await ethers.getContractFactory('StakingThales');
        let OngoingAirdrop = artifacts.require('OngoingAirdrop');
        let SNXRewards = artifacts.require('SNXRewards');
        let OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
        ThalesDeployed = await Thales.new({ from: owner.address });
        ThalesFeeDeployed = await Thales.new({ from: owner.address });
		SNXRewardsDeployed = await SNXRewards.new();
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
            WEEK,
			SNXRewardsDeployed.address
        ]); 
       

		await SNXRewardsDeployed.setTotalRewards(toWei('0'));
		await StakingThalesDeployed.connect(owner).setDistributeFeesEnabled(true);
		await StakingThalesDeployed.connect(owner).setClaimEnabled(true);
		await StakingThalesDeployed.connect(owner).setFixedPeriodReward(100000);
	});

	

	describe('Vesting:', () => {
        it('Staking & vesting with 2 users', async () => {

            let stake = [1500, 1500];
			let users = [firstSigner, secondSigner];
			let weeks = 11;
            let deposit = 55

			await StakingThalesDeployed.connect(owner).setFixedPeriodReward(toWei(deposit.toString(), "ether"));
			await EscrowThalesDeployed.connect(owner).setStakingThalesContract(StakingThalesDeployed.address);
			await sUSDSynth.issue(initialCreator, toWei((deposit*weeks).toString(), "ether"));
			await sUSDSynth.transfer(StakingThalesDeployed.address, toWei((deposit*weeks).toString(), "ether"), {
				from: initialCreator,
			});
			await ThalesDeployed.transfer(StakingThalesDeployed.address, toWei((deposit*weeks).toString(), "ether"), {
				from: owner.address,
			});
			await StakingThalesDeployed.connect(owner).startStakingPeriod();
			for (let i = 0; i < users.length; i++) {
				await ThalesDeployed.transfer(users[i].address, toWei(stake[i].toString(), "ether"), { from: owner.address });
				await ThalesDeployed.approve(StakingThalesDeployed.address, toWei(stake[i].toString(), "ether"), { from: users[i].address });
				await StakingThalesDeployed.connect(users[i]).stake(toWei(stake[i].toString(), "ether"));
			}
			let period = 0;
			while (period < weeks) {
				await fastForward(WEEK + SECOND);
				await StakingThalesDeployed.connect(secondSigner).closePeriod();
				for (let i = 0; i < users.length; i++) {
					await StakingThalesDeployed.connect(users[i]).claimReward();
				}
				period++;
			}
			await fastForward(WEEK + SECOND);
			await StakingThalesDeployed.connect(secondSigner).closePeriod();
			for (let i = 0; i < users.length; i++) {
				let answer = await EscrowThalesDeployed.connect(users[i]).claimable(users[i].address);
				assert.bnEqual(answer, toWei((deposit/users.length).toString(),"ether"));
				await EscrowThalesDeployed.connect(users[i]).vest(toWei((deposit/users.length).toString(),"ether"));
				answer = await ThalesDeployed.balanceOf(users[i].address);
				assert.bnEqual(answer, toWei((deposit/users.length).toString(),"ether"));
			}
		});
    });

	describe('Without SNX rewards :', () => {
		beforeEach(async () => {
			await SNXRewardsDeployed.setTotalRewards(toWei('0', 'ether'));
			await SNXRewardsDeployed.setTotalFees(toWei('0', 'ether'));
			await SNXRewardsDeployed.setRewards(toWei('0', 'ether'));
			await SNXRewardsDeployed.setFees(toWei('0', 'ether'));
			
		});
		it('Staking & claimable with 1 user SNX staker, other not', async () => {

            let stake = [1500, 1500];
			let users = [firstSigner, secondSigner];
			let weeks = 11;
            let deposit = 100;
			let answer;

			await StakingThalesDeployed.connect(owner).setFixedPeriodReward(toWei(deposit.toString(), "ether"));
			await EscrowThalesDeployed.connect(owner).setStakingThalesContract(StakingThalesDeployed.address);
			await sUSDSynth.issue(initialCreator, toWei((deposit*weeks).toString(), "ether"));
			await sUSDSynth.transfer(StakingThalesDeployed.address, toWei((deposit*weeks).toString(), "ether"), {
				from: initialCreator,
			});
			await ThalesDeployed.transfer(StakingThalesDeployed.address, toWei((deposit*weeks).toString(), "ether"), {
				from: owner.address,
			});
			await StakingThalesDeployed.connect(owner).startStakingPeriod();
			for (let i = 0; i < users.length; i++) {
				await ThalesDeployed.transfer(users[i].address, toWei(stake[i].toString(), "ether"), { from: owner.address });
				await ThalesDeployed.approve(StakingThalesDeployed.address, toWei(stake[i].toString(), "ether"), { from: users[i].address });
				await StakingThalesDeployed.connect(users[i]).stake(toWei(stake[i].toString(), "ether"));
			}

			await fastForward(WEEK + SECOND);
			answer = await StakingThalesDeployed.connect(firstSigner).totalSNXRewardsInPeriod();
			console.log("TotalRewards in period: ", answer.toString());
			answer = await SNXRewardsDeployed.totalRewardsAvailable();
			console.log("TotalRewards from SNX in period: ", answer.toString());
			await StakingThalesDeployed.connect(secondSigner).closePeriod();
			await SNXRewardsDeployed.setRewards(toWei('0', 'ether'));
			answer = await SNXRewardsDeployed.feesAvailable(firstSigner.address);
			console.log("Rewards: ", answer[1].toString());
			answer = await StakingThalesDeployed.connect(firstSigner).totalSNXRewardsInPeriod();
			console.log("TotalRewards in period: ", answer.toString());
			answer = await SNXRewardsDeployed.totalRewardsAvailable();
			console.log("TotalRewards from SNX in period: ", answer.toString());

			answer = await StakingThalesDeployed.connect(firstSigner).getRewardsAvailable(firstSigner.address);
			console.log("User 1 claimable: ", answer.toString());
			
			await SNXRewardsDeployed.setRewards(toWei('50', 'ether'));
			answer = await SNXRewardsDeployed.feesAvailable(firstSigner.address);
			console.log("Rewards: ", answer[1].toString())
			answer = await StakingThalesDeployed.connect(secondSigner).getRewardsAvailable(secondSigner.address);
			console.log("User 2 claimable: ", answer.toString());

		});
	
	});
	describe('With SNX rewards :', () => {
		
		beforeEach(async () => {
			await SNXRewardsDeployed.setTotalRewards(toWei('20', 'ether'));
			await SNXRewardsDeployed.setTotalFees(toWei('20', 'ether'));
			await SNXRewardsDeployed.setRewards(toWei('0', 'ether'));
			await SNXRewardsDeployed.setFees(toWei('0', 'ether'));
			
		});
		it('Staking & claimable with 1 user SNX staker, other not', async () => {

            let stake = [1500, 1500];
			let users = [firstSigner, secondSigner];
			let weeks = 11;
            let deposit = 100;
			let answer;

			await StakingThalesDeployed.connect(owner).setFixedPeriodReward(toWei(deposit.toString(), "ether"));
			await EscrowThalesDeployed.connect(owner).setStakingThalesContract(StakingThalesDeployed.address);
			await sUSDSynth.issue(initialCreator, toWei((deposit*weeks).toString(), "ether"));
			await sUSDSynth.transfer(StakingThalesDeployed.address, toWei((deposit*weeks).toString(), "ether"), {
				from: initialCreator,
			});
			await ThalesDeployed.transfer(StakingThalesDeployed.address, toWei((deposit*weeks).toString(), "ether"), {
				from: owner.address,
			});
			await StakingThalesDeployed.connect(owner).startStakingPeriod();
			for (let i = 0; i < users.length; i++) {
				await ThalesDeployed.transfer(users[i].address, toWei(stake[i].toString(), "ether"), { from: owner.address });
				await ThalesDeployed.approve(StakingThalesDeployed.address, toWei(stake[i].toString(), "ether"), { from: users[i].address });
				await StakingThalesDeployed.connect(users[i]).stake(toWei(stake[i].toString(), "ether"));
			}

			await fastForward(WEEK + SECOND);
			answer = await StakingThalesDeployed.connect(firstSigner).totalSNXRewardsInPeriod();
			console.log("TotalRewards in period: ", answer.toString());
			answer = await SNXRewardsDeployed.totalRewardsAvailable();
			console.log("TotalRewards from SNX in period: ", answer.toString());
			await StakingThalesDeployed.connect(secondSigner).closePeriod();
			await SNXRewardsDeployed.setRewards(toWei('0', 'ether'));
			answer = await SNXRewardsDeployed.feesAvailable(firstSigner.address);
			console.log("Rewards: ", answer[1].toString());
			answer = await StakingThalesDeployed.connect(firstSigner).totalSNXRewardsInPeriod();
			console.log("TotalRewards in period: ", answer.toString());
			answer = await SNXRewardsDeployed.totalRewardsAvailable();
			console.log("TotalRewards from SNX in period: ", answer.toString());

			answer = await StakingThalesDeployed.connect(firstSigner).getRewardsAvailable(firstSigner.address);
			console.log("User 1 claimable: ", answer.toString());
			
			await SNXRewardsDeployed.setRewards(toWei('1', 'ether'));
			answer = await SNXRewardsDeployed.feesAvailable(firstSigner.address);
			console.log("Rewards: ", answer[1].toString())
			answer = await StakingThalesDeployed.connect(secondSigner).getRewardsAvailable(secondSigner.address);
			console.log("User 2 claimable: ", answer.toString());

		});
	
	});
});
