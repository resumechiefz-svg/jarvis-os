// Call this from any agent or API route to push a notification to AB
export async function pushNotify(
  title: string,
  message: string,
  options?: { tag?: string; urgent?: boolean; url?: string }
): Promise<void> {
  try {
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'notify',
        title,
        message,
        tag: options?.tag ?? 'jarvis',
        urgent: options?.urgent ?? false,
        url: options?.url ?? '/',
      }),
    })
  } catch {
    // Silent fail — push is best effort
  }
}
