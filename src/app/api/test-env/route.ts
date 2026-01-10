import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const workerUrl = typeof process !== 'undefined' && process.env ? (process.env.CLOUDFLARE_WORKER_URL || 'NOT SET') : 'PROCESS NOT AVAILABLE';
    const workerSecret = typeof process !== 'undefined' && process.env && process.env.CLOUDFLARE_WORKER_SECRET ? 'SET' : 'NOT SET';
    
    return NextResponse.json({
      message: 'Endpoint works',
      workerUrl,
      workerSecret,
      nodeEnv: typeof process !== 'undefined' && process.env ? process.env.NODE_ENV : 'NOT AVAILABLE',
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error?.message || 'Unknown error',
      stack: error?.stack,
    }, { status: 500 });
  }
}
