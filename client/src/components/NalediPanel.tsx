import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mic, MicOff, MessageSquareText, X } from "lucide-react";
import { Component, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

type NalediConfig =
  | { enabled: false }
  | { enabled: true; authMode: "session-token" | "widget"; personaId: string };

type ModuleContext = {
  learnerId: string;
  moduleId: number;
  moduleTitle: string;
  content: { text: string; moduleType: string; courseId: number; courseTitle: string };
  contentVersion: string;
  instruction: { character: string; role: string; rules: string[] };
  briefing: string;
};

type AnamClientLike = {
  streamToVideoElement: (id: string) => Promise<void>;
  stopStreaming: () => void | Promise<void>;
  sendUserMessage?: (message: string) => void;
  addContext?: (message: string) => void;
  isStreaming?: () => boolean;
};

class NalediErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function loadWidgetScript(): Promise<void> {
  if (typeof customElements !== "undefined" && customElements.get("anam-agent")) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-anam-widget]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("widget-load-failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@anam-ai/agent-widget";
    script.async = true;
    script.dataset.anamWidget = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("widget-load-failed"));
    document.body.appendChild(script);
  });
}

function TalkToNalediInner({ courseId }: { courseId: number }) {
  const [config, setConfig] = useState<NalediConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "text" | "error">("idle");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState("");
  const [micDenied, setMicDenied] = useState(false);
  const clientRef = useRef<AnamClientLike | null>(null);
  const widgetHostRef = useRef<HTMLDivElement | null>(null);
  const videoId = "naledi-persona-video";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/naledi/config", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return { enabled: false } as NalediConfig;
        const body = await readJson(response);
        if (body.enabled !== true || typeof body.personaId !== "string" || !body.personaId) {
          return { enabled: false } as NalediConfig;
        }
        return {
          enabled: true,
          authMode: body.authMode === "session-token" ? "session-token" : "widget",
          personaId: body.personaId,
        } satisfies NalediConfig;
      })
      .then((next) => {
        if (!cancelled) setConfig(next);
      })
      .catch(() => {
        if (!cancelled) setConfig({ enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopSession = useCallback(() => {
    const client = clientRef.current;
    clientRef.current = null;
    try {
      void client?.stopStreaming();
    } catch {
      // Renderer teardown must never reach the course workspace.
    }
    if (widgetHostRef.current) widgetHostRef.current.replaceChildren();
    setStatus("idle");
  }, []);

  useEffect(() => {
    if (!open) stopSession();
  }, [open, stopSession]);

  useEffect(() => () => stopSession(), [stopSession]);

  const startSdk = useCallback(
    async (sessionToken: string, briefing: string, allowMic: boolean) => {
      const mod = await import("@anam-ai/js-sdk");
      const createClient = (mod as { createClient: (token: string, opts?: { disableInputAudio?: boolean }) => AnamClientLike }).createClient;
      const client = createClient(sessionToken, allowMic ? undefined : { disableInputAudio: true });
      clientRef.current = client;
      await client.streamToVideoElement(videoId);
      try {
        client.addContext?.(briefing);
      } catch {
        client.sendUserMessage?.(briefing);
      }
      setStatus(allowMic ? "live" : "text");
    },
    []
  );

  const startWidget = useCallback(async (personaId: string, sessionToken?: string) => {
    await loadWidgetScript();
    const host = widgetHostRef.current;
    if (!host) throw new Error("widget-host-missing");
    host.replaceChildren();
    const agent = document.createElement("anam-agent");
    agent.setAttribute("agent-id", personaId);
    agent.setAttribute("layout", "inline");
    if (sessionToken) agent.setAttribute("session-token", sessionToken);
    host.appendChild(agent);
    setStatus(micDenied ? "text" : "live");
  }, [micDenied]);

  const start = useCallback(async () => {
    if (!config || config.enabled !== true) return;
    setStatus("connecting");
    setMessage("");
    let micOk = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      micOk = true;
      setMicDenied(false);
    } catch {
      setMicDenied(true);
    }

    let context: ModuleContext | null = null;
    try {
      const contextRes = await fetch(`/api/naledi/current-module?courseId=${courseId}`, {
        credentials: "include",
      });
      if (contextRes.ok) context = (await contextRes.json()) as ModuleContext;
    } catch {
      // Teaching still works from the written module list if context-fetch fails.
    }

    const briefing = context?.briefing ?? "";

    try {
      const tokenRes = await fetch("/api/naledi/session-token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const tokenBody = await readJson(tokenRes);

      if (tokenRes.ok && typeof tokenBody.sessionToken === "string") {
        try {
          await startSdk(tokenBody.sessionToken, briefing, micOk);
          return;
        } catch {
          await startWidget(config.personaId, tokenBody.sessionToken);
          return;
        }
      }

      if (tokenBody.fallback === "widget" || config.authMode === "widget") {
        await startWidget(config.personaId);
        return;
      }

      setStatus("error");
      setMessage("Naledi is unavailable right now. Continue with the written course steps.");
    } catch {
      setStatus("error");
      setMessage("Naledi is unavailable right now. Continue with the written course steps.");
    }
  }, [config, courseId, startSdk, startWidget]);

  const sendText = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    try {
      clientRef.current?.sendUserMessage?.(text);
    } catch {
      setMessage("Could not send that message. Try again, or use the written course steps.");
    }
    setDraft("");
  }, [draft]);

  if (!config || config.enabled !== true) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void start();
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-[#093B88] bg-white px-4 py-2.5 text-sm font-extrabold text-[#093B88] transition-colors hover:bg-[#093B88] hover:text-white"
      >
        Talk to Naledi
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg sm:max-w-lg" aria-describedby="naledi-panel-copy">
          <DialogHeader>
            <DialogTitle className="text-[#093B88]">Talk to Naledi</DialogTitle>
            <DialogDescription id="naledi-panel-copy">
              Naledi is a Maximed teaching colleague for this module. She does not diagnose, invent product claims, or mark the course complete.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-xl bg-slate-950">
            <video id={videoId} autoPlay playsInline className="aspect-video w-full bg-slate-950" />
            <div ref={widgetHostRef} className="min-h-0" />
          </div>
          {status === "connecting" ? (
            <p className="text-sm text-slate-600">Connecting Naledi…</p>
          ) : null}
          {status === "error" ? <p className="text-sm text-[#DA0000]">{message}</p> : null}
          {micDenied || status === "text" ? (
            <p className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
              <MicOff className="h-3.5 w-3.5" />
              Microphone unavailable. Type instead.
            </p>
          ) : status === "live" ? (
            <p className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700">
              <Mic className="h-3.5 w-3.5" />
              Microphone on. You can also type.
            </p>
          ) : null}
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  sendText();
                }
              }}
              placeholder="Type a question for Naledi"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={sendText}
              className="inline-flex items-center gap-1 rounded-xl bg-[#093B88] px-3 py-2 text-sm font-extrabold text-white"
            >
              <MessageSquareText className="h-4 w-4" />
              Send
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1 text-sm font-extrabold text-slate-500"
          >
            <X className="h-4 w-4" />
            Close — course steps stay available
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NalediPanel({ courseId }: { courseId: number }) {
  return (
    <NalediErrorBoundary>
      <TalkToNalediInner courseId={courseId} />
    </NalediErrorBoundary>
  );
}
