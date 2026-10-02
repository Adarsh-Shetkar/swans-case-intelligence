import { NextResponse } from 'next/server';
import { syncSapiniMatter } from '@/lib/ingest/sync';
import { runDigest } from '@/lib/ai/run-digest';
import { prismaDigestRepository } from '@/lib/ai/prisma-repository';

export async function POST() {
  try {
    const result = await syncSapiniMatter();
    // Incremental: makes zero AI calls when no record changed since the last run.
    const digest = await runDigest(result.matterId, prismaDigestRepository);
    return NextResponse.json({ success: true, ...result, digest });
  } catch (error: any) {
    console.error('Ingestion failure:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
