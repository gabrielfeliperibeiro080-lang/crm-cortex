'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function RevenueChart({ data }: { data: { dia: string; valor: number }[] }) {
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#e9edf4" />
        <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6b7a93' }} interval="preserveStartEnd" />
        <YAxis tickLine={false} axisLine={false} width={54} tick={{ fontSize: 11, fill: '#6b7a93' }} tickFormatter={(v) => `R$${v}`} />
        <Tooltip formatter={(v) => brl(Number(v))} labelFormatter={(l) => `Dia ${l}`} cursor={{ fill: '#f1f4f9' }} />
        <Bar dataKey="valor" name="Faturamento" fill="#0a4fd7" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
