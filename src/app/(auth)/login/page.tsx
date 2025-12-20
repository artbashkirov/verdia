'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/layout';
import { Button, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    const supabase = createClient();
    
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    });

    if (error) {
      setError(error.message === 'Invalid login credentials' 
        ? 'Неверный email или пароль' 
        : error.message);
      setIsLoading(false);
      return;
    }
    
    router.push('/chat');
    router.refresh();
  };

  return (
    <AuthLayout
      title="Юридический AI-ассистент"
      description="Иски, ходатайства и анализ судебной практики — за минуты"
    >
      <div className="flex flex-col gap-[100px] max-w-[554px]">
        {/* Header */}
        <div className="flex flex-col gap-2.5">
          <h2 className="text-[32px] font-bold text-[#040308]">
            Добро пожаловать
          </h2>
          <p className="text-base text-[#040308]">
            Еще не зарегистрированы?{' '}
            <Link href="/register" className="text-[#312ecb] hover:underline">
              Регистрация
            </Link>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-[30px]">
          <div className="flex flex-col gap-5">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}
            <Input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
            <Input
              type="password"
              placeholder="Пароль"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-[#312ecb] text-base hover:underline"
              >
                Забыли пароль?
              </Link>
            </div>
          </div>

          <Button type="submit" fullWidth disabled={isLoading}>
            {isLoading ? 'Загрузка...' : 'Войти'}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
