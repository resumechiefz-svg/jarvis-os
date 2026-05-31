/**
 * Vector Memory — semantic search over Jarvis memories
 * Uses OpenAI text-embedding-3-small + Supabase pgvector
 * Replaces keyword search with meaning-based retrieval
 *
 * Setup (run once in Supabase SQL editor):
 *   create extension if not exists vector;
 *   alter table ai_memories add column if not exists embedding vector(1536);
 *   create index if not exists memories_embedding_idx
 *     on ai_memories using ivfflat (embedding vector_cosine_ops) with (lists = 100);
 */
import OpenAI from 'openai'
import { supabaseAdmin } from '../supabase/client'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ── Embed a string → 1536-dim float array ────────────────
export async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000), // token safety
  })
  return res.data[0].embedding
}

// ── Save memory with embedding ────────────────────────────
export async function saveMemory(opts: {
  category: string
  content: string
  context?: string
  importance?: number
}): Promise<void> {
  const embedding = await embed(`${opts.category}: ${opts.content}`)

  await supabaseAdmin.from('ai_memories').upsert({
    category: opts.category,
    content: opts.content,
    context: opts.context ?? null,
    importance: opts.importance ?? 5,
    embedding,
    created_at: new Date().toISOString(),
  })
}

// ── Semantic search — find memories by meaning ─────────────
export async function searchMemories(query: string, opts?: {
  limit?: number
  category?: string
  minSimilarity?: number
}): Promise<Array<{
  category: string
  content: string
  context: string | null
  importance: number
  similarity: number
}>> {
  const { limit = 8, minSimilarity = 0.3 } = opts ?? {}
  const queryEmbedding = await embed(query)

  // Try pgvector similarity search first
  try {
    const { data, error } = await supabaseAdmin.rpc('match_memories', {
      query_embedding: queryEmbedding,
      match_threshold: minSimilarity,
      match_count: limit,
      filter_category: opts?.category ?? null,
    })

    if (!error && data?.length) return data
  } catch {
    // pgvector not set up yet — fall back to keyword search
  }

  // Fallback: keyword search
  let q = supabaseAdmin
    .from('ai_memories')
    .select('category, content, context, importance')
    .order('importance', { ascending: false })
    .limit(limit)

  if (opts?.category) q = q.eq('category', opts.category)

  const { data } = await q
  return (data ?? []).map(d => ({ ...d, similarity: 0.5 }))
}

// ── Supabase SQL to run once (paste into SQL editor) ──────
export const SETUP_SQL = `
-- Enable pgvector
create extension if not exists vector;

-- Add embedding column to ai_memories
alter table ai_memories add column if not exists embedding vector(1536);

-- Create vector similarity index
create index if not exists memories_embedding_idx
  on ai_memories using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Semantic search function
create or replace function match_memories(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_category text default null
)
returns table (
  category text,
  content text,
  context text,
  importance int,
  similarity float
)
language plpgsql as $$
begin
  return query
  select
    m.category::text,
    m.content::text,
    m.context::text,
    m.importance::int,
    1 - (m.embedding <=> query_embedding) as similarity
  from ai_memories m
  where
    m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) > match_threshold
    and (filter_category is null or m.category = filter_category)
  order by m.embedding <=> query_embedding
  limit match_count;
end;
$$;
`
