require('dotenv').config();
console.log('الرابط المستخدم:', process.env.DATABASE_URL);

const { Pool } = require('pg');
const p = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

p.query('SELECT 1')
  .then(() => console.log('نجح الاتصال ✅'))
  .catch(e => {
    console.log('فشل الاتصال ❌');
    console.log('التفاصيل الكاملة:', JSON.stringify(e, Object.getOwnPropertyNames(e)));
  });