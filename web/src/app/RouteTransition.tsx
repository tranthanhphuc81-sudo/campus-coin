import { useMemo } from "react";
import { useLocation } from "react-router-dom";

type RouteTransitionProps = {
  children: React.ReactNode;
};

export default function RouteTransition({ children }: RouteTransitionProps) {
  const location = useLocation();
  const transitionKey = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search],
  );

  return (
    <div key={transitionKey} className="route-transition" role="presentation">
      {children}
    </div>
  );
}
