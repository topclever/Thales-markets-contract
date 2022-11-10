'use strict';

const { artifacts, contract } = require('hardhat');

const w3utils = require('web3-utils');

const { assert } = require('../../utils/common');

const { toUnit } = require('../../utils')();

const { toBytes32 } = require('../../../index');

contract('TherundownConsumerWrapper', (accounts) => {
	const [first, owner, second, third] = accounts;
	let TherundownConsumerWrapper;
	let TherundownConsumerWrapperDeployed;
	let TherundownConsumer;
	let TherundownConsumerDeployed;
	let wrapper;
	let consumer;
	let ThalesDeployed;
	let MockPriceFeedDeployed;
	let paymentCreate;
	let paymentResolve;
	let paymentOdds;
	let verifier;
	let dummyAddress;

	beforeEach(async () => {
		dummyAddress = '0xb69e74324bc030f1b8889236efa461496d439226';

		let MockPriceFeed = artifacts.require('MockPriceFeed');
		MockPriceFeedDeployed = await MockPriceFeed.new(owner);

		let Thales = artifacts.require('Thales');
		ThalesDeployed = await Thales.new({ from: owner });

		TherundownConsumer = artifacts.require('TherundownConsumer');
		TherundownConsumerDeployed = await TherundownConsumer.new({ from: owner });

		consumer = await TherundownConsumer.at(TherundownConsumerDeployed.address);

		paymentCreate = toUnit(1);
		paymentResolve = toUnit(2);
		paymentOdds = toUnit(3);

		await consumer.initialize(
			owner,
			[4],
			MockPriceFeedDeployed.address,
			[4],
			MockPriceFeedDeployed.address,
			[4],
			[10],
			{ from: owner }
		);

		TherundownConsumerWrapper = artifacts.require('TherundownConsumerWrapper');
		TherundownConsumerWrapperDeployed = await TherundownConsumerWrapper.new(
			ThalesDeployed.address,
			ThalesDeployed.address,
			TherundownConsumerDeployed.address,
			paymentCreate,
			paymentResolve,
			paymentOdds,
			'0x3465326264623338336437393962343662653663656562336463366465306363',
			third,
			[3],
			{ from: owner }
		);

		wrapper = await TherundownConsumerWrapper.at(TherundownConsumerWrapperDeployed.address);

		let ConsumerVerifier = artifacts.require('TherundownConsumerVerifier');
		verifier = await ConsumerVerifier.new({ from: owner });

		await verifier.initialize(
			owner,
			TherundownConsumerDeployed.address,
			['TBD TBD', 'TBA TBA'],
			['create', 'resolve'],
			20,
			{
				from: owner,
			}
		);

		await consumer.setSportContracts(
			TherundownConsumerWrapperDeployed.address,
			MockPriceFeedDeployed.address,
			MockPriceFeedDeployed.address,
			verifier.address,
			{
				from: owner,
			}
		);
		await wrapper.setBookmakerIdsBySportId(4, [3, 11], {
			from: owner,
		});
	});

	describe('Wrapper tests', () => {
		it('Init checking', async () => {
			assert.bnEqual(ThalesDeployed.address, await wrapper.getOracleAddress());
			assert.bnEqual(ThalesDeployed.address, await wrapper.getTokenAddress());
			assert.bnEqual(paymentCreate, await wrapper.paymentCreate());
			assert.bnEqual(paymentResolve, await wrapper.paymentResolve());
			assert.bnEqual(paymentOdds, await wrapper.paymentOdds());
			let bookmakerIdsBySportId = await wrapper.getBookmakerIdsBySportId(4);
			assert.bnEqual(2, bookmakerIdsBySportId.length);
			let defaultBooke = await wrapper.defaultBookmakerIds(0);
			assert.bnEqual(3, defaultBooke);
			//failover to default
			let failoverBookmaker = await wrapper.getBookmakerIdsBySportId(17);
			assert.bnEqual(1, failoverBookmaker.length);
		});

		it('Contract management', async () => {
			let bookee = [5];
			const tx_setBookmakerIdsBySportId = await wrapper.setBookmakerIdsBySportId(4, bookee, {
				from: owner,
			});

			await expect(wrapper.setBookmakerIdsBySportId(4, bookee, { from: first })).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);

			// check if event is emited
			assert.eventEqual(tx_setBookmakerIdsBySportId.logs[0], 'NewBookmakerIdsBySportId', {
				_sportId: 4,
				_ids: bookee,
			});

			const tx_setdefault = await wrapper.setDefaultBookmakerIds(bookee, {
				from: owner,
			});

			await expect(wrapper.setDefaultBookmakerIds(bookee, { from: first })).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);

			// check if event is emited
			assert.eventEqual(tx_setdefault.logs[0], 'NewDefaultBookmakerIds', {
				_ids: bookee,
			});

			const tx_Oracle = await wrapper.setOracle(first, {
				from: owner,
			});

			await expect(wrapper.setOracle(first, { from: first })).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);

			// check if event is emited
			assert.eventEqual(tx_Oracle.logs[0], 'NewOracleAddress', {
				_oracle: first,
			});

			const tx_Consumer = await wrapper.setConsumer(first, {
				from: owner,
			});

			await expect(wrapper.setConsumer(first, { from: first })).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);

			// check if event is emited
			assert.eventEqual(tx_Consumer.logs[0], 'NewConsumer', {
				_consumer: first,
			});

			const payment = w3utils.toWei('0.3');

			const tx_payment_c = await wrapper.setPaymentCreate(payment, {
				from: owner,
			});

			await expect(wrapper.setPaymentCreate(first, { from: first })).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);

			// check if event is emited
			assert.eventEqual(tx_payment_c.logs[0], 'NewPaymentAmountCreate', {
				_paymentCreate: payment,
			});

			const tx_payment_r = await wrapper.setPaymentResolve(payment, {
				from: owner,
			});

			await expect(wrapper.setPaymentResolve(first, { from: first })).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);

			// check if event is emited
			assert.eventEqual(tx_payment_r.logs[0], 'NewPaymentAmountResolve', {
				_paymentResolve: payment,
			});

			const tx_payment_o = await wrapper.setPaymentOdds(payment, {
				from: owner,
			});

			await expect(wrapper.setPaymentOdds(first, { from: first })).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);

			// check if event is emited
			assert.eventEqual(tx_payment_o.logs[0], 'NewPaymentAmountOdds', {
				_paymentOdds: payment,
			});

			const tx_link = await wrapper.setLink(first, {
				from: owner,
			});

			await expect(wrapper.setLink(first, { from: first })).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);

			// check if event is emited
			assert.eventEqual(tx_link.logs[0], 'NewLinkAddress', {
				_link: first,
			});

			const tx_amm = await wrapper.setSportsAmmAddress(first, {
				from: owner,
			});

			await expect(wrapper.setSportsAmmAddress(first, { from: first })).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);

			// check if event is emited
			assert.eventEqual(tx_amm.logs[0], 'NewSportsAmmAddress', {
				_sportsAmm: first,
			});

			const tx_odds_spec = await wrapper.setOddsSpecId(
				`0x3465326264623338336437393962343662653663656562336463366465306364`,
				{
					from: owner,
				}
			);

			await expect(
				wrapper.setOddsSpecId(
					`0x3465326264623338336437393962343662653663656562336463366465306364`,
					{ from: first }
				)
			).to.be.revertedWith('Ownable: caller is not the owner');

			// check if event is emited
			assert.eventEqual(tx_odds_spec.logs[0], 'NewOddsSpecId', {
				_specId: `0x3465326264623338336437393962343662653663656562336463366465306364`,
			});
		});

		it('Test requests', async () => {
			let emptyArray = [];
			await expect(
				wrapper.requestGames(toBytes32('RSX'), 'create', 4, 1655215501, {
					from: second,
				})
			).to.be.revertedWith('SafeMath: subtraction overflow');

			await expect(
				wrapper.requestGames(toBytes32('RSX'), 'create1', 4, 1655215501, {
					from: second,
				})
			).to.be.revertedWith('Market is not supported');

			await expect(
				wrapper.requestGames(toBytes32('RSX'), 'create', 5, 1655215501, {
					from: second,
				})
			).to.be.revertedWith('SportId is not supported');

			await expect(
				wrapper.requestOddsWithFilters(toBytes32('RSX'), 5, 1655215501, emptyArray, {
					from: second,
				})
			).to.be.revertedWith('SportId is not supported');

			await expect(
				wrapper.requestGamesResolveWithFilters(
					toBytes32('RSX'),
					'create1',
					4,
					1655215501,
					emptyArray,
					emptyArray,
					{
						from: second,
					}
				)
			).to.be.revertedWith('Market is not supported');

			await expect(
				wrapper.requestGamesResolveWithFilters(
					toBytes32('RSX'),
					'create',
					5,
					1655215501,
					emptyArray,
					emptyArray,
					{
						from: second,
					}
				)
			).to.be.revertedWith('SportId is not supported');

			await expect(
				wrapper.callUpdateOddsForSpecificGame(dummyAddress, {
					from: second,
				})
			).to.be.revertedWith('Only Sports AMM can call this function');
		});
	});
});
