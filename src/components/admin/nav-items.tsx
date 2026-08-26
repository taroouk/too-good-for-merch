import {
  CustomersIcon,
  DashboardIcon,
  OrdersIcon,
  PaymentsIcon,
  PricingIcon,
  ProductsIcon,
  SettingsIcon,
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
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/admin/products", label: "Products", icon: ProductsIcon },
      { href: "/admin/pricing", label: "Pricing", icon: PricingIcon },
    ],
  },
  { label: "Accounts", items: [{ href: "/admin/users", label: "Customers", icon: CustomersIcon }] },
  { label: "System", items: [{ href: "/admin/settings", label: "Settings", icon: SettingsIcon }] },
];

export function isNavItemActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
