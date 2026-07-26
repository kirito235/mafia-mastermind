import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  /** If true, clicking the backdrop closes the modal. Defaults true. */
  dismissOnBackdrop?: boolean;
};

export function Modal({ open, onClose, children, dismissOnBackdrop = true }: Props) {
  if (!open) return null;
  return (
    <div
      onClick={(e) => {
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          maxHeight: "85vh",
          overflowY: "auto",
          background: "var(--paper)",
          color: "#2a2620",
          borderRadius: 8,
          padding: "22px 20px 24px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
          position: "relative",
        }}
      >
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "1px solid #8a8474",
              background: "var(--paper)",
              color: "#2a2620",
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function ModalDivider() {
  return <div style={{ height: 1, background: "var(--paper-dim)", margin: "14px 0" }} />;
}
