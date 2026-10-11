'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Building2, Columns3, LayoutDashboard, LogOut, Menu, Package, Plus, Receipt, ShoppingBag, Users, WalletCards, X } from 'lucide-react';
import type { NavItem } from '@/lib/nav';

const ICONS = {
  dashboard: LayoutDashboard,
  sales: ShoppingBag,
  commissions: WalletCards,
  users: Users,
  building: Building2,
  package: Package,
  receipt: Receipt,
  plus: Plus,
  kanban: Columns3,
};

export function AppShell({
  items,
  userName,
  roleLabel,
  children,
}: {
  items: NavItem[];
  userName: string;
  roleLabel: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // item mais específico que combina com a rota atual
  const activeHref = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="app">
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Navegação principal">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div className="brand-name">
            CÓRTEX<span className="brand-sub">PARTNERS</span>
          </div>
        </div>
        <nav className="nav">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <Link key={item.href} href={item.href} className={item.href === activeHref ? 'active' : undefined}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            {userName}
            <small>{roleLabel}</small>
          </div>
          <form action="/auth/sair" method="post">
            <button className="signout" type="submit">
              <LogOut size={17} /> Sair
            </button>
          </form>
        </div>
      </aside>

      <div className={`scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} />

      <div className="main">
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark">C</div>
            <div className="brand-name">CÓRTEX</div>
          </div>
          <button className="menu-btn" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Fechar menu' : 'Abrir menu'}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
