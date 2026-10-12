export type ProviderErrorCode =
  'timeout' | 'aborted' | 'rate_limited' | 'bad_response' | 'schema_mismatch' | 'upstream_error'

const messages: Record<ProviderErrorCode, string> = {
  timeout: '模型调用超时，请稍后重试',
  aborted: '模型调用已取消',
  rate_limited: '模型服务请求过于频繁，请稍后重试',
  bad_response: '模型输入或回复格式无效，请检查配置',
  schema_mismatch: '模型回复不符合要求的数据格式',
  upstream_error: '模型服务暂时不可用，请检查配置或稍后重试',
}

/** Only safe, locally generated messages; never attach upstream errors or causes. */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message = messages[code],
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}
