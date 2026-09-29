/**
 * api.ts
 * Thin wrappers around `/tips/*` (docs/spec/05b §5.10): the current period's ranked savings tips,
 * plus pin/unpin/dismiss actions. Mirrors `features/reports/api.ts`'s shape.
 * Exports: getTips, pinTip, unpinTip, dismissTip
 * Spec: docs/spec/05b §5.10 · docs/spec/07 §7.3.3 (tips routes)
 */
import type { TipDto, TipListResponse } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /tips` — current period only, dismissed tips already excluded server-side. */
export async function getTips(): Promise<TipListResponse> {
  const response = await apiClient.get<TipListResponse>('/tips');
  return response.data;
}

/** `POST /tips/:id/pin`. */
export async function pinTip(id: string): Promise<TipDto> {
  const response = await apiClient.post<TipDto>(`/tips/${id}/pin`);
  return response.data;
}

/** `POST /tips/:id/unpin`. */
export async function unpinTip(id: string): Promise<TipDto> {
  const response = await apiClient.post<TipDto>(`/tips/${id}/unpin`);
  return response.data;
}

/** `POST /tips/:id/dismiss` — hides the tip for 30 days (`dismissedUntil`). */
export async function dismissTip(id: string): Promise<TipDto> {
  const response = await apiClient.post<TipDto>(`/tips/${id}/dismiss`);
  return response.data;
}
