import { Route, Routes } from "react-router-dom";

import { adminRoutes, publicRoutes, studentRoutes } from "@/app/routes";
import ProtectedRoute from "@/app/ProtectedRoute";
import RouteTransition from "@/app/RouteTransition";
import AdminLayout from "@/layouts/AdminLayout";
import PublicLayout from "@/layouts/PublicLayout";
import StudentLayout from "@/layouts/StudentLayout";
import NotFoundPage from "@/pages/errors/NotFoundPage";

export default function App() {
  return (
    <RouteTransition>
      <Routes>
        <Route element={<PublicLayout />}>
          {publicRoutes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={route.element}
              handle={route.handle}
            />
          ))}
        </Route>

        <Route element={<ProtectedRoute allow={["student"]} />}>
          <Route element={<StudentLayout />}>
            {studentRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={route.element}
                handle={route.handle}
              />
            ))}
          </Route>
        </Route>

        <Route element={<ProtectedRoute allow={["admin"]} />}>
          <Route element={<AdminLayout />}>
            {adminRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={route.element}
                handle={route.handle}
              />
            ))}
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </RouteTransition>
  );
}
