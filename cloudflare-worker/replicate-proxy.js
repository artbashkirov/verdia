/**
 * Cloudflare Worker - Прокси для Replicate API
 *
 * Этот Worker принимает запросы от нашего VPS (Россия) и проксирует их
 * к Replicate. Cloudflare-нода в США/Европе обходит блокировки.
 *
 * --- Архитектура: official vs community models ---
 *
 * Replicate имеет два формата endpoint'а для запуска моделей:
 *
 *   1) `POST /v1/models/{owner}/{name}/predictions` — РАБОТАЕТ ТОЛЬКО для
 *      OFFICIAL моделей (например, `black-forest-labs/flux-schnell`).
 *      Для community-моделей возвращает 404.
 *
 *   2) `POST /v1/predictions` с `version: "{owner}/{name}:{version_id}"`
 *      или `version: "{version_id}"` — работает для ВСЕХ моделей.
 *
 * Большинство OCR-моделей (включая `lucataco/glm-ocr`) — community-модели,
 * поэтому им нужен путь (2) и предварительный резолв `latest_version.id`
 * через `GET /v1/models/{owner}/{name}`.
 *
 * Чтобы клиенту это не было важно, worker сам определяет тип модели и
 * выбирает правильный путь, кешируя version_id на 30 минут.
 *
 * Переменные окружения (настроить в Cloudflare Dashboard):
 *   - REPLICATE_API_TOKEN: токен от Replicate
 *   - WORKER_SECRET: секрет для авторизации запросов с нашего сервера
 */

const VERSION_CACHE_TTL_MS = 30 * 60 * 1000; // 30 минут
const POLL_TIMEOUT_SEC = 170; // GLM-OCR cold start до 2-3 минут, держим запас
const POLL_INTERVAL_MS = 2000;

const versionCache = new Map(); // model -> { versionId, fetchedAt }

async function resolveLatestVersion(model, replicateToken) {
  const cached = versionCache.get(model);
  if (cached && Date.now() - cached.fetchedAt < VERSION_CACHE_TTL_MS) {
    return cached.versionId;
  }

  const res = await fetch(`https://api.replicate.com/v1/models/${model}`, {
    headers: {
      'Authorization': `Bearer ${replicateToken}`,
    },
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(
      `resolveLatestVersion failed: ${res.status} ${bodyText.slice(0, 200)}`,
    );
  }

  const data = await res.json();
  const versionId = data?.latest_version?.id ?? null;
  // Для некоторых official моделей latest_version === null — Replicate сам
  // управляет версией, и в /v1/predictions можно передать просто owner/name.
  // В таком случае возвращаем null и наверху используем formato version=model.
  versionCache.set(model, { versionId, fetchedAt: Date.now() });
  return versionId;
}

async function pollUntilDone(getUrl, replicateToken) {
  const startMs = Date.now();
  const deadlineMs = startMs + POLL_TIMEOUT_SEC * 1000;
  while (Date.now() < deadlineMs) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const res = await fetch(getUrl, {
      headers: { 'Authorization': `Bearer ${replicateToken}` },
    });
    const data = await res.json();
    if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'canceled') {
      return data;
    }
  }
  throw new Error(`Prediction timeout after ${POLL_TIMEOUT_SEC}s`);
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Worker-Secret',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const workerSecret = request.headers.get('X-Worker-Secret');
    if (!workerSecret || workerSecret !== env.WORKER_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const body = await request.json();
      const { model, version, input } = body;

      if (!input || (typeof input !== 'object')) {
        return new Response(JSON.stringify({ error: 'Missing or invalid input' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!model && !version) {
        return new Response(JSON.stringify({ error: 'Missing model or version' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 1. Если клиент передал готовый version — используем как есть
      //    через универсальный /v1/predictions.
      // 2. Иначе резолвим latest_version.id из /v1/models/{owner}/{name}
      //    (с кешем) и тоже шлём в /v1/predictions с {owner}/{name}:{id}.
      // Это работает и для community, и для official моделей.
      let resolvedVersion = version;
      if (!resolvedVersion) {
        try {
          const versionId = await resolveLatestVersion(model, env.REPLICATE_API_TOKEN);
          // Community model: `owner/name:version_id`
          // Official model без явной версии (latest_version=null): `owner/name`
          resolvedVersion = versionId ? `${model}:${versionId}` : model;
        } catch (resolveErr) {
          return new Response(
            JSON.stringify({
              error: `Cannot resolve model version: ${resolveErr.message}`,
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      }

      const replicateResponse = await fetch(
        'https://api.replicate.com/v1/predictions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait', // ждать до ~60s готовности inline
          },
          body: JSON.stringify({ version: resolvedVersion, input }),
        },
      );

      if (!replicateResponse.ok) {
        const errBody = await replicateResponse.text().catch(() => '');
        return new Response(
          JSON.stringify({
            error: `Replicate API error: ${errBody.slice(0, 300)}`,
            status: replicateResponse.status,
          }),
          {
            status: replicateResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      let result = await replicateResponse.json();

      // Prefer: wait может не дождаться — допиливаем поллингом
      if (
        result.status &&
        result.status !== 'succeeded' &&
        result.status !== 'failed' &&
        result.status !== 'canceled' &&
        result.urls?.get
      ) {
        try {
          result = await pollUntilDone(result.urls.get, env.REPLICATE_API_TOKEN);
        } catch (pollErr) {
          return new Response(
            JSON.stringify({ error: pollErr.message }),
            {
              status: 504,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      }

      if (result.status === 'failed') {
        return new Response(
          JSON.stringify({ error: result.error || 'Prediction failed' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      return new Response(
        JSON.stringify({ output: result.output }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ error: error.message || 'Internal error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }
  },
};
