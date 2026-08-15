import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Minus, Plus, Trash2, ShoppingBag, Lock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import api, { brl, formatApiErrorDetail } from "../lib/apiClient";
import { toast } from "sonner";

export default function CartDrawer({ open, onOpenChange }) {
  const { items, updateQty, remove, total } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const checkout = async () => {
    if (!user) {
      onOpenChange(false);
      navigate("/login");
      toast.info("Entre para finalizar o pedido");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        items: items.map((i) => ({ product_id: i.product_id, size: i.size, quantity: i.quantity })),
        origin_url: window.location.origin,
      };
      const { data } = await api.post("/orders/checkout", payload);
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md p-0" data-testid="cart-drawer">
        <SheetHeader className="p-6 pb-2">
          <SheetTitle className="font-display text-3xl font-semibold tracking-tight text-left">
            Seu carrinho
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <ShoppingBag className="h-10 w-10 opacity-40" />
            <p>Seu carrinho está vazio</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 space-y-4 py-2">
            {items.map((i) => (
              <div
                key={`${i.product_id}-${i.size}`}
                className="flex gap-3"
                data-testid={`cart-item-${i.product_id}`}
              >
                <img
                  src={i.image_url}
                  alt={i.name}
                  className="h-20 w-20 rounded-xl object-cover border border-border"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{i.size}</p>
                  <p className="text-sm text-muted-foreground">{brl(i.price)}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-secondary"
                      onClick={() => updateQty(i.product_id, i.size, i.quantity - 1)}
                      data-testid={`cart-dec-${i.product_id}`}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-medium">{i.quantity}</span>
                    <button
                      className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-secondary disabled:opacity-40"
                      onClick={() => updateQty(i.product_id, i.size, Math.min(i.quantity + 1, i.stock))}
                      disabled={i.quantity >= i.stock}
                      data-testid={`cart-inc-${i.product_id}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      className="ml-auto text-muted-foreground hover:text-red-600 transition-colors"
                      onClick={() => remove(i.product_id, i.size)}
                      data-testid={`cart-remove-${i.product_id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <div className="sticky bottom-0 border-t border-border bg-card p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-display font-semibold text-3xl" data-testid="cart-total">
                {brl(total)}
              </span>
            </div>
            <Button
              className="w-full rounded-full"
              size="lg"
              onClick={checkout}
              disabled={loading}
              data-testid="checkout-btn"
            >
              <Lock className="h-4 w-4 mr-2" />
              {loading ? "Redirecionando…" : "Pagar e finalizar"}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              O pedido é confirmado somente após o pagamento seguro via Stripe.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
