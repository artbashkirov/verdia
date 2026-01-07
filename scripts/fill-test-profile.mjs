import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Load env from .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Отсутствуют переменные окружения NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fillTestProfile() {
  console.log('🔍 Получаем список пользователей...');
  
  // Get all users from auth
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    console.error('❌ Ошибка получения пользователей:', authError);
    return;
  }
  
  if (!authUsers.users || authUsers.users.length === 0) {
    console.error('❌ Пользователи не найдены');
    return;
  }
  
  console.log(`✅ Найдено пользователей: ${authUsers.users.length}`);
  
  // Use the first user (or the most recent one)
  const user = authUsers.users[0];
  console.log(`👤 Пользователь: ${user.email} (ID: ${user.id})`);
  
  // Test data for ALL person types (individual, entrepreneur, legal_entity)
  const testProfile = {
    user_id: user.id,
    person_type: 'individual', // По умолчанию физлицо
    
    // === ФИЗИЧЕСКОЕ ЛИЦО ===
    full_name: 'Башкиров Алексей Сергеевич',
    passport_series: '45 12',
    passport_number: '567890',
    passport_issued_by: 'ГУ МВД России по г. Москве',
    passport_issue_date: '2015-06-15',
    birth_date: '1990-03-25',
    
    // === ИП (Индивидуальный предприниматель) ===
    ogrnip: '315774600123456',
    inn_individual: '772012345678', // Общий ИНН для физлица и ИП
    
    // === ЮРИДИЧЕСКОЕ ЛИЦО ===
    company_name: 'Вердия Консалтинг',
    company_form: 'ООО',
    ogrn: '1234567890123',
    inn_legal: '7720123456',
    kpp: '772001001',
    
    // === АДРЕСА (общие для всех типов) ===
    registration_address: 'г. Москва, ул. Тверская, д. 10, кв. 25',
    registration_city: 'Москва',
    registration_region: 'г. Москва',
    actual_address: 'г. Москва, ул. Арбат, д. 15, кв. 10',
    
    // === КОНТАКТЫ (общие для всех типов) ===
    phone: '+7 (999) 123-45-67',
    email_contact: user.email || 'test@example.com',
    
    // === БАНКОВСКИЕ РЕКВИЗИТЫ (общие для всех типов) ===
    bank_name: 'ПАО Сбербанк',
    bank_bik: '044525225',
    bank_account: '40817810938000123456',
    bank_corr_account: '30101810400000000225',
  };
  
  console.log('📝 Создаём/обновляем профиль с тестовыми данными...');
  
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(testProfile, { onConflict: 'user_id' })
    .select()
    .single();
  
  if (error) {
    console.error('❌ Ошибка сохранения профиля:', error);
    return;
  }
  
  console.log('✅ Профиль успешно заполнен тестовыми данными для ВСЕХ типов лиц!');
  
  console.log('\n👤 ФИЗИЧЕСКОЕ ЛИЦО:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`ФИО: ${testProfile.full_name}`);
  console.log(`Паспорт: ${testProfile.passport_series} ${testProfile.passport_number}`);
  console.log(`Кем выдан: ${testProfile.passport_issued_by}`);
  console.log(`Дата выдачи: ${testProfile.passport_issue_date}`);
  console.log(`Дата рождения: ${testProfile.birth_date}`);
  console.log(`ИНН: ${testProfile.inn_individual}`);
  
  console.log('\n🏪 ИП (Индивидуальный предприниматель):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`ФИО: ${testProfile.full_name}`);
  console.log(`ОГРНИП: ${testProfile.ogrnip}`);
  console.log(`ИНН: ${testProfile.inn_individual}`);
  
  console.log('\n🏢 ЮРИДИЧЕСКОЕ ЛИЦО:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Наименование: ${testProfile.company_form} "${testProfile.company_name}"`);
  console.log(`ОГРН: ${testProfile.ogrn}`);
  console.log(`ИНН: ${testProfile.inn_legal}`);
  console.log(`КПП: ${testProfile.kpp}`);
  
  console.log('\n📍 АДРЕСА (общие):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Адрес регистрации: ${testProfile.registration_address}`);
  console.log(`Город: ${testProfile.registration_city}`);
  console.log(`Регион: ${testProfile.registration_region}`);
  console.log(`Фактический адрес: ${testProfile.actual_address}`);
  
  console.log('\n📞 КОНТАКТЫ (общие):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Телефон: ${testProfile.phone}`);
  console.log(`Email: ${testProfile.email_contact}`);
  
  console.log('\n🏦 БАНКОВСКИЕ РЕКВИЗИТЫ (общие):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Банк: ${testProfile.bank_name}`);
  console.log(`БИК: ${testProfile.bank_bik}`);
  console.log(`Расчётный счёт: ${testProfile.bank_account}`);
  console.log(`Корр. счёт: ${testProfile.bank_corr_account}`);
  
  console.log('\n🎉 Теперь переключайте тип лица на странице профиля - данные уже заполнены!');
}

fillTestProfile().catch(console.error);

