const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const RATE_PER_VIEW = parseFloat(process.env.RATE_PER_VIEW || "0.004");
const AD_DURATION = parseInt(process.env.AD_DURATION_SECONDS || "12", 10);
const MAX_VIEWS_PER_HOUR = parseInt(process.env.MAX_VIEWS_PER_HOUR || "30", 10);

// بدء مشاهدة إعلان: نعتمد على توقيت قاعدة البيانات نفسها (now()) لا المتصفح
router.post("/start", requireAuth, async (req, res) => {
  try {
    const recent = await pool.query(
      `SELECT COUNT(*) AS c FROM ad_sessions
       WHERE user_id = $1 AND status = 'completed' AND started_at > now() - interval '1 hour'`,
      [req.userId]
    );
    if (parseInt(recent.rows[0].c, 10) >= MAX_VIEWS_PER_HOUR) {
      return res.status(429).json({ error: "وصلت للحد الأقصى من المشاهدات لهذه الساعة، حاول لاحقًا" });
    }

    // إغلاق أي جلسات معلقة قديمة لنفس المستخدم
    await pool.query(
      "UPDATE ad_sessions SET status = 'expired' WHERE user_id = $1 AND status = 'pending'",
      [req.userId]
    );

    const result = await pool.query(
      "INSERT INTO ad_sessions (user_id, status) VALUES ($1, 'pending') RETURNING id",
      [req.userId]
    );

    res.json({ sessionId: result.rows[0].id, durationSeconds: AD_DURATION });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاول لاحقًا" });
  }
});

// إتمام المشاهدة: نتحقق من مرور الوقت الكافي بالاعتماد على وقت قاعدة البيانات
router.post("/complete", requireAuth, async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: "sessionId مطلوب" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sessionResult = await client.query(
      `SELECT *, EXTRACT(EPOCH FROM (now() - started_at)) AS elapsed_seconds
       FROM ad_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [sessionId, req.userId]
    );
    const session = sessionResult.rows[0];

    if (!session) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "جلسة غير موجودة" });
    }
    if (session.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "هذه الجلسة منتهية أو مكتملة بالفعل" });
    }
    if (parseFloat(session.elapsed_seconds) < AD_DURATION - 0.5) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "لم تكتمل مدة الإعلان بعد" });
    }

    const amount = RATE_PER_VIEW;

    await client.query(
      "UPDATE ad_sessions SET status = 'completed', completed_at = now(), amount = $1 WHERE id = $2",
      [amount, sessionId]
    );
    const userResult = await client.query(
      "UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance",
      [amount, req.userId]
    );

    await client.query("COMMIT");
    res.json({ amount, balance: parseFloat(userResult.rows[0].balance) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاول لاحقًا" });
  } finally {
    client.release();
  }
});

// سجل آخر المشاهدات
router.get("/history", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, completed_at, amount FROM ad_sessions
       WHERE user_id = $1 AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 20`,
      [req.userId]
    );
    res.json({
      history: result.rows.map((r) => ({ ...r, amount: parseFloat(r.amount) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاول لاحقًا" });
  }
});

module.exports = router;
