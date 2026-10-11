export type NavItem = {
  href: string;
  label: string;
  icon: 'dashboard' | 'sales' | 'commissions' | 'users' | 'building' | 'package' | 'receipt' | 'plus' | 'kanban';
};

export const adminNav: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
  { href: '/admin/crm', label: 'CRM · Funil', icon: 'kanban' },
  { href: '/admin/vendas', label: 'Vendas', icon: 'sales' },
  { href: '/admin/comissoes', label: 'Comissões', icon: 'commissions' },
  { href: '/admin/parceiros', label: 'Parceiros', icon: 'users' },
  { href: '/admin/estabelecimentos', label: 'Estabelecimentos', icon: 'building' },
  { href: '/admin/servicos', label: 'Serviços', icon: 'package' },
  { href: '/admin/custos', label: 'Custos', icon: 'receipt' },
];

export const partnerNav: NavItem[] = [
  { href: '/parceiro', label: 'Dashboard', icon: 'dashboard' },
  { href: '/parceiro/crm', label: 'CRM · Funil', icon: 'kanban' },
  { href: '/parceiro/vendas/nova', label: 'Nova venda', icon: 'plus' },
  { href: '/parceiro/vendas', label: 'Minhas vendas', icon: 'sales' },
  { href: '/parceiro/estabelecimentos', label: 'Estabelecimentos', icon: 'building' },
  { href: '/parceiro/comissoes', label: 'Comissões', icon: 'commissions' },
];
