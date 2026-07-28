const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function requireAdmin(req, res, next) {
  try {
    const result = await pool.query("SELECT username FROM users WHERE id = $1", [req.userId]);
    const user = result.rows[0];
    if (!user || !ADMIN_USERNAMES.includes(user.username)) {
      return res.status(403).json({ error: "غير مصرح لك بالوصول لهذه الصفحة" });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
}

// قائمة كل المستخدمين
router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, balance, created_at FROM users ORDER BY created_at DESC"
    );
    res.json({
      users: result.rows.map((u) => ({ ...u, balance: parseFloat(u.balance) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// قائمة كل طلبات السحب مع اسم وبريد صاحب كل طلب
router.get("/withdrawals", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.id, w.amount, w.status, w.requested_at, u.username, u.email
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      ORDER BY w.requested_at DESC
    `);
    res.json({
      withdrawals: result.rows.map((w) => ({ ...w, amount: parseFloat(w.amount) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// تعليم طلب سحب كمدفوع (بعد أن تدفع له يدويًا عبر PayPal/Payoneer/إلخ)
router.post("/withdrawals/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE withdrawals SET status = 'approved' WHERE id = $1 AND status = 'pending' RETURNING id",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "الطلب غير موجود أو تمت معالجته بالفعل" });
    }
    res.json({ message: "تم تعليم الطلب كمدفوع" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// رفض طلب سحب وإعادة الرصيد للمستخدم
router.post("/withdrawals/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      "SELECT * FROM withdrawals WHERE id = $1 AND status = 'pending' FOR UPDATE",
      [req.params.id]
    );
    const w = result.rows[0];
    if (!w) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "الطلب غير موجود أو تمت معالجته بالفعل" });
    }

    await client.query("UPDATE withdrawals SET status = 'rejected' WHERE id = $1", [req.params.id]);
    await client.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [w.amount, w.user_id]);

    await client.query("COMMIT");
    res.json({ message: "تم رفض الطلب وإعادة الرصيد للمستخدم" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  } finally {
    client.release();
  }
});

module.exports = router;
