export function createJsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function readTextStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let value = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) return value + decoder.decode()
    value += decoder.decode(chunk.value, { stream: true })
  }
}
