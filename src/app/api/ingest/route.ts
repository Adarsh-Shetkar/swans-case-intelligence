import { NextResponse } from 'next/server';
import { syncSapiniMatter } from '@/lib/ingest/sync';

export async function POST() {
  try {
    const result = await syncSapiniMatter();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Ingestion failure:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}