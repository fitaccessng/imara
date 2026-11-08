import { Link } from "react-router-dom";

export function PlanLimitMessage({ message }: { message: string }) {
  const action = message.includes("/contact")
    ? { path: "/contact", label: "Contact sales" }
    : message.includes("/pricing")
      ? { path: "/pricing", label: "Compare plans" }
      : null;
  const visibleMessage = action ? message.replace(` at ${action.path}`, "") : message;

  return (
    <>
      {visibleMessage}
      {action && <> <Link to={action.path}>{action.label}</Link>.</>}
    </>
  );
}
