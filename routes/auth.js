const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { sendResetEmail } = require("../mailer");

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/register", async (req, res) => {
  const { username, password, email } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "الاسم وكلمة المرور مطلوبان" });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: "اسم المستخدم يجب أن يكون 3-20 حرفًا (أحرف إنجليزية/أرقام فقط)" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
  }
  if (email && !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "صيغة البريد الإلكتروني غير صحيحة" });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل" });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id",
      [username, hash, email || null]
    );

    const token = jwt.sign({ userId: result.rows[0].id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ token, username, balance: 0 });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "هذا البريد الإلكتروني مستخدم بالفعل" });
    }
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاول لاحقًا" });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "الاسم وكلمة المرور مطلوبان" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, username: user.username, balance: parseFloat(user.balance) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاول لاحقًا" });
  }
});

// تحديث/إضافة البريد الإلكتروني للحساب الحالي (مطلوب لاستخدام استعادة كلمة المرور)
router.post("/update-email", requireAuth, async (req, res) => {
  const { email } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "صيغة البريد الإلكتروني غير صحيحة" });
  }

  try {
    await pool.query("UPDATE users SET email = $1 WHERE id = $2", [email, req.userId]);
    res.json({ message: "تم حفظ البريد الإلكتروني بنجاح" });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "هذا البريد الإلكتروني مستخدم بالفعل" });
    }
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاول لاحقًا" });
  }
});

// طلب استعادة كلمة المرور: يرسل رابطًا للبريد الإلكتروني المسجّل
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });
  }

  try {
    const result = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    // لا نُفصح إن كان البريد موجودًا أم لا، لأسباب أمنية
    if (result.rows.length === 0) {
      return res.json({ message: "إذا كان هذا البريد مسجّلًا لدينا، ستصلك رسالة استعادة قريبًا" });
    }

    const userId = result.rows[0].id;
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // ساعة واحدة

    await pool.query(
      "INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [userId, token, expiresAt]
    );

    const baseUrl = process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;
    const resetUrl = `${baseUrl}/reset-password.html?token=${token}`;

    await sendResetEmail(email, resetUrl);

    res.json({ message: "إذا كان هذا البريد مسجّلًا لدينا، ستصلك رسالة استعادة قريبًا" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "تعذّر إرسال بريد الاستعادة حاليًا، حاول لاحقًا" });
  }
});

// إتمام استعادة كلمة المرور باستخدام الرمز المُرسَل بالبريد
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: "بيانات ناقصة" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      "SELECT * FROM password_resets WHERE token = $1 FOR UPDATE",
      [token]
    );
    const reset = result.rows[0];

    if (!reset || reset.used || new Date(reset.expires_at) < new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "رابط الاستعادة غير صالح أو منتهي الصلاحية" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, reset.user_id]);
    await client.query("UPDATE password_resets SET used = true WHERE id = $1", [reset.id]);

    await client.query("COMMIT");
    res.json({ message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاول لاحقًا" });
  } finally {
    client.release();
  }
});

module.exports = router;
