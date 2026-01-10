// Скрипт для анализа найденных дел по запросу
import { searchCourtCases } from '../src/lib/court-search.ts';

const query = "Что делать, если интернет-магазин не доставил оплаченный товар?";

console.log('🔍 Анализ запроса:', query);
console.log('=' .repeat(80));

try {
  const result = await searchCourtCases(query, { maxResults: 10 });
  
  console.log('\n📊 Статистика:');
  console.log(`   Всего найдено дел: ${result.stats.total}`);
  console.log(`   Дела с известным результатом: ${result.stats.casesWithResult}`);
  console.log(`   Удовлетворено: ${result.stats.satisfied}`);
  console.log(`   Частично удовлетворено: ${result.stats.partial}`);
  console.log(`   Отказано: ${result.stats.rejected}`);
  console.log(`   Процент успеха: ${result.stats.percentage}%`);
  
  console.log('\n📋 Найденные дела:');
  result.cases.forEach((c, i) => {
    console.log(`\n${i + 1}. ${c.title}`);
    console.log(`   URL: ${c.url}`);
    console.log(`   Результат: ${c.result || 'неизвестно'}`);
    if (c.court) console.log(`   Суд: ${c.court}`);
    if (c.date) console.log(`   Дата: ${c.date}`);
    if (c.snippet) console.log(`   Фрагмент: ${c.snippet.slice(0, 100)}...`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('\n💡 Выводы:');
  
  if (result.stats.casesWithResult === 0) {
    console.log('   ⚠️  Не удалось определить результаты ни по одному делу');
  } else if (result.stats.total > result.stats.casesWithResult) {
    const unknownCount = result.stats.total - result.stats.casesWithResult;
    console.log(`   ⚠️  Из ${result.stats.total} дел только ${result.stats.casesWithResult} имеют известный результат`);
    console.log(`   ⚠️  ${unknownCount} дел с неизвестным результатом (${Math.round(unknownCount / result.stats.total * 100)}%)`);
  }
  
  if (result.stats.percentage === 25) {
    console.log('\n   📌 Вероятность 25% означает:');
    if (result.stats.satisfied === 1 && result.stats.rejected === 3 && result.stats.partial === 0) {
      console.log('      - 1 дело удовлетворено, 3 дела отказано');
      console.log('      - Расчет: (1 + 0*0.5) / 4 * 100 = 25%');
    } else if (result.stats.satisfied === 0 && result.stats.rejected === 4 && result.stats.partial === 0) {
      console.log('      - Ни одно дело не удовлетворено, 4 дела отказано');
      console.log('      - НО: расчет показывает 0%, а не 25%...');
    } else {
      console.log(`      - Удовлетворено: ${result.stats.satisfied}, Частично: ${result.stats.partial}, Отказано: ${result.stats.rejected}`);
      console.log(`      - Расчет: (${result.stats.satisfied} + ${result.stats.partial}*0.5) / ${result.stats.casesWithResult} * 100 = ${result.stats.percentage}%`);
    }
  }
  
} catch (error) {
  console.error('❌ Ошибка:', error.message);
  console.error(error.stack);
}
