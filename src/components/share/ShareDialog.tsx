"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProviderView } from "./ProviderView";
import { SHARE_CATEGORIES } from "@/lib/share/categories";
import { ago } from "@/lib/format";
import type { ProviderViewData, ShareCategory, ShareSummary } from "@/lib/api-contract";

const JSON_HEADERS = { "Content-Type": "application/json" };

export function ShareDialog({ matterId }: { matterId: string }) {
  const base = `/api/matters/${matterId}`;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cats, setCats] = useState<ShareCategory[]>(
    SHARE_CATEGORIES.filter((c) => c.defaultOn).map((c) => c.key)
  );
  const [requestsText, setRequestsText] = useState("");
  const [preview, setPreview] = useState<ProviderViewData | null>(null);
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const requests = requestsText.split("\n").map((s) => s.trim()).filter(Boolean);
  const payload = JSON.stringify({ providerName: name.trim() || "Provider", visibleCategories: cats, requests });

  const loadShares = useCallback(async () => {
    const res = await fetch(`${base}/shares`, { cache: "no-store" });
    if (res.ok) setShares(await res.json());
  }, [base]);

  useEffect(() => { if (open) loadShares(); }, [open, loadShares]);

  // Live preview, debounced: re-runs whenever a switch or field changes.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const res = await fetch(`${base}/preview`, { method: "POST", headers: JSON_HEADERS, body: payload });
      if (res.ok) setPreview(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [open, base, payload]);

  const toggle = (k: ShareCategory) =>
    setCats((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  async function create() {
    setBusy(true);
    try {
      const res = await fetch(`${base}/shares`, { method: "POST", headers: JSON_HEADERS, body: payload });
      if (res.ok) {
        const s: ShareSummary = await res.json();
        setLink(`${window.location.origin}/share/${s.id}`);
        loadShares();
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`${base}/shares?shareId=${id}`, { method: "DELETE" });
    loadShares();
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Share2 className="mr-2 h-4 w-4" /> Share with provider
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader><DialogTitle>Share with a medical provider</DialogTitle></DialogHeader>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-medium">Provider name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cohen & Kramer Physical Therapy" />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">What they can see</p>
                <ul className="space-y-3">
                  {SHARE_CATEGORIES.map((c) => (
                    <li key={c.key} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm">{c.label}</p>
                        <p className="text-xs text-muted-foreground">{c.hint}</p>
                      </div>
                      <Switch checked={cats.includes(c.key)} onCheckedChange={() => toggle(c.key)} />
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Never shared: case strategy, AI digest, case value, firm spend, internal notes and sources.
                </p>
              </div>

              {cats.includes("requests") && (
                <div>
                  <label className="mb-1 block text-sm font-medium">What the firm needs from their office (one per line)</label>
                  <Textarea rows={3} value={requestsText} onChange={(e) => setRequestsText(e.target.value)}
                    placeholder={"Updated itemized bill\nPT progress notes since June"} />
                </div>
              )}

              <Button onClick={create} disabled={busy || !name.trim()}>Create secure link</Button>

              {link && (
                <div className="flex items-center gap-2 rounded-lg border p-2 text-xs">
                  <span className="flex-1 truncate">{link}</span>
                  <Button size="sm" variant="outline" onClick={() => copy(link)}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              )}

              {shares.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">Shared so far</p>
                  <ul className="space-y-2">
                    {shares.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                        <div>
                          <p className="font-medium">{s.providerName}{s.revoked && " (revoked)"}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.viewCount === 0
                              ? "Not opened yet"
                              : `Opened ${s.viewCount}×${s.lastViewedAt ? ` · last ${ago(s.lastViewedAt)}` : ""}`}
                          </p>
                        </div>
                        {!s.revoked && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => copy(`${window.location.origin}/share/${s.id}`)}>Copy link</Button>
                            <Button size="sm" variant="ghost" onClick={() => revoke(s.id)}>Revoke</Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Exactly what the provider will see
              </p>
              {preview ? <ProviderView view={preview} /> : <p className="text-sm text-muted-foreground">Loading preview…</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}