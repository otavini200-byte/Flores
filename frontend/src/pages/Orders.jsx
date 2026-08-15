import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Package, Clock } from "lucide-react";
import api, { brl } from "../lib/apiClient";
import { Skeleton } from "@/components/ui/skeleton";

export const STATUS_META = {
  aguardando_pagamento: { label: "Aguardando pagamento", cls: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  confirmado: { label: "Confirmado", cls: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  em_producao: { label: "Em produção", cls: "bg-purple-500/10 text-purple-700 border-purple-500/20" },
  enviado: { label: "Enviado", cls: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20" },
  entregue: { label: "Entregue", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  cancelado: { label: "Cancelado", cls: "bg-red-500/10 text-red-700 border-red-500/20" },
};

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.aguardando_pagamento;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${meta.cls}`}
      data-testid={`status-badge-${status}`}
    >
      {meta.label}
    </span>
  );
}

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export default function Orders() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.get("/orders/my").then(({ data }) => setOrders(data)).catch(() => setOrders([]));
  }, []);

  return (
    <main className="pt-24 pb-20 max-w-4xl mx-auto px-6" data-testid="orders-page">
      <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter">Meus Pedidos</h1>
      <p className="mt-2 text-muted-foreground">Acompanhe o status e o histórico das suas compras.</p>

      {orders === null ? (
        <div className="mt-10 space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-muted-foreground">
          <Package className="h-10 w-10 opacity-40" />
          <p>Você ainda não fez nenhum pedido.</p>
        </div>
      ) : (
        <div className="mt-10 space-y-5">
          {orders.map((o, idx) => (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="rounded-2xl border border-border bg-card p-5 sm:p-6"
              data-testid={`order-${o.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-display font-bold">Pedido #{o.id.slice(0, 8)}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <Clock className="h-3 w-3" /> {fmtDate(o.created_at)}
                  </p>
                </div>
                <StatusBadge status={o.status} />
              </div>

              <div className="mt-4 divide-y divide-border">
                {o.items.map((it) => (
                  <div key={it.product_id} className="flex items-center gap-3 py-2.5">
                    <img src={it.image_url} alt={it.name} className="h-12 w-12 rounded-lg object-cover border border-border" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{it.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {it.quantity} × {brl(it.price)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">{brl(it.price * it.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-display font-extrabold text-lg">{brl(o.total)}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </main>
  );
}
