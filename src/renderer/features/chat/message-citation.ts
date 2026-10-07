/** Internal chat references carry no filesystem or native capability. */
export function messageCitationId(value: string): string | null {
  const prefix = '#chat-message-';
  if (!value.startsWith(prefix)) return null;
  try {
    const id = decodeURIComponent(value.slice(prefix.length));
    return id &&
      id.length <= 512 &&
      !Array.from(id).some((letter) => letter.charCodeAt(0) < 32 || letter.charCodeAt(0) === 127)
      ? id
      : null;
  } catch {
    return null;
  }
}
