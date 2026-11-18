import { LoginForm } from "./LoginForm";

type Props = {
  initialMode: "login" | "signup";
  onClose: () => void;
};

export function AuthDialog({ initialMode, onClose }: Props) {
  return (
    <dialog
      className="modal"
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      onClose={onClose}
    >
      <LoginForm collection="fans" initialMode={initialMode} onDone={onClose} />
      <button className="link" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}
