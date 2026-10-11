/**
 * Uint8Array → base64 编码
 * 用 String.fromCharCode.apply 批量转换 + 数组 join，避免逐字符拼接字符串。
 * 对于 960KB 的音频分片，原来逐字节拼接需 ~96 万次字符串连接，
 * 改为 8KB 块 apply + 单次 join 后减少到 ~120 次数组 push + 1 次 join。
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 8192
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, bytes.length)
    const chunk = bytes.subarray(i, end)
    // String.fromCharCode.apply 比 for 循环逐字符拼接快 10-50 倍
    parts.push(String.fromCharCode.apply(null, chunk as unknown as number[]))
  }
  return btoa(parts.join(''))
}
