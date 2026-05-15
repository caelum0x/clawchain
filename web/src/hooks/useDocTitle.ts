import { useEffect } from "react";

export default function useDocTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | ClawChain` : "ClawChain";
    return () => {
      document.title = prev;
    };
  }, [title]);
}
