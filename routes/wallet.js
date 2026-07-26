const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const MIN_WITHDRAW = parseFloat(process.env.MIN_WITHDRAW || "5");

router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT username, balance FROM users WHERE id = $1",
      [req.userId]
    );
    const user = result.rows[0];
    res.json({ username: user.username, balance: parseFloat(user.balance), minWithdraw: MIN_WITHDRAW });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاول لاحقًا" });
  }
});

router.post("/withdraw", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      "SELECT balance FROM users WHERE id = $1 FOR UPDATE",
      [req.userId]
    );
    const balance = parseFloat(result.rows[0].balance);

    if (balance < MIN_WITHDRAW) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `الحد الأدنى للسحب هو ${MIN_WITHDRAW}$، رصيدك الحالي ${balance.toFixed(2)}$`,
      });
    }

    await client.query("UPDATE users SET balance = 0 WHERE id = $1", [req.userId]);
    await client.query(
      "INSERT INTO withdrawals (user_id, amount, status) VALUES ($1, $2, 'pending')",
      [req.userId, balance]
    );

    await client.query("COMMIT");
    res.json({ message: "تم إرسال طلب السحب وهو الآن قيد المراجعة", amount: balance });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاول لاحقًا" });
  } finally {
    client.release();
  }
});

router.get("/withdrawals", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, amount, status, requested_at FROM withdrawals WHERE user_id = $1 ORDER BY requested_at DESC",
      [req.userId]
    );
    res.json({
      withdrawals: result.rows.map((r) => ({ ...r, amount: parseFloat(r.amount) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاول لاحقًا" });
  }
});

module.exports = router;
