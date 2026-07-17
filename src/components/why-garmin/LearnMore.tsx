"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface LearnMoreProps {
  /** GA/name attribute used on the original site */
  name: string;
  /** Uppercase heading shown inside the modal */
  title: string;
  /** Body paragraph */
  body: string;
  /** Optional small print shown under the body */
  note?: string;
  /** Optional disclaimer rendered inline under the link (supports markup) */
  disclaimer?: React.ReactNode;
}

/**
 * Reproduces the ".learn-more" link + fancybox popup from the original minisite.
 * The link matches `section .learn-more`; the modal mimics fancybox's centered
 * white panel holding the hidden `.learn-more-content`.
 */
export function LearnMore({ name, title, body, note, disclaimer }: LearnMoreProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <a
        className="learn-more"
        href="javascript:void(0);"
        data-name={`${name}-Learn More`}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        Learn More <span className="icon-cancel-circled" />
      </a>
      {disclaimer && <small className="disclaimer">{disclaimer}</small>}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="wg-root">
            <div className="wg-modal-overlay" onClick={() => setOpen(false)}>
              <div className="wg-modal" onClick={(e) => e.stopPropagation()}>
                <button
                  className="wg-modal-close"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  &times;
                </button>
                <div className="learn-more-content wg-modal-content">
                  <h3 className="uppercase">{title}</h3>
                  <p>{body}</p>
                  {note && <small>{note}</small>}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
