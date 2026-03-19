import { useEffect } from "react";
import { createPortal } from "react-dom";

interface AttachmentImageLightboxProps {
  alt: string;
  onClose: () => void;
  src: string;
}

export function AttachmentImageLightbox({
  alt,
  onClose,
  src,
}: AttachmentImageLightboxProps) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="titlebar-no-drag fixed inset-0 z-[220] bg-stone-950/78 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`查看图片 ${alt}`}
      onClick={onClose}
    >
      <button
        type="button"
        className="titlebar-no-drag fixed right-5 top-16 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/90 shadow-lg transition-colors hover:bg-black/55"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="关闭图片预览"
        title="关闭"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div
        className="titlebar-no-drag flex h-full w-full items-center justify-center p-5 sm:p-8"
      >
        <figure
          className="titlebar-no-drag max-h-full max-w-[min(90vw,1100px)] overflow-hidden rounded-[28px] bg-white/96 p-3 shadow-[0_28px_90px_rgba(0,0,0,0.35)] sm:p-4"
          onClick={(event) => event.stopPropagation()}
        >
          <img
            src={src}
            alt={alt}
            className="block max-h-[78vh] max-w-full rounded-[20px] bg-stone-100 object-contain"
          />
          <figcaption className="px-1 pt-3 text-center text-[13px] text-stone-500">
            {alt}
          </figcaption>
        </figure>
      </div>
    </div>,
    document.body
  );
}
