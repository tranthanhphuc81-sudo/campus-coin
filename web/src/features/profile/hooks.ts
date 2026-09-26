import {
  authUserSchema,
  updateProfileInputSchema,
  type AuthUser,
  type UpdateProfileInput,
} from "@campus-coin/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";

const profileQueryKey = ["profile"] as const;

export function useProfile() {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: async (): Promise<AuthUser> => {
      const response = await api.get("/me");
      return authUserSchema.parse(response.data);
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateProfileInput): Promise<AuthUser> => {
      const parsedPayload = updateProfileInputSchema.parse(payload);
      const response = await api.patch("/me", parsedPayload);
      return authUserSchema.parse(response.data);
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(profileQueryKey, profile);
    },
  });
}
