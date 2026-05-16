import type { APIRoute } from 'astro';
import { listAuditLog } from '@/lib/products';

export const prerender = false;

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export const GET: APIRoute = async ({ cookies }) => {
  const rows = await listAuditLog(cookies, { limit: 5000 });
  const header = ['ts', 'actor', 'action', 'target_type', 'target_id', 'note', 'before', 'after'];
  const body = [header.join(',')];
  for (const r of rows as any[]) {
    body.push([
      escapeCsv(r.ts),
      escapeCsv(r.actor),
      escapeCsv(r.action),
      escapeCsv(r.target_type),
      escapeCsv(r.target_id),
      escapeCsv(r.note),
      escapeCsv(r.before),
      escapeCsv(r.after),
    ].join(','));
  }
  return new Response(body.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="surface-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
};
