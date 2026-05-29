import { useEffect, useRef, useState } from "react";
import { sendCommand } from "../api/client";
import { WS_URL } from "../api/client";
import { Terminal, Send, Trash2, Copy, Check } from "lucide-react";

export default function ConsolePage() {
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef(null);
  const wsRef = useRef(null);

  function copyAll() {
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      setLines((prev) => [...prev.slice(-999), e.data]);
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const submit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const cmd = input.trim();
    setHistory((h) => [cmd, ...h.slice(0, 49)]);
    setHistIdx(-1);
    setInput("");
    try {
      await sendCommand(cmd);
    } catch {
      setLines((prev) => [...prev, "[Error] Failed to send command."]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(idx);
      setInput(history[idx] ?? "");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(histIdx - 1, -1);
      setHistIdx(idx);
      setInput(idx === -1 ? "" : history[idx]);
    }
  };

  function lineColor(line) {
    if (line.includes("[Error]") || line.includes("ERROR")) return "text-red-400";
    if (line.includes("[Warn]") || line.includes("WARNING")) return "text-yellow-400";
    if (line.startsWith("[") && line.includes("] >")) return "text-rust-400";
    if (line.includes("joined") || line.includes("connected")) return "text-green-400";
    if (line.includes("left") || line.includes("disconnected")) return "text-orange-400";
    return "text-gray-300";
  }

  return (
    <div className="p-6 flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Server Console</h2>
          <p className="text-sm text-gray-500">Live server output and command input</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-1.5 text-xs font-medium ${
              connected ? "text-green-400" : "text-red-400"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-green-400 animate-pulse" : "bg-red-400"
              }`}
            />
            {connected ? "Connected" : "Disconnected"}
          </span>
          <button
            className="btn-secondary text-sm py-1.5"
            onClick={copyAll}
            title="Copier tout"
            disabled={lines.length === 0}
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copied ? "Copié !" : "Copier"}
          </button>
          <button
            className="btn-secondary text-sm py-1.5"
            onClick={() => setLines([])}
            title="Clear console"
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>
      </div>

      {/* Console output */}
      <div className="flex-1 card bg-surface-900 font-mono text-xs overflow-y-auto min-h-0 rounded-xl">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <Terminal size={32} />
            <span>No output yet. Start the server to see logs.</span>
          </div>
        ) : (
          <div className="p-4 space-y-0.5 select-text">
            {lines.map((line, i) => (
              <div key={i} className={`leading-5 ${lineColor(line)}`}>
                {line}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={submit} className="flex gap-3">
        <div className="flex-1 relative">
          <Terminal
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            className="input pl-9 font-mono text-sm"
            placeholder="Enter RCON command... (↑↓ for history)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
        <button type="submit" className="btn-primary" disabled={!input.trim()}>
          <Send size={15} />
          Send
        </button>
      </form>
    </div>
  );
}
