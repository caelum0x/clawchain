import useCopyClipboard from "../hooks/useCopyClipboard.ts";

interface CopyButtonProps {
  text: string;
  label?: string;
}

export default function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, copy] = useCopyClipboard();

  return (
    <button
      className="copy-btn"
      onClick={() => copy(text)}
      title={copied ? "Copied!" : label || "Copy to clipboard"}
      aria-label={copied ? "Copied" : label || "Copy to clipboard"}
    >
      {copied ? "\u2713" : "\u2398"}
    </button>
  );
}
