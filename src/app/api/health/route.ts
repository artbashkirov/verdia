import { NextResponse } from 'next/server';

/**
 * Health-check endpoint.
 *
 * Используется:
 * - GitHub Actions деплой (`.github/workflows/deploy.yml`) — после `pm2 reload`
 *   опрашивает этот URL, чтобы убедиться, что новый процесс реально поднялся.
 * - nginx — может использоваться для активной проверки upstream (если
 *   потребуется в будущем).
 *
 * Намеренно НЕ ходим в БД и сторонние сервисы — это «liveness», а не «readiness».
 * Для liveness достаточно того факта, что Node-процесс поднялся, маршруты
 * зарегистрированы, и сервер может вернуть JSON. Если уйдём в полноценный
 * readiness-чек (с пингом Supabase/OpenAI/etc), это станет отдельной ручкой
 * `/api/ready`, чтобы не блокировать деплой при кратковременных сбоях
 * сторонних сервисов.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
