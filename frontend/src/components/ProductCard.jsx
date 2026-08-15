import { useState } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, AlertTriangle, Clock, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brl } from "../lib/apiClient";
import { useCart } from "../context/CartContext";
import { toast } from "sonner";

export default function ProductCard({ product, index = 0 }) {
  const { add } = useCart();
  const [selected, setSelected] = useState(product.variants[0]?.size);
  const variant = product.variants.find((v) => v.size === selected) || product.variants[0];

  const promo = product.on_promotion && product.discount_percent > 0;
  const finalPrice = promo ? variant.price * (1 - product.discount_percent / 100) : variant.price;
  const outOfStock = variant.stock <= 0;
  const lowStock = variant.stock === 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: (index % 8) * 0.06 }}
      className="group relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden"
      data-testid={`product-card-${product.id}`}
    >
      <div className="relative aspect-square overflow-hidden bg-secondary">
        <img
          src={product.image_url}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {promo && (
          <span
            className="absolute top-3 left-3 rounded-full bg-[hsl(var(--accent))] text-white text-xs font-bold px-3 py-1 shadow-lg"
            data-testid={`promo-badge-${product.id}`}
          >
            -{product.discount_percent}%
          </span>
        )}
        {lowStock && (
          <span
            className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-red-600 text-white text-xs font-bold px-3 py-1 animate-pulse-alert"
            data-testid={`low-stock-badge-${product.id}`}
          >
            <AlertTriangle className="h-3 w-3" /> Última peça
          </span>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
            <span className="font-display text-2xl font-semibold">Esgotado</span>
          </div>
        )}
      </div>

      <div className="flex flex-col flex-1 p-5">
        <span className="text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--accent))] font-semibold">
          {product.category}
        </span>
        <h3 className="mt-1 font-display font-semibold text-2xl leading-none">{product.name}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">Aroma: {product.aroma}</p>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{product.description}</p>

        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {variant.burn_hours}h
          </span>
          <span className="flex items-center gap-1">
            <Flame className="h-3.5 w-3.5" /> {variant.weight_g}g
          </span>
        </div>

        {product.variants.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <button
                key={v.size}
                onClick={() => setSelected(v.size)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  selected === v.size
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-secondary"
                }`}
                data-testid={`variant-${product.id}-${v.size.replace(/\s/g, "")}`}
              >
                {v.size}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-end justify-between">
          <div>
            {promo && (
              <span className="block text-xs text-muted-foreground line-through">
                {brl(variant.price)}
              </span>
            )}
            <span className="font-display font-semibold text-3xl" data-testid={`price-${product.id}`}>
              {brl(finalPrice)}
            </span>
          </div>
          <span className="text-xs text-muted-foreground" data-testid={`stock-${product.id}`}>
            {outOfStock ? "Esgotado" : `${variant.stock} em estoque`}
          </span>
        </div>

        <Button
          className="mt-4 rounded-full w-full"
          disabled={outOfStock}
          onClick={() => {
            add(product, variant);
            toast.success(`${product.name} (${variant.size}) adicionado`);
          }}
          data-testid={`add-to-cart-${product.id}`}
        >
          <ShoppingBag className="h-4 w-4 mr-2" />
          {outOfStock ? "Indisponível" : "Adicionar"}
        </Button>
      </div>
    </motion.div>
  );
}
