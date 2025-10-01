// scripts/clear-test-data.js
// Очистка тестовых данных из базы

const { pool } = require('../config/database');

async function clearTestData() {
  const client = await pool.connect();

  try {
    console.log('🗑️  Начинаем очистку тестовых данных...\n');

    await client.query('BEGIN');

    // 1. Удаляем все значения показателей
    const res1 = await client.query('DELETE FROM public.indicator_values');
    console.log(`✅ Удалено записей из indicator_values: ${res1.rowCount}`);

    // 2. Удаляем все значения услуг
    const res2 = await client.query('DELETE FROM public.service_values');
    console.log(`✅ Удалено записей из service_values: ${res2.rowCount}`);

    // 3. Удаляем тестовые муниципалитеты
    const res3 = await client.query(`
      DELETE FROM public.municipalities
      WHERE name LIKE '%Тестов%' OR name LIKE '%Test%'
    `);
    console.log(`✅ Удалено тестовых муниципалитетов: ${res3.rowCount}`);

    // 4. Сбрасываем счетчики (опционально)
    await client.query('ALTER SEQUENCE indicator_values_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE service_values_id_seq RESTART WITH 1');
    console.log('✅ Счетчики ID сброшены\n');

    await client.query('COMMIT');

    console.log('🎉 Очистка завершена успешно!');

    // Показываем статистику
    const stats = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM public.municipalities) as municipalities,
        (SELECT COUNT(*) FROM public.indicator_values) as indicator_values,
        (SELECT COUNT(*) FROM public.service_values) as service_values
    `);

    console.log('\n📊 Текущее состояние базы:');
    console.log(`   Муниципалитетов: ${stats.rows[0].municipalities}`);
    console.log(`   Значений показателей: ${stats.rows[0].indicator_values}`);
    console.log(`   Значений услуг: ${stats.rows[0].service_values}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Ошибка при очистке:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

clearTestData().catch(err => {
  console.error(err);
  process.exit(1);
});
