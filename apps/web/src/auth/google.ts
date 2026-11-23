type CredentialResponse = { credential?: string };

type GsiId = {
  initialize(config: {
    client_id: string;
    callback: (res: CredentialResponse) => void;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: Record<string, string | number>,
  ): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GsiId } };
  }
}

export const GOOGLE_CLIENT_ID: string | undefined = import.meta.env
  .VITE_GOOGLE_CLIENT_ID;

const SRC = "https://accounts.google.com/gsi/client";

let loading: Promise<GsiId> | null = null;
let handler: ((credential: string) => void) | null = null;

function load(): Promise<GsiId> {
  if (loading) return loading;
  loading = new Promise<GsiId>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.onload = () => {
      const id = window.google?.accounts.id;
      if (!id || !GOOGLE_CLIENT_ID) {
        reject(new Error("google_unavailable"));
        return;
      }
      id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (res) => {
          if (res.credential) handler?.(res.credential);
        },
      });
      resolve(id);
    };
    script.onerror = () => reject(new Error("google_unavailable"));
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** Малює офіційну кнопку Google; повертає функцію відписки. */
export async function renderGoogleButton(
  parent: HTMLElement,
  onCredential: (credential: string) => void,
): Promise<() => void> {
  const id = await load();
  handler = onCredential;
  id.renderButton(parent, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "continue_with",
    width: 280,
  });
  return () => {
    if (handler === onCredential) handler = null;
  };
}
