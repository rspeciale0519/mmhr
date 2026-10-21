type Cookie = { name: string; value: string; options: { maxAge?: number } };

/** Mirrors cookie writes within one launcher response, including MFA token chunk changes. */
export function createLocalFixtureCookies(header: string, options: { freshLocalSession?: boolean } = {}) {
  const jar = new Map<string, string>();
  const writes = new Map<string, Cookie>();
  for (const part of header.split(";")) {
    const cookie = part.trim();
    const separator = cookie.indexOf("=");
    if (separator < 1 || !cookie.startsWith("sb-")) continue;
    const name = cookie.slice(0, separator);
    // Different disposable ports share the SDK's hostname-based cookie key.
    // A deliberate role login must not refresh a destroyed fixture's session.
    if (options.freshLocalSession && /^sb-127-auth-token(?:\.[0-9]+)?$/.test(name)) {
      writes.set(name, { name, value: "", options: { maxAge: 0 } });
      continue;
    }
    jar.set(name, decodeURIComponent(cookie.slice(separator + 1)));
  }
  return {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (items: Cookie[]) => {
      for (const item of items) {
        writes.set(item.name, item);
        if (item.options.maxAge === 0) jar.delete(item.name);
        else jar.set(item.name, item.value);
      }
    },
    responseCookies: () => [...writes.values()],
  };
}
