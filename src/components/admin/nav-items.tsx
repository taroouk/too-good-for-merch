import {
  AuditIcon,
  CustomersIcon,
  ImageIcon,
  DashboardIcon,
  OrdersIcon,
  PaymentsIcon,
  PricingIcon,
  ProductsIcon,
  PulseIcon,
  SettingsIcon,
  TeamIcon,
} from "src/components/admin/ui/icons";

export type NavItem = { href: string; label: string; icon: (props: { className?: string }) => React.ReactElement };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { label: "Overview", items: [{ href: "/admin", label: "Overview", icon: DashboardIcon }] },
  {
    label: "Commerce",
    items: [
      { href: "/admin/orders", label: "Orders", icon: OrdersIcon },
      { href: "/admin/payments", label: "Payments", icon: PaymentsIcon },
      { href: "/admin/bespoke", label: "Bespoke Requests", icon: ProductsIcon },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/admin/products", label: "Products", icon: ProductsIcon },
      { href: "/admin/pricing", label: "Pricing", icon: PricingIcon },
      { href: "/admin/projects", label: "Projects", icon: ProductsIcon },
      { href: "/admin/artworks", label: "Artworks", icon: ImageIcon },
    ],
  },
  { label: "Accounts", items: [{ href: "/admin/users", label: "Customers", icon: CustomersIcon }] },
  {
    label: "System",
    items: [
      { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
      { href: "/admin/team", label: "Team", icon: TeamIcon },
      { href: "/admin/legal", label: "Legal pages", icon: AuditIcon },
      { href: "/admin/audit", label: "Audit log", icon: AuditIcon },
      { href: "/admin/system", label: "System health", icon: PulseIcon },
    ],
  },
];

export function isNavItemActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
