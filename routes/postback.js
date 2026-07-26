const express = require("express");
const { pool } = require("../db");

const router = express.Router();

/*
  هذا المسار هو نقطة الاتصال التي تستدعيها شبكة الإعلانات (وليس متصفح المستخدم).
  عندما يُنهي مستخدم عرضًا (Offer) على شبكة مثل AdGate Media أو OfferToro،
  خوادمهم هي التي ترسل طلبًا مباشرًا إلى هذا الرابط ليخبروك: "هذا المستخدم أنهى عرضًا، أضف له كذا مبلغ".

  الرابط الذي تضعه في لوحة تحكم الشبكة الإعلانية (كمثال — كل شبكة تختلف قليلًا):
  https://موقعك.com/api/postback/offerwall?user_id={subid}&amount={payout}&tx_id={transaction_id}&secret=المفتاح_السري_من_env

  ⚠️ أسماء الحقول ({subid}, {payout}, إلخ) تضعها كل شبكة بمصطلحاتها الخاصة —
  اذهب لوثائق الشبكة بعد قبولك فيها وعدّل القيم بالأسفل لتطابق ما يرسلونه فعليًا.
*/

router.get("/offerwall", async (req, res) => {
  try {
    // 1) دعم عدة أسماء شائعة لنفس الحقل حسب الشبكة
    const userId = req.query.user_id || req.query.subid || req.query.s1;
    const amountRaw = req.query.amount || req.query.payout || req.query.amount_local;
    const txId = req.query.tx_id || req.query.transaction_id || req.query.trans_id;
    const secret = req.query.secret;
    const network = req.query.network || "unknown";

    // 2) التحقق من المفتاح السري — يمنع أي شخص من تزوير طلب وإضافة رصيد وهمي
    if (!process.env.OFFERWALL_SECRET || secret !== process.env.OFFERWALL_SECRET) {
      console.warn("postback مرفوض: مفتاح سري غير صحيح", req.query);
      return res.status(403).send("0");
    }

    if (!userId || !amountRaw || !txId) {
      return res.status(400).send("0");
    }

    const amount = parseFloat(amountRaw);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).send("0");
    }

    const userCheck = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).send("0");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 3) منع الاحتيال بإعادة الإرسال: لو تم استقبال نفس transaction_id سابقًا، لا نضيف الرصيد مرة ثانية
      let inserted;
      try {
        inserted = await client.query(
          `INSERT INTO offerwall_postbacks (transaction_id, user_id, amount, network, raw_query)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [txId, userId, amount, network, JSON.stringify(req.query)]
        );
      } catch (err) {
        if (err.code === "23505") {
          // معاملة مكررة — نرد بنجاح حتى لا تعيد الشبكة المحاولة، لكن دون إضافة رصيد إضافي
          await client.query("ROLLBACK");
          return res.status(200).send("1");
        }
        throw err;
      }

      await client.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [amount, userId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // معظم الشبكات تتوقع ردًا نصيًا بسيطًا يفيد بنجاح الاستقبال
    res.status(200).send("1");
  } catch (err) {
    console.error("postback error:", err);
    res.status(500).send("0");
  }
});

module.exports = router;
