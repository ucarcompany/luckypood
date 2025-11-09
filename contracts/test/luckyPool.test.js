const LuckyPool = artifacts.require("LuckyPool");
const LuckyPoolFactory = artifacts.require("LuckyPoolFactory");
const MockERC20 = artifacts.require("MockERC20");
const MockVRF = artifacts.require("MockVRFCoordinatorV2");

const toWei = (x) => web3.utils.toWei(String(x), 'ether');

contract("LuckyPool end-to-end", (accounts) => {
  const [owner, user1, user2, treasury] = accounts;

  it("participate, reach min, draw, and refund logic", async () => {
    const token = await MockERC20.new();
    await token.mint(user1, toWei(100));
    await token.mint(user2, toWei(100));

    const vrf = await MockVRF.new();

    const ticketPrice = toWei(1);
    const minFill = toWei(3); // 3 tickets
    const maxFill = toWei(5); // 5 tickets
    const countdown = 3 * 24 * 60 * 60;
    const refundDeadline = 15 * 24 * 60 * 60;

    const pool = await LuckyPool.new(
      owner,
      token.address,
      ticketPrice,
      minFill,
      maxFill,
      countdown,
      refundDeadline,
      vrf.address,
      web3.utils.padLeft('0x1', 64),
      1,
      treasury
    );

    // before minFill: refund allowed
    await token.approve(pool.address, toWei(10), { from: user1 });
    await pool.participate(2, { from: user1 });
    // refund user1 partially
    await pool.claimRefund({ from: user1 });

    // participate again reaching minFill
    await token.approve(pool.address, toWei(10), { from: user1 });
    await pool.participate(3, { from: user1 }); // reach minFill -> countdown starts

    // after minReached: refund not allowed
    try {
      await pool.claimRefund({ from: user1 });
      assert.fail("refund should be blocked after minReached");
    } catch (e) {
      assert(e.message.includes("RefundNotAllowed") || e.message.includes("revert"));
    }

    // top up to max -> should trigger immediate draw via VRF mock
    await token.approve(pool.address, toWei(10), { from: user2 });
    await pool.participate(2, { from: user2 }); // total 5 -> draw

    const info = await pool.getInfo();
    assert.equal(info.drawn, true, "pool should be drawn");
    assert(info.winner !== '0x0000000000000000000000000000000000000000', "winner set");

    // withdraw after drawn
    await pool.withdrawToTreasury(toWei(1), { from: owner });
  });
});
