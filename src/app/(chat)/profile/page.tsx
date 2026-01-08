'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Sidebar } from '@/components/layout';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { MobileSidebar } from '@/components/layout/MobileSidebar';
import { useTheme } from '@/lib/theme-context';
import type { PersonType, UserProfile } from '@/types/database';

// Tabs for different sections
type TabType = 'personal' | 'address' | 'bank' | 'defendants';

export default function ProfilePage() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('personal');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  
  // Profile form state
  const [personType, setPersonType] = useState<PersonType>('individual');
  const [profile, setProfile] = useState<Partial<UserProfile>>({});

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      router.push('/login');
      return;
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (data) {
      const profileData = data as UserProfile;
      setProfile(profileData);
      setPersonType(profileData.person_type || 'individual');
    }
    
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setMessage({ type: 'error', text: 'Необходима авторизация' });
      setIsSaving(false);
      return;
    }

    const profileData = {
      user_id: user.id,
      person_type: personType,
      ...profile,
    };

    // Use upsert to create or update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('user_profiles') as any)
      .upsert(profileData, { onConflict: 'user_id' });

    if (error) {
      console.error('Error saving profile:', error);
      setMessage({ type: 'error', text: 'Ошибка сохранения профиля' });
    } else {
      setMessage({ type: 'success', text: 'Профиль сохранён' });
      setTimeout(() => setMessage(null), 3000);
    }
    
    setIsSaving(false);
  };

  const updateField = (field: keyof UserProfile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-secondary-text">Загрузка...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      
      {/* Mobile Header */}
      <MobileHeader onMenuClick={() => setMobileSidebarOpen(true)} isMenuOpen={mobileSidebarOpen} />
      <MobileSidebar 
        isOpen={mobileSidebarOpen} 
        onClose={() => setMobileSidebarOpen(false)} 
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden pt-[60px] lg:pt-0">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-foreground">Профиль истца</h1>
              <p className="text-secondary-text mt-2">
                Эти данные будут использоваться при генерации документов и анализе подсудности
              </p>
            </div>

            {/* Person type selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">
                Тип лица
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'individual', label: 'Физическое лицо' },
                  { value: 'entrepreneur', label: 'ИП' },
                  { value: 'legal_entity', label: 'Юридическое лицо' },
                ].map(type => (
                  <button
                    key={type.value}
                    onClick={() => setPersonType(type.value as PersonType)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      personType === type.value
                        ? 'bg-foreground text-background'
                        : 'text-foreground'
                    }`}
                    style={{ backgroundColor: personType === type.value ? undefined : 'var(--gray-100)' }}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-border">
              {[
                { id: 'personal', label: 'Личные данные' },
                { id: 'address', label: 'Адреса' },
                { id: 'bank', label: 'Банковские реквизиты' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === tab.id
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-secondary-text hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Form sections */}
            <div className="space-y-6">
              {/* Personal data tab */}
              {activeTab === 'personal' && (
                <div className="space-y-4">
                  {personType === 'individual' && (
                    <>
                      <FormField
                        label="ФИО"
                        value={profile.full_name || ''}
                        onChange={(v) => updateField('full_name', v)}
                        placeholder="Иванов Иван Иванович"
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          label="Серия паспорта"
                          value={profile.passport_series || ''}
                          onChange={(v) => updateField('passport_series', v)}
                          placeholder="45 00"
                        />
                        <FormField
                          label="Номер паспорта"
                          value={profile.passport_number || ''}
                          onChange={(v) => updateField('passport_number', v)}
                          placeholder="123456"
                        />
                      </div>
                      <FormField
                        label="Кем выдан"
                        value={profile.passport_issued_by || ''}
                        onChange={(v) => updateField('passport_issued_by', v)}
                        placeholder="ГУ МВД России по г. Москве"
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          label="Дата выдачи"
                          value={profile.passport_issue_date || ''}
                          onChange={(v) => updateField('passport_issue_date', v)}
                          type="date"
                        />
                        <FormField
                          label="Дата рождения"
                          value={profile.birth_date || ''}
                          onChange={(v) => updateField('birth_date', v)}
                          type="date"
                        />
                      </div>
                      <FormField
                        label="ИНН (необязательно)"
                        value={profile.inn_individual || ''}
                        onChange={(v) => updateField('inn_individual', v)}
                        placeholder="123456789012"
                      />
                    </>
                  )}

                  {personType === 'entrepreneur' && (
                    <>
                      <FormField
                        label="ФИО"
                        value={profile.full_name || ''}
                        onChange={(v) => updateField('full_name', v)}
                        placeholder="Иванов Иван Иванович"
                      />
                      <FormField
                        label="ОГРНИП"
                        value={profile.ogrnip || ''}
                        onChange={(v) => updateField('ogrnip', v)}
                        placeholder="315774600123456"
                      />
                      <FormField
                        label="ИНН"
                        value={profile.inn_individual || ''}
                        onChange={(v) => updateField('inn_individual', v)}
                        placeholder="123456789012"
                      />
                    </>
                  )}

                  {personType === 'legal_entity' && (
                    <>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="col-span-1">
                          <FormField
                            label="Форма"
                            value={profile.company_form || ''}
                            onChange={(v) => updateField('company_form', v)}
                            placeholder="ООО"
                          />
                        </div>
                        <div className="col-span-3">
                          <FormField
                            label="Наименование"
                            value={profile.company_name || ''}
                            onChange={(v) => updateField('company_name', v)}
                            placeholder="Ромашка"
                          />
                        </div>
                      </div>
                      <FormField
                        label="ОГРН"
                        value={profile.ogrn || ''}
                        onChange={(v) => updateField('ogrn', v)}
                        placeholder="1234567890123"
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          label="ИНН"
                          value={profile.inn_legal || ''}
                          onChange={(v) => updateField('inn_legal', v)}
                          placeholder="1234567890"
                        />
                        <FormField
                          label="КПП"
                          value={profile.kpp || ''}
                          onChange={(v) => updateField('kpp', v)}
                          placeholder="123456789"
                        />
                      </div>
                    </>
                  )}

                  {/* Contact info for all types */}
                  <div className="pt-4 border-t border-border">
                    <h3 className="text-sm font-medium text-foreground mb-4">Контактные данные</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        label="Телефон"
                        value={profile.phone || ''}
                        onChange={(v) => updateField('phone', v)}
                        placeholder="+7 (999) 123-45-67"
                      />
                      <FormField
                        label="Email"
                        value={profile.email_contact || ''}
                        onChange={(v) => updateField('email_contact', v)}
                        placeholder="email@example.com"
                        type="email"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Address tab */}
              {activeTab === 'address' && (
                <div className="space-y-4">
                  <FormField
                    label={personType === 'legal_entity' ? 'Юридический адрес' : 'Адрес регистрации'}
                    value={profile.registration_address || ''}
                    onChange={(v) => updateField('registration_address', v)}
                    placeholder="г. Москва, ул. Примерная, д. 1, кв. 1"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      label="Город"
                      value={profile.registration_city || ''}
                      onChange={(v) => updateField('registration_city', v)}
                      placeholder="Москва"
                    />
                    <FormField
                      label="Регион"
                      value={profile.registration_region || ''}
                      onChange={(v) => updateField('registration_region', v)}
                      placeholder="Московская область"
                    />
                  </div>
                  <FormField
                    label="Фактический адрес (если отличается)"
                    value={profile.actual_address || ''}
                    onChange={(v) => updateField('actual_address', v)}
                    placeholder="г. Москва, ул. Другая, д. 2, кв. 3"
                  />
                  <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--gray-100)' }}>
                    <p className="text-sm text-secondary-text">
                      💡 Адрес регистрации используется для определения подсудности дела и указания в документах
                    </p>
                  </div>
                </div>
              )}

              {/* Bank tab */}
              {activeTab === 'bank' && (
                <div className="space-y-4">
                  <FormField
                    label="Наименование банка"
                    value={profile.bank_name || ''}
                    onChange={(v) => updateField('bank_name', v)}
                    placeholder="ПАО Сбербанк"
                  />
                  <FormField
                    label="БИК"
                    value={profile.bank_bik || ''}
                    onChange={(v) => updateField('bank_bik', v)}
                    placeholder="044525225"
                  />
                  <FormField
                    label="Расчётный счёт"
                    value={profile.bank_account || ''}
                    onChange={(v) => updateField('bank_account', v)}
                    placeholder="40817810000000000000"
                  />
                  <FormField
                    label="Корр. счёт"
                    value={profile.bank_corr_account || ''}
                    onChange={(v) => updateField('bank_corr_account', v)}
                    placeholder="30101810400000000225"
                  />
                  <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--gray-100)' }}>
                    <p className="text-sm text-secondary-text">
                      💰 Банковские реквизиты используются для указания в документах на взыскание денежных средств
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Save button */}
            <div className="mt-8 flex items-center gap-4">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-colors disabled:opacity-50"
                style={{ 
                  backgroundColor: resolvedTheme === 'light' ? '#212121' : '#ffffff',
                  color: resolvedTheme === 'light' ? '#ffffff' : '#000000'
                }}
              >
                {isSaving ? 'Сохранение...' : 'Сохранить профиль'}
              </button>
              {message && (
                <span className={`text-sm ${message.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                  {message.text}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Form field component
function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-[48px] px-4 text-base text-foreground border-0 rounded-[16px] placeholder:text-secondary-text focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
        style={{ backgroundColor: 'var(--gray-100)' }}
      />
    </div>
  );
}

