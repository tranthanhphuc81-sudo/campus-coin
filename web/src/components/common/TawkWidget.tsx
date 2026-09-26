import { useEffect } from "react";

export default function TawkWidget() {
  useEffect(() => {
    const propertyId = import.meta.env.VITE_TAWK_PROPERTY_ID;
    const widgetId = import.meta.env.VITE_TAWK_WIDGET_ID;
    if (
      !propertyId ||
      !widgetId ||
      document.querySelector("script[data-campus-coin-tawk]") ||
      window.Tawk_API
    ) {
      return;
    }

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://embed.tawk.to/${encodeURIComponent(propertyId)}/${encodeURIComponent(widgetId)}`;
    script.dataset.campusCoinTawk = "true";
    script.crossOrigin = "anonymous";
    document.body.appendChild(script);
  }, []);

  return null;
}
