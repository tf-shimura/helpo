export function serializeSessionCookie(token: string, isSecure: boolean): string {
  const secure = isSecure ? '; Secure' : ''
  return `helpo_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure}`
}

export function clearSessionCookie(isSecure: boolean): string {
  const secure = isSecure ? '; Secure' : ''
  return `helpo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
}
