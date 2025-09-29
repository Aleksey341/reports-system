const { pool } = require('../config/database');

(async () => {
  try {
    console.log("🔍 Проверяем муниципалитеты...");

    // Сколько всего записей
    const countRes = await pool.query('SELECT COUNT(*) FROM municipalities');
    console.log(`📊 Всего муниципалитетов в базе: ${countRes.rows[0].count}`);

    // Первые 10 для проверки
    const listRes = await pool.query(
      'SELECT id, name, head_name, head_position FROM municipalities ORDER BY id LIMIT 10'
    );

    console.log("📋 Пример данных:");
    console.table(listRes.rows);

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Ошибка при проверке:", err.message);
    process.exit(1);
  }
})();
