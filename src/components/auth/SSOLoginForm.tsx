import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Fingerprint } from "lucide-react";
import { Button, Input } from "../ui";
import { ssoApi } from "../../api/sso";
import { useAuthStore } from "../../stores/authStore";
import { authApi } from "../../api/auth";
import type { User } from "../../types";

interface SSOLoginFormProps {
  onSwitchToRegular: () => void;
}

export const SSOLoginForm: React.FC<SSOLoginFormProps> = ({
  onSwitchToRegular,
}) => {
  const { t } = useTranslation();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const setUser = useAuthStore((state) => state.setUser);

  const ssoLoginSchema = z.object({
    national_id: z.string().min(1, t("auth.nationalId")),
    password: z.string().min(1, t("auth.passwordMinLength")),
  });

  type SSOLoginFormData = z.infer<typeof ssoLoginSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SSOLoginFormData>({
    resolver: zodResolver(ssoLoginSchema),
  });

  const onSubmit = async (data: SSOLoginFormData) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await ssoApi.login({
        national_id: data.national_id,
        password: data.password,
      });
      if (response.success && response.data) {
        setAuth(
          response.data.user as unknown as User,
          response.data.token,
          response.data.refresh_token,
        );
        try {
          const profileResp = await authApi.getProfile();
          if (profileResp.success && profileResp.data) {
            setUser(profileResp.data);
          }
        } catch {}
        navigate("/dashboard");
      } else {
        setError(response.error || t("auth.loginError"));
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : t("auth.loginError");
      if (typeof err === "object" && err !== null && "response" in err) {
        const axiosError = err as { response?: { data?: { error?: string } } };
        setError(axiosError.response?.data?.error || errorMessage);
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-fade-in-up">
      <div className="mb-8">
        <h1 className="text-3xl font-bold ">{t("auth.ssoLoginTitle")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("auth.ssoLoginSubtitle")}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 mt-0.5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <span className="text-red-600 text-xs font-bold">!</span>
            </div>
            <div>
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <Input
          label={t("auth.nationalId")}
          placeholder={t("auth.nationalIdPlaceholder")}
          error={errors.national_id?.message}
          leftIcon={<Fingerprint className="w-5 h-5" />}
          {...register("national_id")}
        />

        <Input
          label={t("auth.password")}
          type="password"
          placeholder={t("auth.passwordPlaceholder")}
          error={errors.password?.message}
          leftIcon={<Fingerprint className="w-5 h-5" />}
          {...register("password")}
        />

        <Button
          type="submit"
          size="lg"
          fullWidth
          isLoading={isLoading}
          rightIcon={!isLoading && <ArrowRight className="w-5 h-5" />}
        >
          {t("auth.signIn")}
        </Button>
      </form>

      <p className="mt-8 text-center text-gray-600">
        <button
          type="button"
          onClick={onSwitchToRegular}
          className="font-semibold text-blue-600 hover:text-blue-700 transition-colors"
        >
          {t("auth.switchToRegular")}
        </button>
      </p>
    </div>
  );
};
