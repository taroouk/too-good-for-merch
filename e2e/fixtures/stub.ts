// Control of the local Gemini stub (scripts/isolation/gemini-stub.mjs). It listens on 127.0.0.1 only; nothing here can reach Google.
export const STUB = process.env.E2E_GEMINI_STUB_URL ?? "http://127.0.0.1:3199";
export const stub = {
  async mode(mode: "ok" | "http500" | "http429" | "noimage" | "badimage" | "slow") { await fetch(`${STUB}/__mode`, { method: "POST", body: JSON.stringify({ mode }) }); },
  async reset() { await fetch(`${STUB}/__reset`, { method: "POST" }); },
  async stats(): Promise<{ mode: string; calls: number; rejectedNoKey: number; lastBytes: number; modes: string[] }> { return (await fetch(`${STUB}/__stats`)).json(); },
  async available() { try { await this.stats(); return true; } catch { return false; } },
};
