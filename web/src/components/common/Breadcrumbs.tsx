import { Link } from "react-router-dom";

import type { BreadcrumbItem } from "@/app/routes";

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  ariaLabel: string;
};

export default function Breadcrumbs({ items, ariaLabel }: BreadcrumbsProps) {
  return (
    <nav className="cc-breadcrumbs" aria-label={ariaLabel}>
      <ol>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`}>
              {item.to && !isLast ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
