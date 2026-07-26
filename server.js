require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { init } = require("./db");

const authRoutes = require("./routes/auth");
const adsRoutes = require("./routes/ads");
const walletRoutes = require("./routes/wallet");
const postbackRoutes = require("./routes/postback");
const offerwallRoutes = require("./routes/offerwall");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// حماية عامة من الطلبات المفرطة
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", generalLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/ads", adsRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/offerwall", offerwallRoutes);
// ملاحظة: postback بدون JWT عمدًا، لأن الذي يستدعيه هو خادم شبكة الإعلانات وليس متصفح المستخدم
app.use("/api/postback", postbackRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// خدمة الواجهة الأمامية الثابتة
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ الخادم يعمل على http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ فشل الاتصال بقاعدة البيانات:", err.message);
    process.exit(1);
  });
