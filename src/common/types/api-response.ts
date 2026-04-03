export type ApiResponseMeta = {
  page?: number;
  pageSize?: number;
  total?: number;
};

export type ApiResponseFieldErrors = Record<string, string[] | undefined>;

export type ApiResponseError =
  | string
  | {
      message: string;
      errors?: ApiResponseFieldErrors;
    };

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiResponseError;
  meta?: ApiResponseMeta;
}

export function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  return typeof value === 'object' && value !== null && 'success' in value;
}

export function wrapSuccess<T>(
  data: T,
  meta?: ApiResponseMeta,
): ApiResponse<T> {
  return meta === undefined
    ? { success: true, data }
    : { success: true, data, meta };
}

export function wrapError(
  error: ApiResponseError,
  meta?: ApiResponseMeta,
): ApiResponse<never> {
  return meta === undefined
    ? { success: false, error }
    : { success: false, error, meta };
}
