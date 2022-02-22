'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert } = require('../../utils/common');

const { currentTime, toUnit, fastForward, bytesToString } = require('../../utils')();

const {
	onlyGivenAddressCanInvoke,
	convertToDecimals,
	encodeCall,
	assertRevert,
} = require('../../utils/helpers');

const { expect } = require('chai');

const SECOND = 1000;
const DAY = 86400;
const WEEK = 604800;
const YEAR = 31556926;

const ZERO_ADDRESS = '0x' + '0'.repeat(40);
const MAX_NUMBER = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

const ExoticPositionalMarketContract = artifacts.require('ExoticPositionalMarket');
const ExoticPositionalMarketManagerContract = artifacts.require('ExoticPositionalMarketManager');
const ThalesOracleCouncilContract = artifacts.require('ThalesOracleCouncil');
const ThalesContract = artifacts.require('contracts/Token/OpThales_L1.sol:OpThales');
let ExoticPositionalMarket;
let ExoticPositionalMarketManager;
let ThalesOracleCouncil;
let Thales;
let answer;
let minimumPositioningDuration = 0;
let minimumMarketMaturityDuration = 0;

let marketQuestion,
	endOfPositioning,
	fixedTicketPrice,
	withdrawalFeePercentage,
	tag,
	paymentToken,
	phrases = [],
	deployedMarket,
	outcomePosition;

contract('Exotic Positional market', async accounts => {
	const [manager, owner, userOne, userTwo, dummyContractAddress] = accounts;
	let initializeData;
	beforeEach(async () => {
		ExoticPositionalMarket = await ExoticPositionalMarketContract.new();
		ExoticPositionalMarketManager = await ExoticPositionalMarketManagerContract.new();
		ThalesOracleCouncil = await ThalesOracleCouncilContract.new();
		Thales = await ThalesContract.new({ from: owner });
		await ExoticPositionalMarketManager.initialize(
			manager,
			minimumPositioningDuration,
			ExoticPositionalMarket.address,
			{ from: manager }
		);
		await ExoticPositionalMarketManager.setOracleCouncilAddress(ThalesOracleCouncil.address);
		await Thales.transfer(userOne, toUnit('1000'), { from: owner });
		await Thales.transfer(userTwo, toUnit('1000'), { from: owner });
	});

	describe('initial deploy', function() {
		it('deployed', async function() {
			assert.notEqual(ExoticPositionalMarket.address, ZERO_ADDRESS);
		});
	});

	describe('create Exotic market', function() {
		beforeEach(async () => {
			const timestamp = await currentTime();
			marketQuestion = 'Who will win the el clasico which will be played on 2022-02-22?';
			endOfPositioning = (timestamp + DAY).toString();
			fixedTicketPrice = toUnit('10');
			withdrawalFeePercentage = '5';
			tag = [1, 2, 3];
			paymentToken = Thales.address;
			phrases = ['Real Madrid', 'FC Barcelona', 'It will be a draw'];
			outcomePosition = '1';

			answer = await ExoticPositionalMarketManager.createExoticMarket(
				marketQuestion,
				endOfPositioning,
				fixedTicketPrice,
				withdrawalFeePercentage,
				tag,
				paymentToken,
				phrases,
				{ from: owner }
			);

			answer = await ExoticPositionalMarketManager.getActiveMarketAddress('0');
			deployedMarket = await ExoticPositionalMarketContract.at(answer);
		});
		it('new market', async function() {
			answer = await ExoticPositionalMarketManager.numOfActiveMarkets();
			assert.equal(answer, '1');
		});

		it('new market is active?', async function() {
			answer = await ExoticPositionalMarketManager.isActiveMarket(deployedMarket.address);
			// console.log('Market address: ', deployedMarket.address);
			assert.equal(answer, true);
			answer = await deployedMarket.endOfPositioning();
			assert.equal(answer.toString(), endOfPositioning);
		});

		it('manager owner', async function() {
			answer = await ExoticPositionalMarketManager.owner();
			assert.equal(answer.toString(), manager);
		});

		it('manager is the market owner', async function() {
			answer = await deployedMarket.owner();
			assert.equal(answer.toString(), ExoticPositionalMarketManager.address);
		});

		it('creator address match', async function() {
			answer = await deployedMarket.creatorAddress();
			assert.equal(answer.toString(), owner);
		});

		it('can position', async function() {
			answer = await deployedMarket.canUsersPlacePosition();
			assert.equal(answer, true);
		});

		it('tags match', async function() {
			answer = await deployedMarket.getTagCount();
			assert.equal(answer.toString(), tag.length.toString());
			for (let i = 0; i < tag.length; i++) {
				answer = await deployedMarket.tag(i.toString());
				assert.equal(answer.toString(), tag[i].toString());
			}
		});

		it('can not resolve', async function() {
			answer = await deployedMarket.canMarketBeResolved();
			assert.equal(answer, false);
		});

		it('can resolve', async function() {
			await fastForward(DAY + SECOND);
			answer = await deployedMarket.canMarketBeResolved();
			assert.equal(answer, true);
		});
		describe('position and resolve', function() {
			beforeEach(async () => {
				answer = await Thales.increaseAllowance(deployedMarket.address, toUnit('100'), {
					from: userOne,
				});
			});

			describe('userOne takes position', async function() {
				beforeEach(async () => {
					answer = await deployedMarket.takeAPosition(outcomePosition, { from: userOne });
				});
				it('1 ticket holder', async function() {
					answer = await deployedMarket.totalTicketHolders();
					assert.equal(answer, outcomePosition);
				});
				it('ticket holder position match', async function() {
					answer = await deployedMarket.getTicketHolderPosition(userOne);
					assert.equal(answer.toString(), outcomePosition);
				});
				it('ticket holder position phrase match', async function() {
					answer = await deployedMarket.getTicketHolderPositionPhrase(userOne);
					// console.log("Position phrase: ", answer.toString());
					assert.equal(answer.toString(), phrases[0]);
				});

				describe('resolve with ticket holder result', async function() {
					beforeEach(async () => {
						await fastForward(DAY + SECOND);
					});

					it('winning position is 0, not resolved', async function() {
						answer = await deployedMarket.winningPosition();
						assert.equal(answer, '0');
					});

					it('market resolved', async function() {
						answer = await ExoticPositionalMarketManager.resolveMarket(
							deployedMarket.address,
							'1',
							{ from: owner }
						);
						answer = await deployedMarket.resolved();
						assert.equal(answer, true);
					});

					it('winning position match outcome position', async function() {
						answer = await ExoticPositionalMarketManager.resolveMarket(
							deployedMarket.address,
							outcomePosition,
							{ from: owner }
						);
						answer = await deployedMarket.winningPosition();
						assert.equal(answer.toString(), outcomePosition);
					});

					describe('market finalization', async function() {
						beforeEach(async () => {
							answer = await ExoticPositionalMarketManager.resolveMarket(
								deployedMarket.address,
								outcomePosition,
								{ from: owner }
							);
						});
						it('ticket holders can not claim', async function() {
							answer = await deployedMarket.canHoldersClaim();
							assert.equal(answer, false);
						});
						it('ticket holders can claim', async function() {
							await fastForward(DAY + SECOND);
							answer = await deployedMarket.canHoldersClaim();
							assert.equal(answer, true);
						});

						describe('claiming reward funds (3% total fees)', async function() {
							beforeEach(async () => {
								await fastForward(DAY + SECOND);
							});
							it('claimable amount', async function() {
								answer = await deployedMarket.getTicketHolderClaimableAmount(userOne);
								let result = parseFloat(fixedTicketPrice.toString()) * 0.97;
								assert.equal(answer.toString(), result.toString());
							});
							it('claimed amount match', async function() {
								let result = await Thales.balanceOf(userOne);
								result =
									parseFloat(result.toString()) + parseFloat(fixedTicketPrice.toString()) * 0.97;
								await deployedMarket.claimWinningTicket({ from: userOne });
								answer = await Thales.balanceOf(userOne);
								assert.equal(answer.toString(), result.toString());
							});
						});
					});
				});
			});
		});
	});
});
