import { useEffect } from "react";
import { createPortal } from "react-dom";

const Modal = ({
  isOpen,
  onClose,
  children,
  title,
  className = "",
  closeOnOverlayClick = false,
  showCloseButton = true,
}) => {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="taskbar-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "taskbar-modal-title" : undefined}
      onMouseDown={(event) => {
        if (
          closeOnOverlayClick &&
          event.target === event.currentTarget
        ) {
          onClose?.();
        }
      }}
    >
      <div
        className={`taskbar-modal ${className}`.trim()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <div className="taskbar-modal-header">
            {title && (
              <h2
                id="taskbar-modal-title"
                className="taskbar-modal-title"
                style={{
                  color: "#ffffff",
                  opacity: 1,
                  visibility: "visible",
                }}
              >
                {title}
              </h2>
            )}

            {showCloseButton && (
              <button
                type="button"
                className="taskbar-modal-close"
                onClick={onClose}
                aria-label="Close"
                style={{
                  color: "#ffffff",
                  opacity: 1,
                  visibility: "visible",
                }}
              >
                ×
              </button>
            )}
          </div>
        )}

        <div className="taskbar-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;