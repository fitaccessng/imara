import { Navigate } from "react-router-dom";

export function UserManagementPage() {
  return <Navigate to="/admin/users" replace />;
}

export default UserManagementPage;
