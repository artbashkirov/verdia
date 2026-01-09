/**
 * Cloudflare Worker - Прокси для Replicate API
 * 
 * Этот Worker принимает запросы от вашего VPS и перенаправляет их к Replicate API.
 * Благодаря тому, что Cloudflare серверы находятся по всему миру (включая США/Европу),
 * запросы к Replicate будут проходить без блокировок.
 * 
 * Переменные окружения (настроить в Cloudflare Dashboard):
 * - REPLICATE_API_TOKEN: ваш токен от Replicate
 * - WORKER_SECRET: секретный ключ для авторизации запросов с вашего сервера
 */

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Worker-Secret',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify worker secret
    const workerSecret = request.headers.get('X-Worker-Secret');
    if (!workerSecret || workerSecret !== env.WORKER_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const body = await request.json();
      const { model, input } = body;

      if (!model || !input) {
        return new Response(JSON.stringify({ error: 'Missing model or input' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Call Replicate API
      const replicateResponse = await fetch(
        `https://api.replicate.com/v1/models/${model}/predictions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait', // Wait for the prediction to complete
          },
          body: JSON.stringify({ input }),
        }
      );

      // If prediction started but not completed, poll for result
      if (replicateResponse.status === 201) {
        const prediction = await replicateResponse.json();
        
        // Poll for completion (max 60 seconds)
        let result = prediction;
        let attempts = 0;
        const maxAttempts = 60;
        
        while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const pollResponse = await fetch(result.urls.get, {
            headers: {
              'Authorization': `Bearer ${env.REPLICATE_API_TOKEN}`,
            },
          });
          result = await pollResponse.json();
          attempts++;
        }

        if (result.status === 'failed') {
          return new Response(JSON.stringify({ error: result.error || 'Prediction failed' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ output: result.output }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Handle immediate response or error
      const data = await replicateResponse.json();
      
      if (!replicateResponse.ok) {
        return new Response(JSON.stringify({ 
          error: data.detail || data.error || 'Replicate API error',
          status: replicateResponse.status 
        }), {
          status: replicateResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Return output
      return new Response(JSON.stringify({ output: data.output }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
