import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPostForm, apiPostPdf } from './client';
import type {
  OcrProvider,
  UploadResponse,
  VehicleDetail,
  VehicleFieldValues,
  VehicleSummary,
} from './types';

export function useUploadMalso() {
  return useMutation({
    mutationFn: async ({ file, provider }: { file: File; provider: OcrProvider }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('provider', provider);
      return apiPostForm<UploadResponse>('/api/malso', form);
    },
  });
}

export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: ['vehicle', id],
    queryFn: ({ signal }) => apiGet<VehicleDetail>(`/api/malso/${id}`, signal),
    enabled: !!id,
  });
}

export function usePatchVehicle(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: VehicleFieldValues) =>
      apiPatch<{ vehicle: VehicleDetail['vehicle'] }>(`/api/malso/${id}`, { fields }),
    onSuccess: (data) => {
      qc.setQueryData<VehicleDetail>(['vehicle', id], (prev) =>
        prev ? { ...prev, vehicle: data.vehicle } : prev,
      );
    },
  });
}

export function useGeneratePdf(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields?: VehicleFieldValues) =>
      apiPostPdf(`/api/malso/${id}/pdf`, fields ? { fields } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle', id] });
    },
  });
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) =>
      apiGet<VehicleSummary[]>(`/api/malso/search?q=${encodeURIComponent(q)}`, signal),
    placeholderData: keepPreviousData,
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/malso/${id}`),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: ['vehicle', id] });
      qc.invalidateQueries({ queryKey: ['search'] });
    },
  });
}
